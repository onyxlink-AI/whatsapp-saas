// Shared, typed vocabulary for "why can't/won't this message go out right
// now" — used identically by the real sender (reminder-sender.ts) and the
// safe simulator (/reminders/simulate) so they can never silently drift
// apart. Every reason here maps to a plain-Spanish, non-technical label for
// the UI (REASON_LABELS_ES) — never surface these raw keys to end users.

export const SEND_BLOCK_REASONS = [
  "live_sending_disabled",
  "recipient_not_allowlisted",
  "consent_missing",
  "template_not_approved",
  "workspace_paused",
  "contact_paused",
  "opted_out",
  "outside_allowed_hours",
  "daily_limit_reached",
  "too_soon_after_last_message",
  "agent_not_configured",
  "whatsapp_not_connected",
  "openrouter_not_available",
] as const;

export type SendBlockReason = (typeof SEND_BLOCK_REASONS)[number];

export interface SendGateResult {
  allowed: boolean;
  /** Empty when allowed. Never truncated — the simulator shows all of them at once. */
  blockedReasons: SendBlockReason[];
}

/**
 * Plain-Spanish, non-technical labels for the UI (task requirement: no
 * internal terms like workspace/cron/job/binding/provider/payload). Kept
 * here so the API layer and any future UI component read from one place.
 */
export const REASON_LABELS_ES: Record<SendBlockReason, string> = {
  live_sending_disabled: "Envíos reales bloqueados",
  recipient_not_allowlisted: "Número no autorizado para pruebas",
  consent_missing: "Falta el consentimiento del cliente",
  template_not_approved: "Falta una plantilla de WhatsApp aprobada",
  workspace_paused: "La secuencia está pausada",
  contact_paused: "El seguimiento de este cliente está pausado",
  opted_out: "El cliente pidió no recibir más mensajes",
  outside_allowed_hours: "Fuera del horario permitido",
  daily_limit_reached: "Se alcanzó el límite de mensajes de hoy para este cliente",
  too_soon_after_last_message: "Muy pronto después del último mensaje a este cliente",
  agent_not_configured: "El agente no está configurado o activo",
  whatsapp_not_connected: "WhatsApp no está conectado",
  openrouter_not_available: "El modelo de IA no está disponible",
};

/**
 * Overall, coarse status for the UI (task section 10) — derived from the
 * detailed reasons above, never invented separately. "simulation" and
 * "ready" are mutually exclusive with every blocked reason.
 */
export type ReminderUiStatus =
  | "simulation"
  | "live_sending_blocked"
  | "consent_missing"
  | "template_not_approved"
  | "recipient_not_allowlisted"
  | "outside_allowed_hours"
  | "sequence_paused"
  | "ready"
  | "stopped_for_safety";

export const UI_STATUS_LABELS_ES: Record<ReminderUiStatus, string> = {
  simulation: "🧪 Modo simulación",
  live_sending_blocked: "Envíos reales bloqueados",
  consent_missing: "Falta consentimiento",
  template_not_approved: "Falta plantilla aprobada",
  recipient_not_allowlisted: "Número no autorizado",
  outside_allowed_hours: "Fuera del horario",
  sequence_paused: "Secuencia pausada",
  ready: "Preparado técnicamente",
  stopped_for_safety: "⚠️ Detenido por seguridad",
};
