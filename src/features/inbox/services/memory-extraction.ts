import { createClient as createSbClient } from "@supabase/supabase-js";
import { generateChatReply } from "./openrouter";
import type { ConversationTurn } from "./conversation-history";
import { getContactMemory, type ContactMemory } from "./contact-memory";
import { insertMemoryItems, type NewMemoryItem } from "./contact-memory-items";

// memory-extraction.ts — Memoria Inteligente Avanzada (Fase 1 + Fase 3):
// extractor post-batch que actualiza la memoria estructurada del contacto Y
// añade recuerdos atómicos embebibles, solo cuando detecta información nueva
// y útil. Modelo barato (mismo que auto-tagging.ts). Fire-and-forget desde
// buffer.ts, dormant a menos que el workspace tenga advanced_memory_enabled —
// nunca lanza hacia processNextBatch.
//
// También lo llama el webhook de Vapi (src/app/api/webhooks/vapi/route.ts)
// tras cada llamada de voz — la memoria es por CONTACTO, no por canal, así
// que esto es lo que conecta el asistente de voz con WhatsApp: si alguien
// llama y luego escribe (o al revés), el agente que responda ya sabe lo que
// se dijo en el otro canal, sin duplicar nada.

const CHEAP_MODEL = "openai/gpt-4o-mini";

const MEMORY_FIELDS = [
  "summary",
  "interests",
  "preferences",
  "objections",
  "lead_status",
  "next_step",
  "metadata",
] as const;

// Defense in depth: never persist obvious credentials/financial data even if
// the extraction prompt is bypassed by unusual input. Card numbers (13-19
// digits, with optional separators), IBAN-like strings, and password/PIN/CVV
// followed by a value.
const SENSITIVE_PATTERNS = [
  /\b(?:\d[ -]?){13,19}\b/, // card-like number sequences
  /\b[A-Z]{2}\d{2}[A-Z0-9]{10,30}\b/i, // IBAN-like
  /\b(contrase[ñn]a|password|pin|cvv|cvc)\b\s*[:=]?\s*\S+/i,
];

function containsSensitiveData(value: unknown): boolean {
  if (typeof value !== "string") return false;
  return SENSITIVE_PATTERNS.some((re) => re.test(value));
}

function svc() {
  return createSbClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
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

function currentMemoryAsJson(memory: ContactMemory | null): string {
  if (!memory) return "{}";
  return JSON.stringify({
    summary: memory.summary,
    interests: memory.interests,
    preferences: memory.preferences,
    objections: memory.objections,
    lead_status: memory.lead_status,
    next_step: memory.next_step,
    metadata: memory.metadata,
  });
}

const EXTRACTION_SYSTEM_PROMPT = `Eres un extractor de memoria para un agente de WhatsApp. Recibes la memoria actual de un contacto (JSON) y la transcripción más reciente de la conversación. Tu tarea es devolver la memoria ACTUALIZADA, fusionando lo nuevo y útil con lo que ya existía (no borres información previa válida salvo que la transcripción la contradiga).

Responde SOLO con un objeto JSON con estos campos, sin texto fuera del JSON:
- "summary": resumen breve (2-3 frases) de quién es el contacto y su situación.
- "interests": array de intereses detectados (strings cortos).
- "preferences": objeto clave-valor con preferencias (ej: {"horario_preferido": "tardes"}).
- "objections": array de objeciones u obstáculos que ha mencionado.
- "lead_status": estado del lead en una frase corta (ej: "interesado, esperando precio").
- "next_step": siguiente paso recomendado con este contacto.
- "metadata": objeto clave-valor SOLO para datos estructurados simples y breves que no encajen arriba (ej: {"num_empleados": 5}). NO uses metadata para anécdotas, relaciones, referidos o hechos narrativos — esos van en new_items.
- "new_items": array de recuerdos atómicos NUEVOS detectados en esta conversación (no repitas los que ya estaban en la memoria actual). Úsalo para cualquier hecho, anécdota, relación, referido o detalle puntual que no sea un interés/objeción/preferencia simple de una palabra — cosas que ayudarían a un humano a recordar la conversación con más profundidad. Cada uno es un objeto { "content": "frase corta y autocontenida", "category": "interest" | "objection" | "preference" | "fact" }. Ejemplos: { "content": "Prefiere que le llamen por las tardes, por las mañanas está en el almacén sin cobertura", "category": "preference" }, { "content": "Le refirió su hermano, que tiene una tienda parecida en Sevilla", "category": "fact" }. Deja el array vacío si no hay recuerdos nuevos.

Si la transcripción NO aporta ninguna información nueva o útil respecto a la memoria actual, responde exactamente: {"no_update": true}

REGLAS ESTRICTAS — NUNCA debes incluir en ningún campo ni en new_items:
- Contraseñas, PINs, códigos de verificación.
- Números de tarjeta, cuentas bancarias, IBAN u otros datos financieros.
- Documentos de identidad, pasaportes u otra información sensible innecesaria para el seguimiento comercial.
Si el cliente comparte algo de esto, ignóralo por completo — no lo copies ni lo resumas.`;

interface ExtractParams {
  workspaceId: string;
  /** null when the source isn't a WhatsApp conversation (e.g. a Vapi voice call). */
  conversationId: string | null;
  contactId: string;
  history: ConversationTurn[];
  /** For WhatsApp: the latest inbound message. For a voice call: the full transcript. */
  mergedText: string;
  /** For WhatsApp: the agent's reply. Leave "" when mergedText already contains the whole exchange (e.g. a call transcript). */
  replyText: string;
}

export async function extractContactMemory(
  params: ExtractParams,
): Promise<void> {
  const { workspaceId, conversationId, contactId, history, mergedText, replyText } =
    params;
  const db = svc();

  try {
    const existing = await getContactMemory(contactId);

    // Voice calls pass the full transcript as mergedText with no history/reply
    // — use it verbatim instead of wrapping it in a fake user/assistant turn.
    const transcript =
      history.length === 0 && !replyText
        ? mergedText
        : history.map((t) => `${t.role}: ${t.content}`).join("\n") +
          `\nuser: ${mergedText}` +
          `\nassistant: ${replyText}`;

    const reply = await generateChatReply({
      model: CHEAP_MODEL,
      systemPrompt: EXTRACTION_SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: `Memoria actual:\n${currentMemoryAsJson(existing)}\n\nTranscripción:\n${transcript}`,
        },
      ],
      maxOutputTokens: 600,
      workspaceId,
    });

    const parsed = safeParseJson(reply.text);
    if (!parsed || parsed.no_update === true) return;

    // Only keep known fields; drop anything the model invented.
    const next: Record<string, unknown> = {};
    for (const field of MEMORY_FIELDS) {
      if (field in parsed) next[field] = parsed[field];
    }

    // Fase 3: atomic recuerdos, validated + sensitive-data-filtered separately
    // from the structured fields above — capped so one turn can't flood the table.
    const rawItems = Array.isArray(parsed.new_items) ? parsed.new_items : [];
    const droppedItemCount = { sensitive: 0 };
    const newItems: NewMemoryItem[] = rawItems
      .filter(
        (item): item is { content: unknown; category?: unknown } =>
          typeof item === "object" && item !== null && "content" in item,
      )
      .map((item) => ({
        content: typeof item.content === "string" ? item.content.trim() : "",
        category: typeof item.category === "string" ? item.category : null,
      }))
      .filter((item) => item.content.length > 0)
      .filter((item) => {
        if (containsSensitiveData(item.content)) {
          droppedItemCount.sensitive += 1;
          return false;
        }
        return true;
      })
      .slice(0, 10);

    if (Object.keys(next).length === 0 && newItems.length === 0) return;

    // Defense in depth: strip any field that still looks sensitive.
    const droppedFields: string[] = [];
    for (const [key, value] of Object.entries(next)) {
      const flat =
        typeof value === "string"
          ? value
          : Array.isArray(value)
            ? value.join(" ")
            : JSON.stringify(value);
      if (containsSensitiveData(flat)) {
        delete next[key];
        droppedFields.push(key);
      }
    }
    if (droppedFields.length > 0 || droppedItemCount.sensitive > 0) {
      await db.from("events").insert({
        type: "contact_memory_sensitive_data_dropped",
        level: "warn",
        workspace_id: workspaceId,
        conversation_id: conversationId,
        payload: {
          contact_id: contactId,
          fields: droppedFields,
          items_dropped: droppedItemCount.sensitive,
        },
      });
    }

    if (Object.keys(next).length > 0) {
      const row = {
        workspace_id: workspaceId,
        contact_id: contactId,
        summary: next.summary ?? existing?.summary ?? null,
        interests: next.interests ?? existing?.interests ?? [],
        preferences: next.preferences ?? existing?.preferences ?? {},
        objections: next.objections ?? existing?.objections ?? [],
        lead_status: next.lead_status ?? existing?.lead_status ?? null,
        next_step: next.next_step ?? existing?.next_step ?? null,
        metadata: next.metadata ?? existing?.metadata ?? {},
      };

      await db
        .from("contact_memories")
        .upsert(row, { onConflict: "contact_id" });

      console.info(
        `[memory] updated contact_memories for contact ${contactId} (workspace ${workspaceId}), fields: ${Object.keys(next).join(", ")}`,
      );
    }

    // Fase 3: embed + store the new atomic recuerdos, if any survived filtering.
    let itemsAdded = 0;
    if (newItems.length > 0) {
      itemsAdded = await insertMemoryItems({
        workspaceId,
        contactId,
        conversationId: conversationId ?? undefined,
        items: newItems,
      });
      if (itemsAdded > 0) {
        console.info(
          `[memory] added ${itemsAdded} recuerdo(s) for contact ${contactId} (workspace ${workspaceId})`,
        );
      }
    }

    if (Object.keys(next).length > 0 || itemsAdded > 0) {
      await db.from("events").insert({
        type: "contact_memory_updated",
        level: "info",
        workspace_id: workspaceId,
        conversation_id: conversationId,
        payload: {
          contact_id: contactId,
          fields_updated: Object.keys(next),
          items_added: itemsAdded,
        },
      });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown error";
    console.error("[memory] extractContactMemory failed:", msg);
    await db
      .from("events")
      .insert({
        type: "contact_memory_extraction_error",
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
