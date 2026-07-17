import type {
  OfficeApprovalPolicy,
  OfficeConfigurationStatus,
  OfficeSpecialistAction,
} from '../central-integrations/configuration';

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
  workspace_mismatch: 'La solicitud no corresponde a este workspace.',
  stale_revision: 'Alguien más cambió la configuración mientras editabas. Vuelve a intentarlo.',
  unknown_specialist: 'Ese especialista no existe en la plantilla.',
  protected_seat: 'No se puede modificar un puesto fijo (Orquestador, WhatsApp o Voz).',
  revision_not_found: 'Esa revisión no existe en el historial.',
  invalid_configuration: 'Algunos campos no son válidos.',
};
