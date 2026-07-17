import type {
  OpenRouterCostProfile,
  OpenRouterExecutionBlockerCode,
  OrchestratorConnectionStatus,
  OrchestratorMode,
  OrchestratorMutationErrorCode,
  ResolvedOpenRouterModel,
} from '../central-orchestrator';
import type { OpenRouterConnectionKind, OpenRouterConnectionRequestResult, OpenRouterConnectionStatus as OpenRouterWorkspaceConnectionStatus } from '../central-orchestration';

// Same pattern as statusStyles.ts — single source for how central-orchestrator's
// enums read across the connection-settings UI.
export const ORCHESTRATOR_MODE_LABEL_ES: Record<OrchestratorMode, string> = {
  openrouter: 'OpenRouter (chat nativo)',
  hermes_telegram: 'Hermes como Orquestador',
};

export const ORCHESTRATOR_MODE_DESCRIPTION_ES: Record<OrchestratorMode, string> = {
  openrouter: 'El Coordinador de esta oficina piensa por sí mismo, con un modelo servido a través de OpenRouter.',
  hermes_telegram: 'Hermes recibe órdenes por canal externo: chat directo, grupo con bot o voz, y coordina la Oficina Virtual.',
};

export const ORCHESTRATOR_STATUS_LABEL_ES: Record<OrchestratorConnectionStatus, string> = {
  not_configured: 'Sin configurar',
  pending: 'Configurado, sin verificar',
  connected: 'Conectado',
  error: 'Error',
};

export const ORCHESTRATOR_STATUS_TW: Record<OrchestratorConnectionStatus, string> = {
  not_configured: 'text-white/45 border-white/10 bg-white/[0.03]',
  pending: 'text-amber-300/80 border-amber-500/25 bg-amber-500/[0.06]',
  connected: 'text-emerald-300/80 border-emerald-500/25 bg-emerald-500/[0.06]',
  error: 'text-rose-300/80 border-rose-500/25 bg-rose-500/[0.06]',
};

export const ORCHESTRATOR_ERROR_LABEL_ES: Record<OrchestratorMutationErrorCode, string> = {
  workspace_mismatch: 'La solicitud no corresponde a este workspace.',
  unauthorized: 'Solo superadministración puede editar esta conexión.',
  stale_revision: 'Alguien más cambió esta configuración mientras editabas. Vuelve a intentarlo.',
  invalid_endpoint: 'El endpoint debe ser una URL https:// válida.',
  invalid_model_policy: 'La política de modelos contiene límites o valores no válidos.',
};

export const OPENROUTER_COST_PROFILE_LABEL_ES: Record<OpenRouterCostProfile, string> = {
  economy: 'Económico',
  balanced: 'Equilibrado',
  premium: 'Premium',
};

export const OPENROUTER_COST_PROFILE_TW: Record<OpenRouterCostProfile, string> = {
  economy: 'text-emerald-300/80 border-emerald-500/25 bg-emerald-500/[0.06]',
  balanced: 'text-sky-300/80 border-sky-500/25 bg-sky-500/[0.06]',
  premium: 'text-amber-300/80 border-amber-500/25 bg-amber-500/[0.06]',
};

export const MODEL_BLOCKER_LABEL_ES: Record<ResolvedOpenRouterModel['blockers'][number], string> = {
  api_key_missing: 'Falta la API key en el backend',
  model_missing: 'Sin modelo asignado todavía',
  premium_not_allowed: 'Modelo premium no permitido para este puesto',
};

export const OPENROUTER_EXECUTION_BLOCKER_LABEL_ES: Record<OpenRouterExecutionBlockerCode, string> = {
  agent_not_openrouter_managed: 'Este puesto conserva su propia conexión y política',
  orchestrator_not_openrouter: 'El workspace no está en modo OpenRouter',
  openrouter_not_connected: 'OpenRouter no está conectado en el backend',
  ...MODEL_BLOCKER_LABEL_ES,
};

export const OPENROUTER_CONNECTION_KIND_LABEL_ES: Record<OpenRouterConnectionKind, string> = {
  shared: 'Conexión compartida',
  dedicated: 'Conexión dedicada',
};

export const OPENROUTER_CONNECTION_KIND_DESCRIPTION_ES: Record<OpenRouterConnectionKind, string> = {
  shared: 'Reutiliza la conexión de OpenRouter que el backend ya gestiona para este workspace.',
  dedicated: 'Provisiona una conexión de OpenRouter exclusiva para este workspace, con sus propios límites.',
};

export const OPENROUTER_CONNECTION_STATUS_LABEL_ES: Record<OpenRouterWorkspaceConnectionStatus, string> = {
  not_configured: 'Sin configurar',
  pending: 'Pendiente del backend',
  connected: 'Conectado',
  error: 'Error',
  revoked: 'Revocado',
};

export const OPENROUTER_CONNECTION_STATUS_TW: Record<OpenRouterWorkspaceConnectionStatus, string> = {
  not_configured: 'text-white/45 border-white/10 bg-white/[0.03]',
  pending: 'text-amber-300/80 border-amber-500/25 bg-amber-500/[0.06]',
  connected: 'text-emerald-300/80 border-emerald-500/25 bg-emerald-500/[0.06]',
  error: 'text-rose-300/80 border-rose-500/25 bg-rose-500/[0.06]',
  revoked: 'text-white/40 border-white/15 bg-white/[0.04]',
};

export const OPENROUTER_CONNECTION_ERROR_LABEL_ES: Record<Extract<OpenRouterConnectionRequestResult, { status: 'rejected' }>['code'], string> = {
  invalid_connection_request: 'La solicitud de conexión no es válida.',
  workspace_mismatch: 'La solicitud no corresponde a este workspace.',
  unauthorized: 'Solo administración del workspace puede gestionar esta conexión.',
  operation_in_progress: 'Ya hay una operación pendiente del backend — espera a que termine.',
  connection_active: 'Ya existe una conexión activa. Revócala antes de crear otra.',
  connection_missing: 'Todavía no hay ninguna conexión que verificar o revocar.',
  connection_revoked: 'Esta conexión fue revocada — crea una nueva para reconectar.',
};
