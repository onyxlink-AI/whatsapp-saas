import { createClient as createSbClient } from "@supabase/supabase-js";
import { generateChatReply } from "@/features/inbox/services/openrouter";
import type { ConversationTurn } from "@/features/inbox/services/conversation-history";
import type { DealStage } from "@/features/pipeline/types";

// pipeline-suggestion.ts — Sugerencias de Pipeline con IA (opt-in, add-on
// facturable aparte). A diferencia de la primera versión (que solo sugería y
// esperaba aprobación humana), esto MUEVE el deal directamente en tiempo real
// — no hay paso de aprobación. Solo corre para el agente activo si tiene
// "Funciones de Setter" activadas en su config (independiente de su `type` —
// no tiene que ser un agente "setter"), Y el workspace tiene
// pipeline_ai_enabled. Fire-and-forget desde buffer.ts, nunca lanza hacia
// processNextBatch.
//
// El embudo son 4 fases fijas del negocio (no las 6 etapas B2B genéricas de
// antes): exploración → interés → listo_para_comprar → cliente. "lost" sigue
// existiendo como estado manual/terminal, pero el clasificador nunca lo
// asigna — solo avanza el embudo hacia adelante.

const CHEAP_MODEL = "openai/gpt-4o-mini";

// Solo las 4 fases del embudo automático — "lost" queda fuera a propósito.
const AUTO_PHASES: DealStage[] = ["exploracion", "interes", "listo_para_comprar", "cliente"];
const PHASE_RANK: Record<string, number> = {
  exploracion: 0,
  interes: 1,
  listo_para_comprar: 2,
  cliente: 3,
};
// A partir de qué fase merece la pena crear un deal si el contacto no tiene
// ninguno todavía — "exploración" sola (solo curiosidad) no crea nada.
const MIN_PHASE_TO_CREATE_DEAL: DealStage = "interes";

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

const MAX_NOTES_LENGTH = 4000;

// Appends a timestamped entry instead of overwriting, so notes build into a
// running log a human can scroll through — trims the oldest entries once the
// log gets too long instead of growing forever.
function appendNote(existing: string | null | undefined, newNote: string): string {
  const timestamp = new Date().toLocaleString("es-ES", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
  const entry = `[${timestamp}] ${newNote}`;
  const lines = existing ? [...existing.split("\n"), entry] : [entry];
  while (lines.join("\n").length > MAX_NOTES_LENGTH && lines.length > 1) {
    lines.shift();
  }
  return lines.join("\n");
}

// Replaces the deal's "next step" task: cancels whatever was still open
// (superseded now that the phase advanced) and opens a fresh one, so the
// Tareas list always shows exactly one current action instead of piling up.
async function refreshNextStepTask(
  db: ReturnType<typeof svc>,
  opts: { workspaceId: string; dealId: string; contactId: string; nextStep: string },
): Promise<void> {
  const { workspaceId, dealId, contactId, nextStep } = opts;
  if (!nextStep) return;

  await db
    .from("tasks")
    .update({ status: "cancelled" })
    .eq("deal_id", dealId)
    .in("status", ["pending", "in_progress"]);

  await db.from("tasks").insert({
    workspace_id: workspaceId,
    deal_id: dealId,
    contact_id: contactId,
    title: nextStep.slice(0, 200),
    task_type: "follow_up",
    status: "pending",
  });
}

function safeParseJson(text: string): Record<string, unknown> | null {
  try {
    const cleaned = text.replace(/```json/gi, "").replace(/```/g, "").trim();
    const parsed = JSON.parse(cleaned);
    return typeof parsed === "object" && parsed !== null
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

const CLASSIFIER_SYSTEM_PROMPT = `Eres un clasificador del embudo de ventas de un negocio de reservas. Analiza la conversación y determina en qué fase se encuentra el contacto AHORA MISMO. El embudo normalmente solo avanza — no retrocedas de fase salvo que la conversación contradiga claramente una fase anterior.

Fases (en orden):

1. "exploracion" — el contacto está descubriendo el servicio y todavía necesita información.
   Señales: hace preguntas sobre el servicio o cómo funciona; solicita información general; pregunta por disponibilidad o fechas; muestra curiosidad pero todavía no habla de contratar; pregunta cómo puede reservar o cuál es el proceso.

2. "interes" — el contacto demuestra una intención real de contratar.
   Señales: quiere realizar una reserva; confirma una fecha u horario; facilita datos personales necesarios para la reserva; pregunta qué necesita hacer para continuar; confirma que quiere seguir adelante con el proceso.

3. "listo_para_comprar" — el contacto solo necesita completar el pago para convertirse en cliente.
   Señales: habla de realizar el pago; solicita el enlace o método de pago; pregunta cómo pagar; indica que va a pagar en ese momento; confirma que va a completar el pago de forma inmediata.

4. "cliente" — el pago ya se ha realizado.
   Señales: dice explícitamente que ya ha pagado; envía un comprobante o justificante de pago; indica que la transferencia, Bizum o pago ya está hecho; menciona que el dinero ya ha sido enviado; cualquier mensaje cuyo significado implique claramente que el pago ya se ha completado, aunque no use exactamente la expresión "he pagado".

Responde SOLO con un objeto JSON con estos campos:
{
  "phase": "exploracion" | "interes" | "listo_para_comprar" | "cliente",
  "reason": "motivo breve de por qué está en esa fase",
  "notes": "1-3 frases con el contexto importante para dar seguimiento comercial: qué necesita el cliente, qué preguntó, objeciones, fechas, cualquier detalle útil para quien retome la conversación",
  "next_step": "acción concreta y breve que el equipo debe hacer a continuación (ej: 'Confirmar que el pago fue recibido', 'Llamar para resolver duda sobre el precio', 'Enviar recordatorio de la cita')"
}
NUNCA incluyas contraseñas, datos bancarios completos ni información sensible innecesaria en ningún campo.`;

interface ClassifyParams {
  workspaceId: string;
  conversationId: string;
  contactId: string;
  history: ConversationTurn[];
  mergedText: string;
  replyText: string;
}

export async function runPipelineClassification(
  params: ClassifyParams,
): Promise<void> {
  const { workspaceId, conversationId, contactId, history, mergedText, replyText } =
    params;
  const db = svc();

  try {
    const { data: existingDeal } = await db
      .from("deals")
      .select("id, stage, workspace_id")
      .eq("workspace_id", workspaceId)
      .eq("contact_id", contactId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const transcript =
      history.map((t) => `${t.role}: ${t.content}`).join("\n") +
      `\nuser: ${mergedText}` +
      `\nassistant: ${replyText}`;

    const reply = await generateChatReply({
      model: CHEAP_MODEL,
      systemPrompt: CLASSIFIER_SYSTEM_PROMPT,
      messages: [{ role: "user", content: transcript }],
      maxOutputTokens: 150,
      workspaceId,
    });

    const parsed = safeParseJson(reply.text);
    if (!parsed) return;

    const phase =
      typeof parsed.phase === "string" && AUTO_PHASES.includes(parsed.phase as DealStage)
        ? (parsed.phase as DealStage)
        : null;
    if (!phase) return;

    const reason =
      typeof parsed.reason === "string" ? parsed.reason.trim().slice(0, 300) : "";
    const noteText =
      typeof parsed.notes === "string" ? parsed.notes.trim().slice(0, 500) : "";
    const nextStep =
      typeof parsed.next_step === "string" ? parsed.next_step.trim().slice(0, 200) : "";

    if (
      [reason, noteText, nextStep].some((v) => v && containsSensitiveData(v))
    ) {
      await db.from("events").insert({
        type: "pipeline_classification_sensitive_data_dropped",
        level: "warn",
        workspace_id: workspaceId,
        conversation_id: conversationId,
        payload: { contact_id: contactId },
      });
      return;
    }

    // ── No deal yet: only create one once there's real intent (>= "interes"). ──
    if (!existingDeal) {
      if (PHASE_RANK[phase] < PHASE_RANK[MIN_PHASE_TO_CREATE_DEAL]) return;

      const { data: contactRow } = await db
        .from("contacts")
        .select("name, phone")
        .eq("id", contactId)
        .maybeSingle();

      const { count } = await db
        .from("deals")
        .select("id", { count: "exact", head: true })
        .eq("workspace_id", workspaceId)
        .eq("stage", phase);

      const { data: created, error: createError } = await db
        .from("deals")
        .insert({
          workspace_id: workspaceId,
          contact_id: contactId,
          title: `Oportunidad — ${contactRow?.name || contactRow?.phone || "sin nombre"}`,
          stage: phase,
          position: count ?? 0,
          notes: noteText ? appendNote(null, noteText) : null,
        })
        .select("id")
        .single();

      if (createError || !created) {
        console.error("[pipeline-suggestion] deal creation failed:", createError?.message);
        return;
      }

      if (nextStep) {
        await refreshNextStepTask(db, {
          workspaceId,
          dealId: created.id,
          contactId,
          nextStep,
        });
      }

      console.info(
        `[pipeline-suggestion] created deal ${created.id} at "${phase}" for contact ${contactId}`,
      );
      await db.from("events").insert({
        type: "pipeline_stage_moved",
        level: "info",
        workspace_id: workspaceId,
        conversation_id: conversationId,
        payload: {
          contact_id: contactId,
          deal_id: created.id,
          action: "create",
          phase,
          reason,
          next_step: nextStep || null,
        },
      });
      return;
    }

    // ── Deal exists: only ever move forward, never regress. ────────────────────
    const currentRank = PHASE_RANK[existingDeal.stage] ?? -1;
    const nextRank = PHASE_RANK[phase];
    if (nextRank <= currentRank) return;

    const { count } = await db
      .from("deals")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", workspaceId)
      .eq("stage", phase);

    const { data: dealRow } = await db
      .from("deals")
      .select("notes")
      .eq("id", existingDeal.id)
      .maybeSingle();

    await db
      .from("deals")
      .update({
        stage: phase,
        position: count ?? 0,
        closed_at: phase === "cliente" ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
        notes: noteText ? appendNote(dealRow?.notes, noteText) : dealRow?.notes,
      })
      .eq("id", existingDeal.id);

    if (nextStep) {
      await refreshNextStepTask(db, {
        workspaceId,
        dealId: existingDeal.id,
        contactId,
        nextStep,
      });
    }

    console.info(
      `[pipeline-suggestion] moved deal ${existingDeal.id} from "${existingDeal.stage}" to "${phase}" (contact ${contactId})`,
    );
    await db.from("events").insert({
      type: "pipeline_stage_moved",
      level: "info",
      workspace_id: workspaceId,
      conversation_id: conversationId,
      payload: {
        contact_id: contactId,
        deal_id: existingDeal.id,
        action: "move",
        from: existingDeal.stage,
        phase,
        reason,
        next_step: nextStep || null,
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown error";
    console.error("[pipeline-suggestion] runPipelineClassification failed:", msg);
    await db
      .from("events")
      .insert({
        type: "pipeline_classification_error",
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

