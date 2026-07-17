import type { IntegrationHealth, WhatsAppAgentType } from '../central-integrations/types';

// Single source for how IntegrationHealth (YCloud/Vapi channel health) and
// WhatsAppAgentType read across the admin UI — same pattern as statusStyles.ts.
export const INTEGRATION_HEALTH_LABEL_ES: Record<IntegrationHealth, string> = {
  unknown: 'Sin datos',
  healthy: 'Saludable',
  degraded: 'Con problemas',
  error: 'Error',
};

export const INTEGRATION_HEALTH_TW: Record<IntegrationHealth, string> = {
  unknown: 'text-white/45 border-white/10 bg-white/[0.03]',
  healthy: 'text-emerald-300/80 border-emerald-500/25 bg-emerald-500/[0.06]',
  degraded: 'text-amber-300/80 border-amber-500/25 bg-amber-500/[0.06]',
  error: 'text-rose-300/80 border-rose-500/25 bg-rose-500/[0.06]',
};

export const WHATSAPP_AGENT_TYPE_LABEL_ES: Record<WhatsAppAgentType, string> = {
  setter: 'Alta de leads (setter)',
  soporte: 'Soporte',
  agendamiento: 'Agendamiento',
};
