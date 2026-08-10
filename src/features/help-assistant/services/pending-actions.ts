/**
 * pending-actions.ts — Fase 4B: infraestructura de confirmación de dos
 * pasos para acciones destructivas del Asistente de Ayuda
 * (docs/CLAUDE-ARQUITECTURA-PAQUETES-NAVEGACION-IA-ASISTENTE.md §6.3).
 *
 * Lista CERRADA de acciones confirmables — nunca un ejecutor genérico de
 * payloads. Añadir una acción nueva exige: 1) un valor nuevo en el CHECK
 * `action_type` de la migración, 2) un schema Zod nuevo aquí, 3) un CASE
 * nuevo en resolve_assistant_pending_action() (supabase/migrations/20260809000000_...sql).
 * Ninguno de los tres solo no basta.
 *
 * El token de confirmación:
 *   - se genera con 32 bytes aleatorios criptográficamente seguros
 *     (randomBytes de node:crypto, no Math.random ni UUID v4);
 *   - se devuelve en claro al llamador UNA sola vez (para reenviarlo al
 *     navegador) — esta función es el único lugar del backend que lo ve
 *     en claro, y no lo registra en ningún log ni lo pasa a logAudit;
 *   - en base de datos se guarda EXCLUSIVAMENTE su SHA-256 en hex —
 *     quien lea la tabla `assistant_pending_actions` (un volcado, una
 *     fuga, un superadmin con acceso a Studio) no puede reconstruir un
 *     token válido a partir del hash.
 *
 * La confirmación/cancelación NUNCA se resuelve en dos pasos desde Node
 * (marcar "confirmado" y ejecutar después) — eso deja una ventana donde
 * una caída del proceso entre ambos pasos deja la acción confirmada pero
 * sin ejecutar. resolveConfirmableAction() delega TODO —localizar por
 * hash, bloquear la fila, revalidar membership/paquete/kill switch,
 * ejecutar el único caso permitido y marcar el estado final— a la función
 * SQL transaccional `resolve_assistant_pending_action()`, en una sola
 * llamada.
 */

import { randomBytes, createHash } from "node:crypto";
import { createClient as createSbClient } from "@supabase/supabase-js";
import { z } from "zod";

function svc() {
  return createSbClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

/** 5 minutos fijos — decisión cerrada, no configurable por caller. */
export const PENDING_ACTION_TTL_SECONDS = 300;

// ──────────────────────────────────────────────────────────────────────────────
// Lista cerrada de acciones confirmables. El payload de cada una es el
// mínimo indispensable — IDs y parámetros, nunca documentos/contenido
// completo (decisión cerrada del usuario).
// ──────────────────────────────────────────────────────────────────────────────
/** Mismo whitelist que la función SQL (update_content_item_fields_cas) — una clave fuera de esta lista se rechaza aquí antes de gastar un viaje a la base de datos; la función también la rechaza igual, defensa en profundidad. */
const CONTENT_ITEM_PATCH_KEYS = [
  "title", "main_idea", "description", "content_type", "platform", "orientation",
  "responsible_id", "scheduled_date", "script_hook", "script_body", "script_closing",
  "script_cta", "bullet_points", "reference_links", "notes", "lighting_notes",
  "music_notes", "duration_estimate",
] as const;

const PENDING_ACTION_PAYLOAD_SCHEMAS = {
  cancel_agenda_item: z.object({ agenda_task_id: z.string().uuid() }),
  // Fase 4C: element_id NO es un UUID — Excalidraw genera ids propios
  // (ver scene-adapter.ts) — se valida como string acotado, igual que la
  // función SQL (resolve_assistant_pending_action, rama delete_board_element).
  delete_board_element: z.object({
    whiteboard_id: z.string().uuid(),
    element_id: z.string().min(1).max(100),
    expected_element_version: z.number().int().positive(),
  }),
  // Fase 4 — Agente de Contenido: solo se prepara cuando el modelo va a
  // SUSTITUIR un campo que ya tenía contenido. `patch` nunca lleva el texto
  // completo sensible más allá de lo que el propio campo ya representa —
  // el resumen mostrado al usuario (ver content-tools.ts) trunca cualquier
  // vista previa por separado.
  update_content_item: z.object({
    content_item_id: z.string().uuid(),
    expected_version: z.number().int().positive(),
    patch: z
      .record(z.string(), z.unknown())
      .refine((v) => Object.keys(v).length > 0, { message: "El parche no puede estar vacío" })
      .refine((v) => Object.keys(v).every((k) => (CONTENT_ITEM_PATCH_KEYS as readonly string[]).includes(k)), {
        message: "El parche contiene un campo no permitido",
      }),
  }),
} as const;

export type PendingActionType = keyof typeof PENDING_ACTION_PAYLOAD_SCHEMAS;

export type PendingActionPayload<T extends PendingActionType> = z.infer<(typeof PENDING_ACTION_PAYLOAD_SCHEMAS)[T]>;

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export interface PrepareConfirmableActionParams<T extends PendingActionType> {
  workspaceId: string;
  actorUserId: string;
  actionType: T;
  payload: PendingActionPayload<T>;
  /** Plantilla fija ya renderizada con datos reales — nunca texto libre del modelo. */
  summary: string;
}

export interface PreparedConfirmableAction {
  token: string;
  expiresInSeconds: number;
  /** ID de la fila — identificador común de auditoría (prepared/executed/cancelled). Nunca se envía al navegador. */
  pendingActionId: string;
}

/**
 * Valida el payload contra el schema cerrado de `actionType` y guarda la
 * fila `pending` con el hash del token — nunca el token en claro. No
 * modifica ninguna otra tabla: preparar una acción confirmable no ejecuta
 * nada todavía.
 */
export async function prepareConfirmableAction<T extends PendingActionType>(
  params: PrepareConfirmableActionParams<T>,
): Promise<PreparedConfirmableAction | null> {
  const schema = PENDING_ACTION_PAYLOAD_SCHEMAS[params.actionType];
  const parsedPayload = schema.safeParse(params.payload);
  if (!parsedPayload.success) {
    console.error("[pending-actions] payload inválido para", params.actionType, parsedPayload.error.issues);
    return null;
  }

  const token = randomBytes(32).toString("hex");
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + PENDING_ACTION_TTL_SECONDS * 1000).toISOString();

  const { data, error } = await svc()
    .from("assistant_pending_actions")
    .insert({
      workspace_id: params.workspaceId,
      actor_user_id: params.actorUserId,
      action_type: params.actionType,
      payload: parsedPayload.data,
      summary: params.summary,
      token_hash: tokenHash,
      expires_at: expiresAt,
    })
    .select("id")
    .single();

  if (error || !data) {
    console.error("[pending-actions] error preparando acción confirmable:", error?.message);
    return null;
  }

  return { token, expiresInSeconds: PENDING_ACTION_TTL_SECONDS, pendingActionId: data.id as string };
}

/**
 * Compartido entre todas las tools confirmables construidas para UNA
 * petición del asistente (ver action-tools/index.ts) — `remaining` impone
 * "máximo una preparación confirmable por petición" (decisión cerrada), y
 * `prepared` es el único canal por el que el token en claro sale de la
 * tool hacia help-assistant-service.ts: la tool NUNCA devuelve el token
 * como parte de su resultado (lo que el modelo ve), así que el token nunca
 * llega a formar parte del payload enviado a OpenRouter ni de nada que el
 * modelo pueda citar, truncar o alucinar. pendingActionId NO viaja aquí —
 * la tool lo usa directamente (para su propia auditoría) y no aporta nada
 * a la interfaz, así que nunca llega al navegador.
 */
export interface PendingConfirmationSlot {
  remaining: number;
  prepared: { token: string; expiresInSeconds: number; summary: string } | null;
}

export function createPendingConfirmationSlot(): PendingConfirmationSlot {
  return { remaining: 1, prepared: null };
}

export type ResolvePendingActionCode =
  | "executed"
  | "cancelled"
  | "invalid_token"
  | "already_resolved"
  | "expired"
  | "permission_revoked"
  | "entity_not_found"
  | "entity_already_changed"
  | "internal_error";

export interface ResolvePendingActionResult {
  ok: boolean;
  code: ResolvePendingActionCode;
  result?: Record<string, unknown>;
  /** Identificador común de auditoría — el llamador (la ruta) lo usa como targetId, nunca lo reenvía al navegador. */
  pendingActionId?: string;
  /**
   * true cuando este resultado viene de reconciliar un reintento contra
   * una fila que YA estaba resuelta (la primera respuesta se perdió por
   * la red) — el llamador no debe volver a auditar, porque no ocurrió
   * nada nuevo esta vez.
   */
  reconciled?: boolean;
}

/**
 * Única vía para confirmar o cancelar. Calcula el hash del token recibido
 * (el token en claro nunca se guarda ni se reenvía a Postgres tal cual más
 * allá de este cálculo) y delega la resolución completa —autorización
 * fresca incluida— a resolve_assistant_pending_action(), en una sola
 * llamada RPC atómica.
 *
 * Reconciliación: si la fila ya no está 'pending' (el mismo actor/workspace
 * ya la resolvió antes — típicamente porque la respuesta de la primera
 * llamada se perdió por la red y el cliente reintentó), la función SQL
 * devuelve el estado final REAL junto con 'already_resolved'. Aquí se
 * traduce ese caso a un resultado normal de éxito (executed/cancelled)
 * para que la ruta nunca le muestre al usuario un error falso por algo
 * que en realidad sí se completó.
 */
export async function resolveConfirmableAction(params: {
  workspaceId: string;
  actorUserId: string;
  token: string;
  decision: "confirm" | "cancel";
}): Promise<ResolvePendingActionResult> {
  const tokenHash = hashToken(params.token);

  const { data, error } = await svc().rpc("resolve_assistant_pending_action", {
    p_token_hash: tokenHash,
    p_decision: params.decision,
    p_actor_user_id: params.actorUserId,
    p_workspace_id: params.workspaceId,
  });

  if (error) {
    // Nunca incluir el token (ni su hash) en el log de error.
    console.error("[pending-actions] error resolviendo acción confirmable:", error.message);
    return { ok: false, code: "internal_error" };
  }

  const parsed = data as {
    ok: boolean;
    code: ResolvePendingActionCode;
    result?: Record<string, unknown>;
    pending_action_id?: string;
    final_status?: "executed" | "cancelled" | "expired" | "failed";
  };

  if (!parsed.ok && parsed.code === "already_resolved") {
    if (parsed.final_status === "executed") {
      return { ok: true, code: "executed", pendingActionId: parsed.pending_action_id, reconciled: true };
    }
    if (parsed.final_status === "cancelled") {
      return { ok: true, code: "cancelled", pendingActionId: parsed.pending_action_id, reconciled: true };
    }
    if (parsed.final_status === "expired") {
      return { ok: false, code: "expired", pendingActionId: parsed.pending_action_id, reconciled: true };
    }
    // final_status === 'failed' (o cualquier otro caso no reconciliable): denegación genérica.
    return { ok: false, code: "already_resolved", pendingActionId: parsed.pending_action_id };
  }

  return { ok: parsed.ok, code: parsed.code, result: parsed.result, pendingActionId: parsed.pending_action_id };
}

// ──────────────────────────────────────────────────────────────────────────────
// Límite de intentos de confirmación — defensa en profundidad contra
// enumeración (el token en sí es inadivinable: 256 bits aleatorios). Cuenta
// Y reserva en una única llamada atómica de Postgres, mismo patrón exacto
// que reserve_content_script_generation() (20260808000008) — nunca
// "SELECT count desde Node -> INSERT desde Node" por separado (TOCTOU).
//
// FAIL-CLOSED: si la propia reserva falla (error de conexión, etc.),
// ok=false — el llamador NUNCA debe proceder a resolveConfirmableAction()
// en ese caso, debe responder 503 y no tocar el token en absoluto.
//
// Nunca se guarda IP — el control principal es workspace_id + actor_user_id;
// no hay ninguna necesidad de producto para tratar la IP, así que no se
// recoge.
// ──────────────────────────────────────────────────────────────────────────────
export interface ReserveConfirmAttemptResult {
  /** false = la propia comprobación falló (error de BD) — fail-closed, nunca proceder a resolver. */
  ok: boolean;
  allowed: boolean;
  used?: number;
  limit?: number;
}

export async function reserveConfirmAttempt(params: {
  workspaceId: string;
  actorUserId: string;
}): Promise<ReserveConfirmAttemptResult> {
  const { data, error } = await svc().rpc("reserve_help_assistant_confirm_attempt", {
    p_workspace_id: params.workspaceId,
    p_user_id: params.actorUserId,
  });

  if (error) {
    console.error("[pending-actions] error reservando intento de confirmación:", error.message);
    return { ok: false, allowed: false };
  }

  const parsed = data as { allowed: boolean; used: number; limit: number };
  return { ok: true, allowed: parsed.allowed, used: parsed.used, limit: parsed.limit };
}
