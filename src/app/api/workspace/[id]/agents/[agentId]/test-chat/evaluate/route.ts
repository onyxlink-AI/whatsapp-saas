import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createClient as svcClient } from "@supabase/supabase-js";
import { generateChatReply } from "@/features/inbox/services/openrouter";
import { getBusinessInfo } from "@/features/inbox/services/business-info";
import {
  loadTestAgent,
  resolveTestPrompt,
} from "@/features/agents/services/agent-test-context";

// POST /api/workspace/[id]/agents/[agentId]/test-chat/evaluate
// Analyzes a playground transcript against the agent's own prompt/guardrails
// and business info — suggestions only, never edits the prompt. Uses a cheap
// model, no tools, and never persists the transcript.

const CHEAP_MODEL = "openai/gpt-4o-mini";

const Schema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().min(1).max(8000),
      }),
    )
    .min(2)
    .max(20),
  draftPromptBody: z.string().max(50_000).optional(),
});

const EvaluationSchema = z.object({
  followed_prompt: z.enum(["si", "parcial", "no"]),
  used_business_info_correctly: z.enum(["si", "parcial", "no", "no_aplica"]),
  clarity: z.enum(["alta", "media", "baja"]),
  invented_information: z.boolean(),
  respected_restrictions: z.boolean(),
  asked_unnecessary_data: z.boolean(),
  handoff_awareness: z.enum(["correcto", "incorrecto", "no_aplica"]),
  recommendations: z.array(z.string().max(300)).max(8),
  summary: z.string().max(600),
});
export type ConversationEvaluation = z.infer<typeof EvaluationSchema>;

function svc() {
  return svcClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

function safeParseEvaluation(text: string): ConversationEvaluation | null {
  try {
    const cleaned = text
      .replace(/```json/gi, "")
      .replace(/```/g, "")
      .trim();
    return EvaluationSchema.parse(JSON.parse(cleaned));
  } catch {
    return null;
  }
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

  const agent = await loadTestAgent(workspaceId, agentId);
  if (!agent) {
    return NextResponse.json(
      { error: "Agente no encontrado" },
      { status: 404 },
    );
  }

  const { promptBody, guardrails } = await resolveTestPrompt(
    workspaceId,
    agent,
    parsed.data.draftPromptBody,
  );

  const info = await getBusinessInfo(workspaceId);
  const businessFacts = JSON.stringify(info?.structured ?? {});
  const businessFreeText = (info?.free_text ?? "").slice(0, 4000);

  const transcript = parsed.data.messages
    .map((m) => `${m.role === "user" ? "Cliente" : "Agente"}: ${m.content}`)
    .join("\n");

  const systemPrompt = `Eres un auditor de calidad de agentes de WhatsApp. Analiza la conversación de PRUEBA que te doy y evalúa si el "Agente" cumplió sus instrucciones. No converses, no le hables al cliente: solo audita.

INSTRUCCIONES QUE DEBÍA SEGUIR EL AGENTE:
"""
${promptBody}
"""

RESTRICCIONES/GUARDRAILS CONFIGURADOS:
${guardrails ? JSON.stringify(guardrails) : "(ninguno configurado)"}

INFORMACIÓN REAL DEL NEGOCIO (para verificar si el agente inventó datos):
Datos estructurados: ${businessFacts}
Texto libre: ${businessFreeText || "(vacío)"}

Responde SOLO con un objeto JSON válido, sin texto fuera de él, con estos campos exactos:
- "followed_prompt": "si" | "parcial" | "no"
- "used_business_info_correctly": "si" | "parcial" | "no" | "no_aplica" (no_aplica si no hubo oportunidad de usarla)
- "clarity": "alta" | "media" | "baja" (claridad de las respuestas del agente)
- "invented_information": boolean (¿inventó datos que no están en la información del negocio?)
- "respected_restrictions": boolean (¿respetó las restricciones/guardrails?)
- "asked_unnecessary_data": boolean (¿pidió datos que no necesitaba?)
- "handoff_awareness": "correcto" | "incorrecto" | "no_aplica" (¿supo derivar a una persona cuando correspondía?)
- "recommendations": array de hasta 6 strings con sugerencias CONCRETAS para mejorar el prompt (nunca reescribas el prompt completo, solo sugiere cambios puntuales)
- "summary": una frase resumen del desempeño del agente

No incluyas nada fuera del JSON.`;

  try {
    const reply = await generateChatReply({
      model: CHEAP_MODEL,
      systemPrompt,
      messages: [{ role: "user", content: transcript }],
      maxOutputTokens: 800,
      workspaceId,
      // No tools/toolContext: an evaluation is a text-only audit, it never
      // needs — and must never trigger — a tool call of any kind.
    });

    const evaluation = safeParseEvaluation(reply.text);
    if (!evaluation) {
      return NextResponse.json(
        { error: "No se pudo interpretar la evaluación del modelo" },
        { status: 502 },
      );
    }

    // Best-effort observability — never blocks the response, never stores the transcript.
    void svc()
      .from("events")
      .insert({
        workspace_id: workspaceId,
        type: "agent_test_chat_eval",
        payload: {
          agent_id: agentId,
          model: CHEAP_MODEL,
          input_tokens: reply.promptTokens,
          output_tokens: reply.completionTokens,
        },
      })
      .then(
        () => undefined,
        () => undefined,
      );

    return NextResponse.json({ evaluation, model: CHEAP_MODEL });
  } catch (err) {
    console.error("[agents/test-chat/evaluate]", err);
    const detail = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: `No se pudo evaluar la conversación: ${detail}` },
      { status: 502 },
    );
  }
}
