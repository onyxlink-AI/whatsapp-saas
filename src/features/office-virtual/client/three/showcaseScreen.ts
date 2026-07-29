export type ShowcaseScreenKind =
  | 'brand'
  | 'whatsapp'
  | 'voice'
  | 'chatbot'
  | 'analytics'
  | 'social'
  | 'proposals'
  | 'finance'
  | 'security'
  | 'calendar'
  | 'quality'
  | 'generic';

type ShowcaseAgent = {
  id: string;
  name: string;
  department: string;
};

function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

/**
 * Selects a decorative dashboard for Presentation mode. Empty seats are
 * deliberately resolved first and always receive the neutral visual: their
 * real role must never be inferable from the wall screen.
 */
export function resolveShowcaseScreenKind(agent: ShowcaseAgent, occupied: boolean): ShowcaseScreenKind {
  if (!occupied) return 'generic';

  if (agent.id === 'coordinator') return 'brand';
  if (agent.id === 'lead-intake') return 'whatsapp';
  if (agent.id === 'strategy') return 'voice';
  if (agent.id === 'chatbot') return 'chatbot';

  const role = normalize(`${agent.name} ${agent.department}`);

  if (/ciber|seguridad|security|riesgo/.test(role)) return 'security';
  if (/finanz|contab|factur|tesorer|fiscal/.test(role)) return 'finance';
  if (/social|community|contenido|marketing|redes/.test(role)) return 'social';
  if (/venta|sdr|comercial|presupuesto|propuesta/.test(role)) return 'proposals';
  if (/agenda|calendario|cita|reserva/.test(role)) return 'calendar';
  if (/calidad|revision|qa|soporte|atencion|cliente/.test(role)) return 'quality';
  if (/dato|anal|administr|gestion|operacion|empresa/.test(role)) return 'analytics';

  return 'generic';
}
