/**
 * POST /api/webhooks/vapi
 *
 * Receives Vapi "end-of-call-report" server messages and upserts them into
 * voice_calls. Configure this URL as the assistant's serverUrl in Vapi, with
 * serverMessages restricted to ["end-of-call-report"] so this route doesn't
 * have to filter out partial-transcript / status-update noise.
 *
 * Auth: shared secret via the `x-vapi-secret` header (Vapi's serverUrlSecret
 * mechanism), constant-time compared against VAPI_WEBHOOK_SECRET — same
 * pattern as the HighLevel webhook's safeEqual check.
 *
 * Workspace resolution: by assistantId (WHERE vapi_assistant_id = payload's
 * assistant id), not a ?wsid= param — Vapi's payload has no concept of our
 * workspace, so the assistant id IS the tenant key here. If no workspace
 * claims that assistant id (e.g. a Vapi assistant belonging to a different,
 * unrelated project), we return 200/skipped rather than 404, so Vapi doesn't
 * retry forever for calls we will never be able to route.
 */

import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { createClient as createSbClient } from "@supabase/supabase-js";
import {
  normalizePhone,
  DEFAULT_COUNTRY_CODE,
} from "@/features/inbox/services/normalizer";
import {
  isPipelineAiEnabled,
  runPipelineClassification,
} from "@/features/pipeline/services/pipeline-suggestion";
import { isAdvancedMemoryEnabled } from "@/features/inbox/services/contact-memory";
import { extractContactMemory } from "@/features/inbox/services/memory-extraction";

function svc() {
  return createSbClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

// Resolves (or creates) the SAME contacts row WhatsApp uses, so a lead who
// calls and later WhatsApps (or vice versa) is one contact/deal, not two —
// same upsert-by-(workspace_id,phone) pattern as normalizer.ts's processInbound.
async function resolveContactForCall(
  supabase: ReturnType<typeof svc>,
  workspaceId: string,
  rawPhone: string,
): Promise<{ id: string } | null> {
  const { data: biRow } = await supabase
    .from("business_info")
    .select("structured")
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  const defaultCc =
    ((biRow?.structured as { default_country_code?: string } | null)
      ?.default_country_code as string) ?? DEFAULT_COUNTRY_CODE;

  const phone = normalizePhone(rawPhone, defaultCc);

  const { data: contact, error } = await supabase
    .from("contacts")
    .upsert(
      {
        workspace_id: workspaceId,
        phone,
        opt_in: true,
        opt_in_at: new Date().toISOString(),
      },
      { onConflict: "workspace_id,phone", ignoreDuplicates: false },
    )
    .select("id")
    .single();

  if (error || !contact) {
    console.error("[vapi webhook] contact upsert failed:", error?.message);
    return null;
  }

  return contact as { id: string };
}

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

// Vapi's payload shape varies slightly by API version; every field below is
// read defensively (optional chaining + fallbacks) and the full body is
// always stored in raw_payload regardless, so nothing is lost if a field
// name guess is wrong.
interface VapiCall {
  id?: string;
  assistantId?: string;
  cost?: number;
  startedAt?: string;
  endedAt?: string;
  customer?: { number?: string };
  status?: string;
}

interface VapiToolCallMessage {
  role?: string;
  toolCalls?: { function?: { name?: string; arguments?: string } }[];
}

interface VapiMessage {
  type?: string;
  call?: VapiCall;
  assistant?: { id?: string };
  transcript?: string;
  summary?: string;
  endedReason?: string;
  cost?: number;
  costBreakdown?: { total?: number };
  startedAt?: string;
  endedAt?: string;
  analysis?: {
    summary?: string;
    structuredData?: Record<string, unknown> | null;
  };
  artifact?: { transcript?: string; messages?: VapiToolCallMessage[] };
  messages?: VapiToolCallMessage[];
}

interface VapiWebhookBody {
  message?: VapiMessage;
}

/**
 * The lead status isn't in Vapi's own `analysis.structuredData` (that
 * requires configuring `analysisPlan.structuredDataPlan`, which costs extra
 * per call). Instead, read it straight from the `save_lead` tool call(s) the
 * assistant already makes — the LAST call's `fields.Estado` is authoritative
 * (the prompt's "guardado temprano" safety net means save_lead can fire more
 * than once per call; the final one has the most complete data).
 */
function extractLeadStatus(messages: VapiToolCallMessage[] | undefined): string | null {
  if (!Array.isArray(messages)) return null;
  let lastEstado: string | null = null;
  for (const m of messages) {
    if (!Array.isArray(m.toolCalls)) continue;
    for (const tc of m.toolCalls) {
      if (tc.function?.name !== "save_lead") continue;
      try {
        const parsed = JSON.parse(tc.function.arguments ?? "{}") as {
          fields?: { Estado?: unknown };
        };
        const estado = parsed.fields?.Estado;
        if (typeof estado === "string") lastEstado = estado;
      } catch {
        // malformed arguments — skip, keep whatever we already had
      }
    }
  }
  return lastEstado;
}

export async function POST(req: NextRequest) {
  const secret = process.env.VAPI_WEBHOOK_SECRET;
  const provided = req.headers.get("x-vapi-secret");

  if (!secret || !provided || !safeEqual(provided, secret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: VapiWebhookBody;
  try {
    body = (await req.json()) as VapiWebhookBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const message = body.message;
  if (!message || message.type !== "end-of-call-report") {
    return NextResponse.json({ ok: true, skipped: "not-end-of-call-report" });
  }

  const call = message.call;
  const assistantId = call?.assistantId ?? message.assistant?.id ?? null;
  const vapiCallId = call?.id ?? null;

  if (!assistantId || !vapiCallId) {
    return NextResponse.json({ ok: true, skipped: "missing-assistant-or-call-id" });
  }

  const supabase = svc();

  const { data: workspace } = await supabase
    .from("workspaces")
    .select("id")
    .eq("vapi_assistant_id", assistantId)
    .maybeSingle();

  if (!workspace) {
    // No workspace claims this assistant — 200 so Vapi doesn't retry.
    return NextResponse.json({ ok: true, skipped: "no-workspace-for-assistant" });
  }

  const startedAt = call?.startedAt ?? message.startedAt ?? null;
  const endedAt = call?.endedAt ?? message.endedAt ?? null;
  const durationSeconds =
    startedAt && endedAt
      ? Math.max(0, Math.round((new Date(endedAt).getTime() - new Date(startedAt).getTime()) / 1000))
      : null;

  const customerNumber = call?.customer?.number ?? null;
  const transcript = message.transcript ?? message.artifact?.transcript ?? null;
  const summary = message.summary ?? message.analysis?.summary ?? null;

  const { data: voiceCall, error } = await supabase
    .from("voice_calls")
    .upsert(
      {
        workspace_id: workspace.id as string,
        vapi_call_id: vapiCallId,
        assistant_id: assistantId,
        status: call?.status ?? "ended",
        ended_reason: message.endedReason ?? null,
        started_at: startedAt,
        ended_at: endedAt,
        duration_seconds: durationSeconds,
        // message.cost is the authoritative total (matches costBreakdown.total);
        // call.cost is separate and was observed to always be 0 — do NOT prefer
        // it via `??`, since 0 is not nullish and would silently win.
        cost: message.cost ?? message.costBreakdown?.total ?? null,
        customer_number: customerNumber,
        transcript,
        summary,
        lead_status: extractLeadStatus(message.messages ?? message.artifact?.messages),
        raw_payload: body as unknown as Record<string, unknown>,
      },
      { onConflict: "vapi_call_id" },
    )
    .select("id")
    .single();

  if (error || !voiceCall) {
    console.error("[vapi webhook] failed to upsert voice_calls:", error);
    // 200 anyway — a DB hiccup shouldn't trigger a Vapi retry storm; the
    // raw payload is small enough that manual recovery from logs is viable.
    return NextResponse.json({ ok: true, synced: false });
  }

  // Link to the same contacts/pipeline graph WhatsApp uses — one contact per
  // phone number regardless of channel. Needs an actual phone number and
  // some transcript/summary content to be worth classifying.
  if (customerNumber) {
    const contact = await resolveContactForCall(
      supabase,
      workspace.id as string,
      customerNumber,
    );

    if (contact) {
      const { error: linkError } = await supabase
        .from("voice_calls")
        .update({ contact_id: contact.id })
        .eq("id", voiceCall.id);
      if (linkError) {
        console.error("[vapi webhook] failed to link contact_id:", linkError.message);
      }

      const callText = transcript ?? summary;
      if (callText) {
        const [pipelineEnabled, memoryEnabled] = await Promise.all([
          isPipelineAiEnabled(workspace.id as string),
          isAdvancedMemoryEnabled(workspace.id as string),
        ]);

        if (pipelineEnabled) {
          // Fire-and-forget — don't hold up the webhook response on the LLM call.
          void runPipelineClassification({
            workspaceId: workspace.id as string,
            conversationId: null,
            contactId: contact.id,
            history: [],
            mergedText: callText,
            replyText: "",
          });
        }

        // Memoria Inteligente Avanzada is per-CONTACT, not per-channel — this
        // is what actually "conecta" el asistente de voz con WhatsApp: once
        // this runs, the WhatsApp agent's next reply to this same contact
        // already has whatever this call revealed, and vice versa.
        if (memoryEnabled) {
          void extractContactMemory({
            workspaceId: workspace.id as string,
            conversationId: null,
            contactId: contact.id,
            history: [],
            mergedText: callText,
            replyText: "",
          });
        }
      }
    }
  }

  return NextResponse.json({ ok: true, synced: true });
}
