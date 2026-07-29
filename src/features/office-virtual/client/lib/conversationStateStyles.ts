import type { ConversationState } from '../central-contacts/types';
import type { InboxPriority, InboxThreadStatus } from '../central-inbox/types';

// Single source for how ConversationState (src/central-contacts), InboxThreadStatus
// and InboxPriority (src/central-inbox, Codex's contract) read across the app —
// same pattern as statusStyles.ts. Shared by BandejaView and Contact360Panel
// so the two never drift.
export const CONVERSATION_STATE_LABEL_ES: Record<ConversationState, string> = {
  ai_active: 'IA respondiendo',
  human_active: 'Persona respondiendo',
  handoff_pending: 'Esperando handoff',
  waiting_reply: 'Esperando respuesta del contacto',
  paused: 'Pausada',
  closed: 'Cerrada',
};

export const INBOX_STATUS_LABEL_ES: Record<InboxThreadStatus, string> = {
  open: 'Abierta',
  waiting: 'Esperando respuesta',
  handoff: 'Handoff a humano',
  closed: 'Cerrada',
};

export const INBOX_STATUS_TW: Record<InboxThreadStatus, string> = {
  open: 'text-emerald-300/80 border-emerald-500/25 bg-emerald-500/[0.06]',
  waiting: 'text-white/50 border-white/10 bg-white/[0.03]',
  handoff: 'text-amber-300/80 border-amber-500/25 bg-amber-500/[0.06]',
  closed: 'text-white/30 border-white/10 bg-white/[0.03]',
};

export const INBOX_PRIORITY_LABEL_ES: Record<InboxPriority, string> = {
  urgent: 'Urgente',
  high: 'Alta',
  normal: 'Normal',
  low: 'Baja',
};

export const INBOX_PRIORITY_TW: Record<InboxPriority, string> = {
  urgent: 'text-rose-300/80 border-rose-500/25 bg-rose-500/[0.06]',
  high: 'text-amber-300/80 border-amber-500/25 bg-amber-500/[0.06]',
  normal: 'text-white/45 border-white/10 bg-white/[0.03]',
  low: 'text-white/30 border-white/10 bg-white/[0.03]',
};

// Contact360.attentionReasons / InboxThread.attentionReasons are free-form
// string codes from central-contacts; unknown codes fall back to the raw
// value so a new one is visible (never silently hidden) while this map lags.
export const ATTENTION_REASON_LABEL_ES: Record<string, string> = {
  handoff_pending: 'Esperando el paso a un humano',
  message_failed: 'Un mensaje de WhatsApp falló al enviarse',
  pending_tasks: 'Tiene tareas pendientes',
};
