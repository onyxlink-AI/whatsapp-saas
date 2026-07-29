import type { WorkspaceWhatsAppBindingState } from '../central-integrations/whatsapp-binding';

// Single source for how WorkspaceWhatsAppBindingState (src/central-integrations/whatsapp-binding.ts,
// Codex's contract) reads across the admin UI — same pattern as statusStyles.ts.
export const WHATSAPP_BINDING_STATE_LABEL_ES: Record<WorkspaceWhatsAppBindingState, string> = {
  ready: 'WhatsApp conectado',
  workspace_mismatch: 'Pertenece a otro workspace',
  not_connected: 'Sin conexión de WhatsApp',
  number_missing: 'Sin número vinculado',
  integration_unhealthy: 'YCloud con problemas',
  agent_inactive: 'Sin agente WhatsApp activo',
};

export const WHATSAPP_BINDING_STATE_TW: Record<WorkspaceWhatsAppBindingState, string> = {
  ready: 'text-emerald-300/80 border-emerald-500/25 bg-emerald-500/[0.06]',
  workspace_mismatch: 'text-rose-300/80 border-rose-500/25 bg-rose-500/[0.06]',
  not_connected: 'text-white/45 border-white/10 bg-white/[0.03]',
  number_missing: 'text-white/45 border-white/10 bg-white/[0.03]',
  integration_unhealthy: 'text-amber-300/80 border-amber-500/25 bg-amber-500/[0.06]',
  agent_inactive: 'text-white/45 border-white/10 bg-white/[0.03]',
};
