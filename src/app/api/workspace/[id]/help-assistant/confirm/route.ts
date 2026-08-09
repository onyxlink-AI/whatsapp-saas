import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireWorkspaceMember, readJsonBody } from "@/lib/auth/workspace-access";
import { logAudit } from "@/features/audit/services/audit-log";
import {
  resolveConfirmableAction,
  reserveConfirmAttempt,
  type ResolvePendingActionCode,
} from "@/features/help-assistant/services/pending-actions";

/**
 * Fase 4B — única ruta que confirma o cancela una acción destructiva
 * preparada por el Asistente de Ayuda. NUNCA pasa por el LLM: recibe
 * directamente el token que el navegador guardó al mostrar la tarjeta de
 * confirmación (help-assistant-panel.tsx) y lo reenvía tal cual a
 * resolveConfirmableAction(), que solo calcula su hash y delega TODO —
 * localizar, bloquear, revalidar autorización fresca y ejecutar el único
 * caso permitido— a resolve_assistant_pending_action() en Postgres.
 *
 * Solo POST. Cache-Control: no-store en toda respuesta — nunca se debe
 * cachear el resultado de confirmar/cancelar una acción de un solo uso.
 * El token nunca aparece en esta ruta fuera del body ya parseado —
 * ni en logs, ni en la URL (siempre POST, nunca query string), ni en
 * auditoría, ni en los mensajes de error devueltos al cliente.
 *
 * El token se valida con el formato EXACTO que genera prepareConfirmableAction
 * (64 hex — 32 bytes) antes de tocar cualquier cosa — una cadena con otra
 * forma se rechaza en el propio parseo de Zod, nunca llega a la reserva del
 * límite de intentos ni a la base de datos.
 */

const BodySchema = z.object({
  token: z.string().regex(/^[a-f0-9]{64}$/, "Token inválido"),
  decision: z.enum(["confirm", "cancel"]),
});

const ERROR_RESPONSES: Record<Exclude<ResolvePendingActionCode, "executed" | "cancelled">, { status: number; error: string }> = {
  invalid_token: { status: 404, error: "Ese enlace de confirmación no es válido o ya no existe." },
  already_resolved: { status: 409, error: "Esta acción ya se resolvió antes — no se puede confirmar ni cancelar de nuevo." },
  expired: { status: 410, error: "Esta confirmación caducó. Pide la acción de nuevo si sigue haciendo falta." },
  permission_revoked: { status: 403, error: "Ya no tienes permiso para confirmar esta acción." },
  entity_not_found: { status: 404, error: "No se encontró el elemento que ibas a cancelar — puede que ya no exista." },
  entity_already_changed: { status: 409, error: "El elemento ya cambió desde que se preparó esta confirmación." },
  internal_error: { status: 500, error: "No se pudo procesar tu confirmación. Inténtalo de nuevo." },
};

function noStore(body: unknown, status: number) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: workspaceId } = await params;
  const auth = await requireWorkspaceMember(workspaceId);
  if (!auth.ok) return auth.response;

  const body = await readJsonBody(request);
  if (!body.ok) return body.response;
  const parsed = BodySchema.safeParse(body.body);
  if (!parsed.success) {
    return noStore({ error: "Solicitud no válida" }, 400);
  }

  // Reserva atómica (cuenta Y registra el intento en una sola llamada de
  // Postgres) — fail-closed: si la propia reserva falla, NUNCA se procede
  // a resolver el token, se responde 503 controlado.
  const reservation = await reserveConfirmAttempt({ workspaceId, actorUserId: auth.userId });
  if (!reservation.ok) {
    return noStore({ error: "No se pudo comprobar tu límite de intentos en este momento. Inténtalo de nuevo en unos segundos." }, 503);
  }
  if (!reservation.allowed) {
    return noStore({ error: "Demasiados intentos. Espera unos minutos e inténtalo de nuevo." }, 429);
  }

  const resolved = await resolveConfirmableAction({
    workspaceId,
    actorUserId: auth.userId,
    token: parsed.data.token,
    decision: parsed.data.decision,
  });

  if (!resolved.ok) {
    const mapped = ERROR_RESPONSES[resolved.code as Exclude<ResolvePendingActionCode, "executed" | "cancelled">] ?? ERROR_RESPONSES.internal_error;
    return noStore({ ok: false, code: resolved.code, error: mapped.error }, mapped.status);
  }

  // reconciled=true significa que esto NO es una resolución nueva — es un
  // reintento (la respuesta original se perdió por la red) que encontró la
  // fila ya resuelta y la está reconciliando como éxito. No hay nada nuevo
  // que auditar: la auditoría real ya se registró en el intento original.
  if (!resolved.reconciled) {
    if (resolved.code === "executed") {
      void logAudit({
        workspaceId,
        actorUserId: auth.userId,
        action: "help_assistant.action_executed",
        targetType: "assistant_pending_action",
        targetId: resolved.pendingActionId,
        summary: "El usuario confirmó una acción preparada por el Asistente de Ayuda",
        // El resultado ya es un objeto estructurado y controlado por el
        // servidor (agenda_task_id, o whiteboard_id+element_id para
        // Fase 4C) — nunca contenido arbitrario, seguro de pasar tal cual.
        metadata: resolved.result,
      });
    } else {
      void logAudit({
        workspaceId,
        actorUserId: auth.userId,
        action: "help_assistant.action_cancelled",
        targetType: "assistant_pending_action",
        targetId: resolved.pendingActionId,
        summary: "El usuario canceló una acción preparada por el Asistente de Ayuda",
      });
    }
  }

  // pendingActionId es solo para auditoría del servidor — nunca aporta
  // nada a la interfaz, así que nunca se incluye en la respuesta.
  return noStore({ ok: true, code: resolved.code }, 200);
}
