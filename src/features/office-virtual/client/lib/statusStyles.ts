import type { OfficeActivitySource } from '../central-events/types';
import type { AgentStatus } from '../types';

// Single source for how each AgentRuntimeStatus (src/central-events/types.ts)
// reads across the app — hex for Three.js materials, a Tailwind class for
// DOM dots, and the Spanish label. Consumed by TopBar, ChatPanel,
// MinecraftCharacter and ActividadView so the palette never drifts between them.
export const STATUS_LABEL_ES: Record<AgentStatus, string> = {
  available: 'Disponible',
  queued: 'En cola',
  working: 'Trabajando',
  completed: 'Completado',
  failed: 'Error',
  blocked: 'Bloqueado',
  approval_required: 'Requiere aprobación',
};

export const STATUS_HEX: Record<AgentStatus, string> = {
  available: '#34d399',
  queued: '#38bdf8',
  working: '#fbbf24',
  completed: '#5eead4',
  failed: '#f43f5e',
  blocked: '#f97316',
  approval_required: '#e879f9',
};

export const STATUS_TW_BG: Record<AgentStatus, string> = {
  available: 'bg-emerald-400',
  queued: 'bg-sky-400',
  working: 'bg-amber-400',
  completed: 'bg-teal-300',
  failed: 'bg-rose-500',
  blocked: 'bg-orange-500',
  approval_required: 'bg-fuchsia-400',
};

export const SOURCE_LABEL_ES: Record<OfficeActivitySource, string> = {
  whatsapp: 'WhatsApp',
  voice: 'Voz',
  manual: 'Manual',
  automation: 'Automatización',
};

export const SOURCE_TW_TEXT: Record<OfficeActivitySource, string> = {
  whatsapp: 'text-emerald-300',
  voice: 'text-sky-300',
  manual: 'text-violet-300',
  automation: 'text-amber-300',
};
