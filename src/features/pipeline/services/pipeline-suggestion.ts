import { createClient as createSbClient } from "@supabase/supabase-js";
import { generateChatReply } from "@/features/inbox/services/openrouter";
import type { ConversationTurn } from "@/features/inbox/services/conversation-history";
import { DEAL_STAGES, type DealStage } from "@/features/pipeline/types";

// pipeline-suggestion.ts — Sugerencias de Pipeline con IA (opt-in, add-on
// facturable aparte). Tras cada batch, si el workspace tiene
// pipeline_ai_enabled, evalúa con un modelo barato en qué etapa del pipeline
// encaja mejor el contacto y escribe SOLO una sugerencia — nunca mueve nada
// directamente. Un humano acepta o descarta desde el tablero /pipeline.
// Fire-and-forget desde buffer.ts, nunca lanza hacia processNextBatch.

const CHEAP_MODEL = "openai/gpt-4o-mini";

// Same defense-in-depth idea as memory-extraction.ts's containsSensitiveData
// — the "reason" is short business rationale, but never trust free text.
const SENSITIVE_PATTERNS = [
  /\b(?:\d[ -]?){13,19}\b/,
  /\b(contrase[ñn]a|password|pin|cvv|cvc)\b\s*[:=]?\s*\S+/i,
];
function containsSensitiveData(value: string): boolean {
  return SENSITIVE_PATTERNS.some((re) => re.test(value));
}

function svc() {
  return createSbClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export async function isPipelineAiEnabled(
  workspaceId: string,
): Promise<boolean> {
  const supabase = svc();
  const { data } = await supabase
    .from("workspaces")
    .select("pipeline_ai_enabled")
    .eq("id", workspaceId)
    .maybeSingle();
  return data?.pipeline_ai_enabled === true;
}

function safeParseJson(text: string): Record<string, unknown> | null {
  try {
    const cleaned = text
      .replace(/```json/gi, "")
      .replace(/```/g, "")
      .trim();
    const parsed = JSON.parse(cleaned);
    return typeof parsed === "object" && parsed !== null
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

const SUGGESTION_SYSTEM_PROMPT = `Eres un asistente que analiza conversaciones de WhatsApp y sugiere en qué etapa del pipeline de ventas encaja mejor un contacto. NUNCA decides tú, solo sugieres — un humano decide si aplicar el cambio.

Etapas disponibles: new (nuevo), contacted (contactado), proposal_sent (propuesta enviada), negotiation (negociación), won (ganado), lost (perdido).

Recibes el estado actual (si ya tiene un deal en el pipeline y en qué etapa, o si no tiene ninguno) y la transcripción de la conversación. Responde SOLO con un objeto JSON:
{ "action": "move_deal" | "create_deal" | "no_suggestion", "stage": "<una de las etapas>", "reason": "motivo breve en una frase" }

- Usa "move_deal" si ya tiene un deal y la conversación aporta evidencia clara de que debería estar en OTRA etapa distinta a la actual.
- Usa "create_deal" si NO tiene ningún deal todavía y la conversación muestra una oportunidad de venta real (interés genuino, no solo un saludo).
- Usa "no_suggestion" si no hay evidencia suficiente, o si la etapa actual ya es la correcta. Ante la duda, responde "no_suggestion" — es preferible no sugerir nada a sugerir mal.

REGLAS ESTRICTAS — nunca incluyas contraseñas, datos de tarjetas/bancarios ni información sensible innecesaria en "reason".`;

interface SuggestParams {
  workspaceId: string;
  conversationId: string;
  contactId: string;
  history: ConversationTurn[];
  mergedText: string;
  replyText: string;
}

export async function suggestPipelineStage(
  params: SuggestParams,
): Promise<void> {
  const { workspaceId, conversationId, contactId, history, mergedText, replyText } =
    params;
  const db = svc();

  try {
    const { data: existingDeal } = await db
      .from("deals")
      .select("id, stage, ai_suggested_stage")
      .eq("workspace_id", workspaceId)
      .eq("contact_id", contactId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const currentStateText = existingDeal
      ? `Ya tiene un deal en el pipeline, etapa actual: "${existingDeal.stage}".`
      : "No tiene ningún deal en el pipeline todavía.";

    const transcript =
      history.map((t) => `${t.role}: ${t.content}`).join("\n") +
      `\nuser: ${mergedText}` +
      `\nassistant: ${replyText}`;

    const reply = await generateChatReply({
      model: CHEAP_MODEL,
      systemPrompt: SUGGESTION_SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: `Estado actual: ${currentStateText}\n\nTranscripción:\n${transcript}`,
        },
      ],
      maxOutputTokens: 200,
      workspaceId,
    });

    const parsed = safeParseJson(reply.text);
    if (!parsed) return;

    const action = parsed.action;
    const stage =
      typeof parsed.stage === "string" && DEAL_STAGES.includes(parsed.stage as DealStage)
        ? (parsed.stage as DealStage)
        : null;
    const reason =
      typeof parsed.reason === "string" ? parsed.reason.trim().slice(0, 300) : "";

    if (reason && containsSensitiveData(reason)) {
      await db.from("events").insert({
        type: "pipeline_suggestion_sensitive_data_dropped",
        level: "warn",
        workspace_id: workspaceId,
        conversation_id: conversationId,
        payload: { contact_id: contactId },
      });
      return;
    }

    if (action === "move_deal" && existingDeal && stage) {
      if (stage === existingDeal.stage) {
        // Situation resolved itself — clear any stale suggestion.
        if (existingDeal.ai_suggested_stage) {
          await db
            .from("deals")
            .update({
              ai_suggested_stage: null,
              ai_suggested_reason: null,
              ai_suggested_at: null,
            })
            .eq("id", existingDeal.id);
        }
        return;
      }

      await db
        .from("deals")
        .update({
          ai_suggested_stage: stage,
          ai_suggested_reason: reason || null,
          ai_suggested_at: new Date().toISOString(),
        })
        .eq("id", existingDeal.id);

      console.info(
        `[pipeline-suggestion] suggested moving deal ${existingDeal.id} to "${stage}" (contact ${contactId})`,
      );

      await db.from("events").insert({
        type: "pipeline_stage_suggested",
        level: "info",
        workspace_id: workspaceId,
        conversation_id: conversationId,
        payload: { contact_id: contactId, deal_id: existingDeal.id, stage, reason },
      });
      return;
    }

    if (action === "create_deal" && !existingDeal && stage) {
      const { data: contactRow } = await db
        .from("contacts")
        .select("custom_fields")
        .eq("id", contactId)
        .maybeSingle();

      const customFields =
        (contactRow?.custom_fields as Record<string, unknown> | null) ?? {};

      await db
        .from("contacts")
        .update({
          custom_fields: {
            ...customFields,
            ai_suggested_deal_stage: stage,
            ai_suggested_deal_reason: reason || null,
            ai_suggested_deal_at: new Date().toISOString(),
          },
        })
        .eq("id", contactId);

      console.info(
        `[pipeline-suggestion] suggested creating a deal for contact ${contactId} at stage "${stage}"`,
      );

      await db.from("events").insert({
        type: "pipeline_stage_suggested",
        level: "info",
        workspace_id: workspaceId,
        conversation_id: conversationId,
        payload: { contact_id: contactId, deal_id: null, stage, reason },
      });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown error";
    console.error("[pipeline-suggestion] suggestPipelineStage failed:", msg);
    await db
      .from("events")
      .insert({
        type: "pipeline_suggestion_error",
        level: "error",
        workspace_id: workspaceId,
        conversation_id: conversationId,
        payload: { error: msg, contact_id: contactId },
      })
      .then(
        () => {},
        () => {},
      );
  }
}
