import { createClient as createSbClient } from "@supabase/supabase-js";
import { generateChatReply } from "./openrouter";
import { dispatchTemplate } from "./dispatch";
import { getApprovedTemplates } from "./template-actions";
import { fillTemplateVariables } from "./templates";
import { enforceCostPolicy } from "./cost-enforcer";
import { getContactMemory, formatMemoryContext } from "./contact-memory";

// cold-lead-recovery.ts — Recuperación de Leads Fríos con IA (opt-in, add-on
// facturable aparte). Proactivo, NO reactivo (a diferencia de todos los demás
// hooks de este archivo/feature, que corren tras un mensaje entrante): un
// cron diario escanea contactos fríos por workspace y, para cada uno, la IA
// decide si merece la pena reengancharlo. NUNCA redacta texto libre — WhatsApp
// lo prohíbe fuera de la ventana de 24h (ver 20260608000003_24h_guard.sql) —
// solo elige una plantilla ya APROBADA por Meta y rellena sus variables.

const CHEAP_MODEL = "openai/gpt-4o-mini";

const COLD_AFTER_HOURS = 72; // 3 days of silence before a contact is "cold"
const RE_EVALUATE_AFTER_DAYS = 7; // don't ask the LLM about the same contact more than weekly
const RE_CONTACT_AFTER_DAYS = 14; // don't send a second recovery message sooner than this
const MAX_CONTACTS_PER_WORKSPACE_PER_RUN = 15;
const MAX_CANDIDATES_SCANNED = 50; // fetch cap before JS filtering/debounce

function svc() {
  return createSbClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export async function isColdLeadRecoveryEnabled(
  workspaceId: string,
): Promise<boolean> {
  const supabase = svc();
  const { data } = await supabase
    .from("workspaces")
    .select("cold_lead_recovery_enabled")
    .eq("id", workspaceId)
    .maybeSingle();
  return data?.cold_lead_recovery_enabled === true;
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

const EVAL_SYSTEM_PROMPT = `Eres un asistente que decide si merece la pena reenganchar a un lead frío de WhatsApp (lleva días sin responder). NUNCA redactas el mensaje final — solo decides si vale la pena y, si sí, das un tema breve y personalizado para insertarlo en una plantilla ya aprobada tipo "Hola {{1}}, ¿seguimos con tu interés en {{2}}?".

Responde SOLO con un objeto JSON:
{ "worth_recovering": true | false, "topic": "frase corta para {{2}}, ej: 'automatizar tu WhatsApp'", "reason": "motivo breve" }

Marca worth_recovering=false si: la conversación terminó en un claro "no me interesa", ya se resolvió su duda, o no hay suficiente señal de interés real. Ante la duda, false — es preferible no molestar a molestar sin motivo.
NUNCA incluyas contraseñas, datos bancarios ni información sensible en "topic" o "reason".`;

interface ColdContactCandidate {
  contactId: string;
  conversationId: string;
  name: string | null;
  phone: string;
  customFields: Record<string, unknown>;
  daysSinceLastMessage: number;
}

function daysAgo(iso: string | null | undefined): number {
  if (!iso) return Infinity;
  return (Date.now() - new Date(iso).getTime()) / (1000 * 60 * 60 * 24);
}

async function findColdCandidates(
  workspaceId: string,
): Promise<ColdContactCandidate[]> {
  const supabase = svc();
  const cutoff = new Date(
    Date.now() - COLD_AFTER_HOURS * 60 * 60 * 1000,
  ).toISOString();

  const { data: conversations } = await supabase
    .from("conversations")
    .select("id, contact_id, last_message_at, contact:contacts(id,name,phone,opt_in,stage,custom_fields)")
    .eq("workspace_id", workspaceId)
    .lt("last_message_at", cutoff)
    .order("last_message_at", { ascending: true })
    .limit(MAX_CANDIDATES_SCANNED);

  if (!conversations) return [];

  const candidates: ColdContactCandidate[] = [];
  for (const conv of conversations as unknown as {
    id: string;
    contact_id: string;
    last_message_at: string | null;
    contact: {
      id: string;
      name: string | null;
      phone: string;
      opt_in: boolean;
      stage: string;
      custom_fields: Record<string, unknown> | null;
    } | null;
  }[]) {
    const contact = conv.contact;
    if (!contact) continue;
    if (!contact.opt_in) continue;
    if (contact.stage === "customer" || contact.stage === "lost") continue;

    const cf = contact.custom_fields ?? {};
    const lastEvaluated = cf.cold_recovery_last_evaluated_at as string | undefined;
    const lastContacted = cf.cold_recovery_last_contacted_at as string | undefined;
    if (daysAgo(lastEvaluated) < RE_EVALUATE_AFTER_DAYS) continue;
    if (daysAgo(lastContacted) < RE_CONTACT_AFTER_DAYS) continue;

    candidates.push({
      contactId: contact.id,
      conversationId: conv.id,
      name: contact.name,
      phone: contact.phone,
      customFields: cf,
      daysSinceLastMessage: Math.round(daysAgo(conv.last_message_at)),
    });
    if (candidates.length >= MAX_CONTACTS_PER_WORKSPACE_PER_RUN) break;
  }

  return candidates;
}

interface RunResult {
  evaluated: number;
  contacted: number;
  skipped: string | null;
}

export async function runColdLeadRecoveryForWorkspace(
  workspaceId: string,
): Promise<RunResult> {
  const db = svc();

  const costPolicy = await enforceCostPolicy(workspaceId);
  if (costPolicy.policy === "cut") {
    return { evaluated: 0, contacted: 0, skipped: "cost_policy_cut" };
  }

  const templates = await getApprovedTemplates(workspaceId);
  const recoveryTemplate =
    templates.find((t) => t.name === "seguimiento_de_interes") ??
    templates.find((t) => t.category === "marketing");
  if (!recoveryTemplate) {
    return { evaluated: 0, contacted: 0, skipped: "no_approved_template" };
  }

  const candidates = await findColdCandidates(workspaceId);
  let contacted = 0;

  for (const candidate of candidates) {
    try {
      const memory = await getContactMemory(candidate.contactId);
      const memoryBlock = formatMemoryContext(memory);

      const { data: recentMessages } = await db
        .from("messages")
        .select("direction, body, created_at")
        .eq("conversation_id", candidate.conversationId)
        .order("created_at", { ascending: false })
        .limit(10);

      const transcript = (recentMessages ?? [])
        .slice()
        .reverse()
        .map((m) => `${m.direction === "in" ? "Cliente" : "Agente"}: ${m.body}`)
        .join("\n");

      const reply = await generateChatReply({
        model: CHEAP_MODEL,
        systemPrompt: EVAL_SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content: `${memoryBlock ? memoryBlock + "\n\n" : ""}Última conversación (hace ${candidate.daysSinceLastMessage} días sin respuesta):\n${transcript || "(sin mensajes previos registrados)"}`,
          },
        ],
        maxOutputTokens: 150,
        workspaceId,
      });

      const parsed = safeParseJson(reply.text);
      const nextCustomFields = {
        ...candidate.customFields,
        cold_recovery_last_evaluated_at: new Date().toISOString(),
      };

      if (!parsed || parsed.worth_recovering !== true) {
        await db
          .from("contacts")
          .update({ custom_fields: nextCustomFields })
          .eq("id", candidate.contactId);
        await db.from("events").insert({
          type: "cold_lead_recovery_skipped",
          level: "debug",
          workspace_id: workspaceId,
          conversation_id: candidate.conversationId,
          payload: {
            contact_id: candidate.contactId,
            reason: typeof parsed?.reason === "string" ? parsed.reason : "no_signal",
          },
        });
        continue;
      }

      const topic =
        typeof parsed.topic === "string" && parsed.topic.trim()
          ? parsed.topic.trim().slice(0, 100)
          : "tu proyecto";
      const contactName = candidate.name?.trim() || "";

      const body = fillTemplateVariables(recoveryTemplate.body_template, [
        contactName,
        topic,
      ]);
      const components =
        recoveryTemplate.variables.length > 0
          ? [
              {
                type: "body" as const,
                parameters: [contactName, topic].map((v) => ({
                  type: "text" as const,
                  text: v,
                })),
              },
            ]
          : undefined;

      const result = await dispatchTemplate({
        workspaceId,
        conversationId: candidate.conversationId,
        templateName: recoveryTemplate.name,
        templateLanguage: recoveryTemplate.language,
        components,
      });

      await db
        .from("contacts")
        .update({
          custom_fields: {
            ...nextCustomFields,
            ...(result.ok
              ? { cold_recovery_last_contacted_at: new Date().toISOString() }
              : {}),
          },
        })
        .eq("id", candidate.contactId);

      await db.from("events").insert({
        type: result.ok
          ? "cold_lead_recovery_sent"
          : "cold_lead_recovery_send_failed",
        level: result.ok ? "info" : "warn",
        workspace_id: workspaceId,
        conversation_id: candidate.conversationId,
        payload: {
          contact_id: candidate.contactId,
          template: recoveryTemplate.name,
          topic,
          rendered_preview: body,
          error: result.ok ? null : result.error,
        },
      });

      if (result.ok) contacted++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "unknown error";
      console.error("[cold-lead-recovery] contact evaluation failed:", msg);
      await db
        .from("events")
        .insert({
          type: "cold_lead_recovery_error",
          level: "error",
          workspace_id: workspaceId,
          conversation_id: candidate.conversationId,
          payload: { error: msg, contact_id: candidate.contactId },
        })
        .then(
          () => {},
          () => {},
        );
    }
  }

  return { evaluated: candidates.length, contacted, skipped: null };
}
