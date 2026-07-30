import type {
  OfficeApprovalPolicy,
  OfficeConfigurationStatus,
  OfficeSpecialistAction,
} from '../central-integrations/configuration';
import type { CapabilityStatus, SpecialistWorkStatus } from '../central-integrations/specialist-readiness';

// Single source for how Codex's configuration contract (src/central-integrations/configuration.ts)
// reads across the configurator UI — same pattern as statusStyles.ts.
export const SPECIALIST_ACTION_LABEL_ES: Record<OfficeSpecialistAction, string> = {
  read_contacts: 'Leer contactos',
  read_memory: 'Leer memoria',
  draft_message: 'Redactar mensajes',
  send_message: 'Enviar mensajes',
  create_task: 'Crear tareas',
  update_pipeline: 'Actualizar pipeline',
  schedule_call: 'Agendar llamadas',
  request_handoff: 'Solicitar handoff',
};

export const APPROVAL_POLICY_LABEL_ES: Record<OfficeApprovalPolicy, string> = {
  always: 'Siempre requiere aprobación',
  sensitive_only: 'Solo en acciones sensibles',
  never: 'Sin aprobación humana',
};

export const CONFIGURATION_STATUS_LABEL_ES: Record<OfficeConfigurationStatus, string> = {
  draft: 'Borrador',
  published: 'Publicada',
};

export const CONFIGURATION_STATUS_TW: Record<OfficeConfigurationStatus, string> = {
  draft: 'text-amber-300/80 border-amber-500/25 bg-amber-500/[0.06]',
  published: 'text-emerald-300/80 border-emerald-500/25 bg-emerald-500/[0.06]',
};

export const CONFIGURATION_ERROR_LABEL_ES: Record<string, string> = {
  unauthorized: 'Solo superadministración puede editar la plantilla.',
  workspace_mismatch: 'La solicitud no corresponde a esta empresa.',
  stale_revision: 'Alguien guardó cambios antes que tú. Vuelve a cargar e inténtalo de nuevo.',
  unknown_specialist: 'Ese especialista no existe en la plantilla.',
  protected_seat: 'No se puede modificar un puesto fijo (Orquestador, WhatsApp, Voz o Chatbot).',
  unknown_vertical: 'Ese sector no existe en el catálogo.',
  revision_mismatch: 'Esa revisión no existe en el historial.',
  invalid_configuration: 'Algunos campos no son válidos.',
  openrouter_not_connected: 'Conecta OpenRouter en Ajustes → Integraciones antes de activar este especialista.',
};

// ── Specialist readiness (specialist-readiness.ts) — Configurador cards ────────

export const SPECIALIST_WORK_STATUS_LABEL_ES: Record<SpecialistWorkStatus, string> = {
  not_configured: 'Sin configurar',
  needs_attention: 'Necesita atención',
  ready_to_help: 'Preparado para ayudar',
  active: 'Activo',
};

export const SPECIALIST_WORK_STATUS_TW: Record<SpecialistWorkStatus, string> = {
  not_configured: 'text-white/40 border-white/10 bg-white/[0.03]',
  needs_attention: 'text-amber-300/80 border-amber-500/25 bg-amber-500/[0.06]',
  ready_to_help: 'text-sky-300/80 border-sky-500/25 bg-sky-500/[0.06]',
  active: 'text-emerald-300/80 border-emerald-500/25 bg-emerald-500/[0.06]',
};

export const CAPABILITY_STATUS_LABEL_ES: Record<CapabilityStatus, string> = {
  available: 'Disponible',
  needs_approval: 'Requiere aprobación',
  missing_connection: 'Falta conectar',
  not_available: 'No disponible actualmente',
};

export const CAPABILITY_STATUS_TW: Record<CapabilityStatus, string> = {
  available: 'text-emerald-300/80',
  needs_approval: 'text-[#A0DCDB]/80',
  missing_connection: 'text-amber-300/80',
  not_available: 'text-white/30',
};
