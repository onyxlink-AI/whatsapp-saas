"use server";

/**
 * content-script-ai.ts — Fase 3 (docs/CLAUDE-ARQUITECTURA-PAQUETES-NAVEGACION-IA-ASISTENTE.md §5):
 * "Generar guion con IA". Server action exclusiva de servidor — nunca se
 * expone la clave de OpenRouter ni el prompt de sistema al cliente.
 *
 * Revisión correctiva: esta función usa EXCLUSIVAMENTE la integración
 * OpenRouter propia del workspace activo (Ajustes → Integraciones) —
 * OpenRouter es una cuenta y un gasto del cliente, no de la plataforma.
 * NUNCA hace fallback a la clave compartida OPENROUTER_API_KEY, a
 * diferencia del resolvedor genérico getOpenRouterApiKey() de
 * src/features/inbox/services/openrouter.ts (usado por el agente de
 * WhatsApp y otras 9 funciones, cuyo comportamiento de fallback NO se ha
 * tocado ni auditado para cambiarlo aquí). getWorkspaceOpenRouterCredential()
 * (openrouter-credential.ts) es el resolvedor estricto compartido — también
 * lo usa el chat real de la Oficina Virtual
 * (office-virtual/chat/route.ts), que por el mismo motivo NUNCA usa
 * generateChatReply() de openrouter.ts para las llamadas del Orquestador/
 * especialistas. Si el workspace no tiene su integración configurada y
 * habilitada, no se llama a ningún proveedor — se devuelve un estado
 * controlado que la UI traduce en un mensaje claro para conectar OpenRouter.
 *
 * La generación NUNCA muta content_items — solo devuelve una propuesta
 * para el estado local del formulario. El cliente decide si la conserva,
 * la edita o la descarta, y solo persiste al pulsar Guardar.
 */

import { z } from "zod";
import { createOpenAI } from "@ai-sdk/openai";
import { generateObject, NoObjectGeneratedError } from "ai";
import { createClient as createSbClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { getActiveWorkspace } from "@/features/workspace/services/active-workspace";
import { resolveEntitlements } from "@/features/entitlements/resolve";
import { getWorkspaceOpenRouterCredential } from "./openrouter-credential";

/**
 * Revisión correctiva — códigos distintos para cada causa real de fallo
 * (BLOQUEO 2, punto 13): antes todo lo que no fuera "sin configurar" caía
 * en el mismo mensaje genérico, y un fallo real de descifrado de la
 * credencial ni siquiera se capturaba (excepción sin controlar). El texto
 * (`error`) ya era distinto en la mayoría de casos; `code` existe para que
 * la UI/las pruebas puedan diferenciar sin depender de comparar cadenas.
 */
export type GenerateScriptErrorCode =
  | "openrouter_not_configured"
  | "openrouter_disabled"
  | "credential_decrypt_error"
  | "rate_limited"
  | "transient_error"
  | "network_error"
  | "invalid_model_response"
  | "missing_info";

export type ActionResult<T> =
  | { ok: true; data: T; error?: never; code?: never }
  | { ok: false; data?: never; error: string; code?: GenerateScriptErrorCode };

// ──────────────────────────────────────────────────────────────────────────────
// Esquemas — entrada (información de General) y salida (§5.5, textual)
// ──────────────────────────────────────────────────────────────────────────────

const OrientationEnum = z.enum(["vertical", "horizontal"]);

const GenerateScriptInputSchema = z.object({
  mainIdea: z.string().max(2000).optional().or(z.literal("")),
  description: z.string().max(2000).optional().or(z.literal("")),
  contentType: z.string().max(200).optional().or(z.literal("")),
  platform: z.string().max(200).optional().or(z.literal("")),
  orientation: OrientationEnum.nullable().optional(),
  durationEstimate: z.string().max(100).optional().or(z.literal("")),
  responsibleId: z.string().uuid().nullable().optional(),
  scheduledDate: z.string().nullable().optional(),
});

export type GenerateScriptInput = z.infer<typeof GenerateScriptInputSchema>;

const ReferenceLinkSchema = z.object({ label: z.string(), url: z.string().url() });

const GeneratedScriptSchema = z.object({
  hook: z.string(),
  body: z.string(),
  closing: z.string(),
  cta: z.string(),
  bulletPoints: z.array(z.string()),
  links: z.array(ReferenceLinkSchema),
  lighting: z.string(),
  music: z.string(),
  notes: z.string(),
});

export type GeneratedScript = z.infer<typeof GeneratedScriptSchema>;

function svc() {
  return createSbClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

// Un error de lectura de BD nunca debe presentarse como "plan no
// contratado" ni "responsable ajeno" — ambos son estados de negocio
// reales y distintos de un fallo transitorio de infraestructura.
const TRANSIENT_ERROR = "No se pudo comprobar tu acceso en este momento. Inténtalo de nuevo en unos segundos.";
const OPENROUTER_NOT_CONFIGURED_MESSAGE =
  "Conecta tu cuenta de OpenRouter en Ajustes → Integraciones para generar guiones con IA.";
const OPENROUTER_DISABLED_MESSAGE =
  "La integración de OpenRouter de esta empresa está desactivada. Actívala en Ajustes → Integraciones para generar guiones con IA.";
const CREDENTIAL_DECRYPT_ERROR_MESSAGE =
  "No se pudo leer la clave de OpenRouter guardada. Vuelve a introducirla en Ajustes → Integraciones.";
const RATE_LIMITED_MESSAGE = "Has alcanzado el límite de generaciones por hora. Intenta de nuevo más tarde.";
const NETWORK_ERROR_MESSAGE = "No se pudo contactar con el modelo de IA. Revisa tu conexión e inténtalo de nuevo.";
const INVALID_MODEL_RESPONSE_MESSAGE = "El modelo no devolvió un guion con el formato esperado. Inténtalo de nuevo.";

// ──────────────────────────────────────────────────────────────────────────────
// reserveGeneration — reserva atómica del cupo (migración
// 20260808000008_content_script_generation_rate_limit.sql): cuenta y
// registra el intento en una única llamada de Postgres, sin la carrera
// "SELECT count → llamar al proveedor → INSERT". Cuenta intentos
// AUTORIZADOS (antes de llamar a OpenRouter), no generaciones exitosas —
// ver el comentario de la migración para el razonamiento completo. Si la
// propia reserva falla (red, BD), NUNCA se llama a OpenRouter — el rate
// limit de una función con coste real no puede fallar abierto.
// ──────────────────────────────────────────────────────────────────────────────

type ReservationResult = { status: "ok"; allowed: boolean } | { status: "error" };

async function reserveGeneration(workspaceId: string, userId: string): Promise<ReservationResult> {
  const { data, error } = await svc().rpc("reserve_content_script_generation", {
    p_workspace_id: workspaceId,
    p_user_id: userId,
  });

  if (error) {
    console.error("[content-script-ai] reserve_content_script_generation error:", error.message);
    return { status: "error" };
  }
  return { status: "ok", allowed: (data as { allowed?: boolean } | null)?.allowed === true };
}

// ──────────────────────────────────────────────────────────────────────────────
// Prompt
// ──────────────────────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `Eres un guionista experto en contenido corto para redes sociales de pequeños negocios (reels, TikToks, posts). A partir de la información que te da el usuario, generas un guion completo y editable.

Reglas estrictas, sin excepción:
- NUNCA inventes URLs, enlaces, estadísticas, citas o fuentes. Solo puedes incluir en "links" una URL si aparece literalmente escrita en la idea o la descripción que te dio el usuario — cópiala tal cual, nunca completes ni imagines una nueva. Si no hay ninguna URL real en la entrada, "links" debe ser una lista vacía.
- Todo el texto debe estar en español, con tono natural y directo, nunca genérico o robótico.
- "hook": debe captar la atención en los primeros 2-3 segundos, adaptado al tipo de contenido y red social indicados.
- "body": el desarrollo — debe ser coherente con la duración y el formato indicados, sin relleno innecesario.
- "closing": un cierre breve que conecte con el hook.
- "cta": una única llamada a la acción, clara y concreta.
- "bulletPoints": entre 2 y 6 puntos clave breves y accionables que resuman el guion, cada uno como una frase corta.
- "lighting": una recomendación breve de iluminación para grabar esta pieza (una frase).
- "music": una recomendación breve de estilo o tipo de música (una frase, nunca el nombre de una canción real con derechos de autor).
- "notes": solo inclúyelo si hay un consejo de grabación útil que no esté ya cubierto por "lighting" o "music" — si no hay nada que aportar, devuelve una cadena vacía "".
- Responde EXCLUSIVAMENTE con la estructura solicitada — nunca añadas explicaciones fuera de los campos.`;

function buildUserPrompt(input: GenerateScriptInput, responsibleName: string | null): string {
  const orientationLabel =
    input.orientation === "vertical" ? "Vertical" : input.orientation === "horizontal" ? "Horizontal" : "(no especificado)";

  return `Genera un guion para esta pieza de contenido:
- Idea principal: ${input.mainIdea?.trim() || "(no especificada)"}
- Descripción: ${input.description?.trim() || "(no especificada)"}
- Tipo de contenido: ${input.contentType?.trim() || "(no especificado)"}
- Red social: ${input.platform?.trim() || "(no especificada)"}
- Formato: ${orientationLabel}
- Duración estimada: ${input.durationEstimate?.trim() || "(no especificada)"}
- Responsable: ${responsibleName ?? "(sin asignar)"}
- Fecha prevista: ${input.scheduledDate?.trim() || "(no especificada)"}`;
}

function getModel(apiKey: string) {
  const openrouter = createOpenAI({
    baseURL: "https://openrouter.ai/api/v1",
    apiKey,
    headers: {
      "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
      "X-Title": "Onyxlink Contenido",
    },
  });
  return openrouter.chat(process.env.OPENROUTER_DEFAULT_MODEL ?? "openai/gpt-4o-mini");
}

// ──────────────────────────────────────────────────────────────────────────────
// Salvaguarda anti-invención de enlaces — más allá de instruir al modelo, se
// descarta server-side cualquier "link" cuya URL no aparezca literalmente en
// el texto de entrada (idea + descripción). Nunca confiar solo en el prompt
// para un requisito "nunca inventarlos".
// ──────────────────────────────────────────────────────────────────────────────

function stripUnverifiedLinks(script: GeneratedScript, input: GenerateScriptInput): GeneratedScript {
  const sourceText = `${input.mainIdea ?? ""}\n${input.description ?? ""}`;
  const verifiedLinks = script.links.filter((link) => sourceText.includes(link.url));
  return { ...script, links: verifiedLinks };
}

// ──────────────────────────────────────────────────────────────────────────────
// generateContentScript
// ──────────────────────────────────────────────────────────────────────────────

const GENERATION_TIMEOUT_MS = 25_000;
const MAX_OUTPUT_TOKENS = 2000;

export async function generateContentScript(
  workspaceId: string,
  rawInput: GenerateScriptInput,
): Promise<ActionResult<GeneratedScript>> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { ok: false, error: "No autorizado" };
  }

  // Nunca confiar en el workspaceId que manda el cliente sin contrastarlo
  // con la sesión — se compara contra el workspace activo real del usuario,
  // no solo contra RLS.
  const active = await getActiveWorkspace(supabase, user.id);
  if (!active || active.workspace_id !== workspaceId) {
    return { ok: false, error: "Acceso denegado" };
  }
  if (!["admin", "manager", "agent"].includes(active.role)) {
    return { ok: false, error: "Tu rol no permite generar guiones" };
  }

  const { data: workspaceRow, error: workspaceError } = await supabase
    .from("workspaces")
    .select("product_package")
    .eq("id", workspaceId)
    .maybeSingle();
  if (workspaceError) {
    console.error("[content-script-ai] error leyendo el paquete del workspace:", workspaceError.message);
    return { ok: false, error: TRANSIENT_ERROR, code: "transient_error" };
  }
  if (!resolveEntitlements(workspaceRow).hasGestion) {
    return { ok: false, error: "Esta función no está incluida en tu plan" };
  }

  const parsed = GenerateScriptInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }
  const input = parsed.data;

  if (!input.mainIdea?.trim() && !input.description?.trim()) {
    return { ok: false, error: "Añade una idea principal o una descripción antes de generar", code: "missing_info" };
  }

  let responsibleName: string | null = null;
  if (input.responsibleId) {
    const { data: memberRow, error: memberError } = await supabase
      .from("memberships")
      .select("user_id, users(full_name)")
      .eq("user_id", input.responsibleId)
      .eq("workspace_id", workspaceId)
      .eq("is_active", true)
      .maybeSingle();
    if (memberError) {
      console.error("[content-script-ai] error leyendo la membership del responsable:", memberError.message);
      return { ok: false, error: TRANSIENT_ERROR, code: "transient_error" };
    }
    if (!memberRow) {
      return { ok: false, error: "El responsable no pertenece a la empresa activa" };
    }
    // Mismo shape que listWorkspaceMembers en project-actions.ts: "users" es
    // un único objeto (relación a-uno), no un array.
    const users = memberRow.users as unknown as { full_name: string | null } | null;
    responsibleName = users?.full_name ?? null;
  }

  // Resolvedor estricto y exclusivo del workspace — nunca cae a la clave
  // de plataforma. Si no está configurada/habilitada, se detiene aquí sin
  // gastar cupo de rate limit ni intentar ninguna llamada a OpenRouter.
  const credential = await getWorkspaceOpenRouterCredential(workspaceId);
  if (credential.status === "error") {
    return { ok: false, error: TRANSIENT_ERROR, code: "transient_error" };
  }
  if (credential.status === "decrypt_error") {
    return { ok: false, error: CREDENTIAL_DECRYPT_ERROR_MESSAGE, code: "credential_decrypt_error" };
  }
  if (credential.status === "disabled") {
    return { ok: false, error: OPENROUTER_DISABLED_MESSAGE, code: "openrouter_disabled" };
  }
  if (credential.status === "not_configured") {
    return { ok: false, error: OPENROUTER_NOT_CONFIGURED_MESSAGE, code: "openrouter_not_configured" };
  }

  const reservation = await reserveGeneration(workspaceId, user.id);
  if (reservation.status === "error") {
    // Fail-closed: una función con coste real nunca "falla abierta".
    return { ok: false, error: TRANSIENT_ERROR, code: "transient_error" };
  }
  if (!reservation.allowed) {
    return { ok: false, error: RATE_LIMITED_MESSAGE, code: "rate_limited" };
  }

  try {
    const { object, usage } = await generateObject({
      model: getModel(credential.apiKey),
      schema: GeneratedScriptSchema,
      system: SYSTEM_PROMPT,
      prompt: buildUserPrompt(input, responsibleName),
      abortSignal: AbortSignal.timeout(GENERATION_TIMEOUT_MS),
      maxOutputTokens: MAX_OUTPUT_TOKENS,
    });

    const sanitized = stripUnverifiedLinks(object, input);

    // Solo metadatos de uso en el log — nunca el texto del guion. El
    // registro del intento en sí ya ocurrió de forma atómica dentro de
    // reserveGeneration(), antes de esta llamada.
    console.info(
      "[content-script-ai] generación completada",
      workspaceId,
      "tokens:",
      usage?.inputTokens ?? 0,
      usage?.outputTokens ?? 0,
    );

    return { ok: true, data: sanitized };
  } catch (err) {
    // Log técnico sin contenido del guion generado ni claves. El mensaje
    // VISIBLE también se diferencia — no solo el log — para que el
    // usuario sepa si reintentar tiene sentido (red/timeout) o si el
    // modelo simplemente no devolvió un guion válido esta vez.
    if (NoObjectGeneratedError.isInstance(err)) {
      console.error("[content-script-ai] generateContentScript error: salida no válida del modelo");
      return { ok: false, error: INVALID_MODEL_RESPONSE_MESSAGE, code: "invalid_model_response" };
    }
    const isAbortOrNetwork =
      err instanceof Error && (err.name === "AbortError" || err.name === "TimeoutError" || /fetch|network|ECONNRESET|ETIMEDOUT/i.test(err.message));
    if (isAbortOrNetwork) {
      console.error("[content-script-ai] generateContentScript error: red/timeout", err instanceof Error ? err.message : err);
      return { ok: false, error: NETWORK_ERROR_MESSAGE, code: "network_error" };
    }
    console.error("[content-script-ai] generateContentScript error: fallo de generación", err instanceof Error ? err.message : err);
    return { ok: false, error: "No se pudo generar el guion. Intenta de nuevo en unos segundos." };
  }
}
