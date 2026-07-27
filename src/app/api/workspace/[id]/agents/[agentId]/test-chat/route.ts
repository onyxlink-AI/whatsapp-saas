import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createClient as svcClient } from "@supabase/supabase-js";
import { generateChatReply } from "@/features/inbox/services/openrouter";
import { buildSystemPrompt } from "@/features/inbox/services/prompt-builder";
import {
  searchKb,
  formatKbContext,
  listKbSourceLinks,
  formatKbReferenceLinks,
} from "@/features/inbox/services/kb-service";
import {
  getBusinessInfo,
  buildBusinessInfoContext,
  buildNowContext,
} from "@/features/inbox/services/business-info";
import { getEnabledTools } from "@/features/tools/services/tool-configs";
import type { AgentConfig } from "@/features/agents/types";
import {
  loadTestAgent,
  resolveTestModel,
  resolveTestPrompt,
} from "@/features/agents/services/agent-test-context";

// POST /api/workspace/[id]/agents/[agentId]/test-chat
// In-UI playground: replies with the agent's model + (draft or published) prompt
// WITHOUT sending WhatsApp or persisting a conversation. Token cost is logged to
// `events` (type='agent_test_chat'), never to recordLlmUsage.

const Schema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().min(1).max(8000),
      }),
    )
    .min(1)
    .max(20),
  draftPromptBody: z.string().max(50_000).optional(),
  modelOverride: z.string().max(120).optional(),
});

function svc() {
  return svcClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; agentId: string }> },
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { id: workspaceId, agentId } = await params;

  // Require admin/manager.
  const { data: membership } = await supabase
    .from("memberships")
    .select("role")
    .eq("workspace_id", workspaceId)
    .eq("user_id", user.id)
    .eq("is_active", true)
    .maybeSingle();
  const role = (membership as { role?: string } | null)?.role;
  if (role !== "admin" && role !== "manager") {
    return NextResponse.json({ error: "Sin permisos" }, { status: 403 });
  }

  const parsed = Schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Datos inválidos" },
      { status: 400 },
    );
  }

  const db = svc();

  // Load the agent and defend against IDOR (workspace mismatch).
  const agent = await loadTestAgent(workspaceId, agentId);
  if (!agent) {
    return NextResponse.json(
      { error: "Agente no encontrado" },
      { status: 404 },
    );
  }

  // Resolve model + system prompt.
  const model = await resolveTestModel(
    workspaceId,
    agent,
    parsed.data.modelOverride,
  );
  const { promptBody, guardrails } = await resolveTestPrompt(
    workspaceId,
    agent.type,
    parsed.data.draftPromptBody,
  );

  // Mirror production (buffer.ts) exactly via the shared builder: business info,
  // KB search, response style, variable substitution and strict guardrails.
  const info = await getBusinessInfo(workspaceId);
  const businessName =
    ((info?.structured as { name?: string } | null)?.name as string) ??
    "tu negocio";
  const bizContext = buildBusinessInfoContext(info);
  const timeZone =
    ((info?.structured as { timezone?: string } | null)?.timezone as string) ??
    "America/Mexico_City";

  // KB: search with the latest user message, just like buffer.ts.
  const lastUserMessage =
    [...parsed.data.messages].reverse().find((m) => m.role === "user")
      ?.content ?? "";
  const [kbResults, kbLinks] = await Promise.all([
    searchKb(workspaceId, lastUserMessage, 3),
    listKbSourceLinks(workspaceId),
  ]);
  const kbContext = [
    formatKbContext(kbResults),
    formatKbReferenceLinks(kbLinks),
  ]
    .filter(Boolean)
    .join("\n\n");

  const agentConfig = (agent.config ?? {}) as AgentConfig;
  const systemPrompt = buildSystemPrompt({
    nowContext: buildNowContext(timeZone),
    bizContext,
    promptBase: promptBody,
    kbContext,
    responseStyle: agentConfig.responseStyle ?? null,
    guardrails,
    vars: {
      agentName: agent.name as string,
      businessName,
      contactName: "",
    },
  });

  try {
    // Enable the workspace's tools in the playground so the agent behaves like
    // it would in production, but NEVER let it act for real: simulateTools
    // makes the registry short-circuit every tool call into a canned
    // "here's what I would have done" message instead of really booking,
    // posting to a webhook, or calling a live calendar API. This is a test
    // conversation — it must never create real appointments, contacts, or
    // side effects. The playground has no live conversation, so the tool
    // context carries only the workspace; tools that need a contact
    // (booking) take an explicit contact_phone arg instead.
    const tools = await getEnabledTools(workspaceId);
    const reply = await generateChatReply({
      model,
      systemPrompt,
      messages: parsed.data.messages,
      maxOutputTokens: 700,
      workspaceId,
      tools,
      toolContext: {
        workspaceId,
        conversationId: "",
        contactId: "",
      },
      simulateTools: true,
    });

    // Best-effort observability — never blocks the response.
    void db
      .from("events")
      .insert({
        workspace_id: workspaceId,
        type: "agent_test_chat",
        payload: {
          agent_id: agentId,
          model,
          input_tokens: reply.promptTokens,
          output_tokens: reply.completionTokens,
        },
      })
      .then(
        () => undefined,
        () => undefined,
      );

    return NextResponse.json({
      text: reply.text,
      inputTokens: reply.promptTokens,
      outputTokens: reply.completionTokens,
      model,
      simulatedToolCalls: reply.simulatedToolCalls ?? [],
    });
  } catch (err) {
    console.error("[agents/test-chat]", err);
    // Admin-only playground — surface the real reason so it's diagnosable
    // (model id, rate limit, upstream 502…) instead of a generic message.
    const detail = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: `No se pudo generar la respuesta (${model}): ${detail}` },
      { status: 502 },
    );
  }
}
