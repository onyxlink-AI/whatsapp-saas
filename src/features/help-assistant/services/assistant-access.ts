/**
 * assistant-access.ts — Fase 4A (docs/CLAUDE-ARQUITECTURA-PAQUETES-NAVEGACION-IA-ASISTENTE.md §6.3/§6.4):
 * autorización centralizada para CADA ejecución de una herramienta del
 * Asistente de Ayuda.
 *
 * `askHelpAssistant` ya comprueba membership activa UNA VEZ, al principio
 * de la petición HTTP (requireWorkspaceMember en la ruta). Eso no basta:
 * una conversación con herramientas puede encadenar varios pasos
 * (stepCountIs(5)) a lo largo de varios segundos, y §6.3 exige que "cada
 * herramienta repita el alcance sobre la entidad objetivo" — así que
 * assertHelpActionAccess() vuelve a comprobar todo, en cada llamada, con
 * datos frescos de sesión y BD, sin fiarse del HelpActionContext construido
 * al principio de la conversación ni de ninguna comprobación anterior.
 *
 * Fuente única de verdad para "¿puede este workspace escribir con el
 * asistente ahora mismo?": canUseAssistantActions() (src/features/entitlements/resolve.ts).
 * Antes de esta revisión, action-tools/index.ts y system-prompt.ts
 * recalculaban la misma condición cada uno por su cuenta (gestionEnabled &&
 * whatsappAgentEnabled, con o sin actionsEnabled según el archivo) — dos
 * copias que podían divergir. Ahora ambos, y cada herramienta, pasan por
 * aquí.
 */

import { createClient } from "@/lib/supabase/server";
import { ROLE_RANK, type WorkspaceRole } from "@/lib/auth/workspace-access";
import { resolveEntitlements, canUseAssistantActions } from "@/features/entitlements/resolve";
import type { HelpActionContext } from "../types";

/** Roles con permiso de escritura — igual que el resto de acciones de servidor de esta sesión (Fase 3, content-script-ai.ts). */
const WRITE_ROLES: readonly WorkspaceRole[] = ["admin", "manager", "agent"];

export type AssistantAccessDenialReason =
  | "unauthenticated"
  | "not_a_member"
  | "actor_mismatch"
  | "role_not_allowed"
  | "plan_not_included"
  | "actions_disabled"
  | "internal_error";

export type AssistantAccessResult =
  | { ok: true; role: WorkspaceRole }
  | { ok: false; reason: AssistantAccessDenialReason };

/**
 * Todas las capacidades de escritura comparten hoy la misma puerta (paquete
 * WhatsApp+Gestión/Suite + kill switch de superadmin) — el parámetro queda
 * explícito para que cada tool declare de qué capacidad depende, y para que
 * una futura capacidad con requisitos distintos (p.ej. algo exclusivo de
 * Suite) tenga un único sitio donde diferenciarse sin tocar cada
 * herramienta una por una. whiteboard incluye deliberadamente solo
 * buscar/crear/renombrar — nada de scene_data (Fase 4C).
 */
export type AssistantCapability =
  | "clients"
  | "pipeline"
  | "projects"
  | "tasks"
  | "agenda"
  | "notes"
  | "content"
  | "whiteboard";

const DENIAL_MESSAGES: Record<AssistantAccessDenialReason, string> = {
  unauthenticated: "No autorizado",
  not_a_member: "Acceso denegado",
  actor_mismatch: "Acceso denegado",
  role_not_allowed: "Tu rol no permite usar esta función",
  plan_not_included: "Esta función no está incluida en tu plan",
  actions_disabled: "Las acciones del asistente están desactivadas para esta empresa",
  internal_error: "No se pudo comprobar tu acceso en este momento. Inténtalo de nuevo en unos segundos.",
};

export function assistantAccessErrorMessage(reason: AssistantAccessDenialReason): string {
  return DENIAL_MESSAGES[reason];
}

/**
 * Verifica, con datos frescos (nunca cacheados del HelpActionContext ni de
 * una comprobación previa), que ctx.actorUserId puede ejecutar `capability`
 * en ctx.workspaceId ahora mismo:
 *
 * 1. usuario existente — sesión válida y viva;
 * 2. actorUserId coincide exactamente con el usuario real de la sesión;
 * 3. membership activa en ctx.workspaceId;
 * 4. rol con permiso de escritura;
 * 5. paquete canónico + help_assistant_actions_enabled, vía canUseAssistantActions();
 * 6. la capacidad pedida está incluida (hoy las 4 comparten la misma puerta).
 */
export async function assertHelpActionAccess(
  ctx: HelpActionContext,
  _capability: AssistantCapability,
): Promise<AssistantAccessResult> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { ok: false, reason: "unauthenticated" };
  }

  if (user.id !== ctx.actorUserId) {
    return { ok: false, reason: "actor_mismatch" };
  }

  const { data: membership, error: membershipError } = await supabase
    .from("memberships")
    .select("role")
    .eq("workspace_id", ctx.workspaceId)
    .eq("user_id", user.id)
    .eq("is_active", true)
    .maybeSingle();

  if (membershipError) {
    console.error("[assistant-access] error leyendo membership:", membershipError.message);
    return { ok: false, reason: "internal_error" };
  }
  if (!membership) {
    return { ok: false, reason: "not_a_member" };
  }

  const role = membership.role as WorkspaceRole;
  if (!WRITE_ROLES.includes(role) || ROLE_RANK[role] === undefined) {
    return { ok: false, reason: "role_not_allowed" };
  }

  const { data: workspaceRow, error: workspaceError } = await supabase
    .from("workspaces")
    .select("product_package, help_assistant_actions_enabled")
    .eq("id", ctx.workspaceId)
    .maybeSingle();

  if (workspaceError) {
    console.error("[assistant-access] error leyendo el workspace:", workspaceError.message);
    return { ok: false, reason: "internal_error" };
  }

  const entitlements = resolveEntitlements(workspaceRow);
  const actionsEnabled = workspaceRow?.help_assistant_actions_enabled === true;

  if (!canUseAssistantActions(actionsEnabled, entitlements)) {
    return { ok: false, reason: actionsEnabled ? "plan_not_included" : "actions_disabled" };
  }

  return { ok: true, role };
}
