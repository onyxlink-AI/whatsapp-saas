import { createClient as createSbClient } from "@supabase/supabase-js";
import { generateChatReply } from "./openrouter";
import type { ConversationTurn } from "./conversation-history";
import { getContactMemory, type ContactMemory } from "./contact-memory";

// memory-extraction.ts — Memoria Inteligente Avanzada (Fase 1): extractor
// post-batch que actualiza la memoria del contacto solo cuando detecta
// información nueva y útil. Modelo barato (mismo que auto-tagging.ts).
// Fire-and-forget desde buffer.ts, dormant a menos que el workspace tenga
// advanced_memory_enabled — nunca lanza hacia processNextBatch.

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
- "metadata": objeto con cualquier otro dato estructurado relevante.

Si la transcripción NO aporta ninguna información nueva o útil respecto a la memoria actual, responde exactamente: {"no_update": true}

REGLAS ESTRICTAS — NUNCA debes incluir en ningún campo:
- Contraseñas, PINs, códigos de verificación.
- Números de tarjeta, cuentas bancarias, IBAN u otros datos financieros.
- Documentos de identidad, pasaportes u otra información sensible innecesaria para el seguimiento comercial.
Si el cliente comparte algo de esto, ignóralo por completo — no lo copies ni lo resumas.`;

interface ExtractParams {
  workspaceId: string;
  conversationId: string;
  contactId: string;
  history: ConversationTurn[];
  mergedText: string;
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

    const transcript =
      history.map((t) => `${t.role}: ${t.content}`).join("\n") +
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
      maxOutputTokens: 400,
      workspaceId,
    });

    const parsed = safeParseJson(reply.text);
    if (!parsed || parsed.no_update === true) return;

    // Only keep known fields; drop anything the model invented.
    const next: Record<string, unknown> = {};
    for (const field of MEMORY_FIELDS) {
      if (field in parsed) next[field] = parsed[field];
    }
    if (Object.keys(next).length === 0) return;

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
    if (droppedFields.length > 0) {
      await db.from("events").insert({
        type: "contact_memory_sensitive_data_dropped",
        level: "warn",
        workspace_id: workspaceId,
        conversation_id: conversationId,
        payload: { contact_id: contactId, fields: droppedFields },
      });
    }
    if (Object.keys(next).length === 0) return;

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

    await db.from("contact_memories").upsert(row, { onConflict: "contact_id" });

    console.info(
      `[memory] updated contact_memories for contact ${contactId} (workspace ${workspaceId}), fields: ${Object.keys(next).join(", ")}`,
    );

    await db.from("events").insert({
      type: "contact_memory_updated",
      level: "info",
      workspace_id: workspaceId,
      conversation_id: conversationId,
      payload: { contact_id: contactId, fields_updated: Object.keys(next) },
    });
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
