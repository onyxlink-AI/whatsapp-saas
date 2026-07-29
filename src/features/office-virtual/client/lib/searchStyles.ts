import type { GlobalSearchCategory } from '../central-search';

// Single source for how GlobalSearchCategory (src/central-search, Codex's
// contract) reads across the app — same pattern as statusStyles.ts.
export const SEARCH_CATEGORY_LABEL_ES: Record<GlobalSearchCategory, string> = {
  contact: 'Contactos',
  conversation: 'Conversaciones',
  task: 'Tareas',
  routine: 'Rutinas',
  memory: 'Memoria',
  activity: 'Actividad',
};

export const SEARCH_CATEGORY_ORDER: GlobalSearchCategory[] = [
  'contact',
  'conversation',
  'task',
  'routine',
  'memory',
  'activity',
];

export const SEARCH_CATEGORY_TW: Record<GlobalSearchCategory, string> = {
  contact: 'text-sky-300/80 border-sky-500/25 bg-sky-500/[0.06]',
  conversation: 'text-emerald-300/80 border-emerald-500/25 bg-emerald-500/[0.06]',
  task: 'text-amber-300/80 border-amber-500/25 bg-amber-500/[0.06]',
  routine: 'text-violet-300/80 border-violet-400/25 bg-violet-500/[0.06]',
  memory: 'text-fuchsia-300/80 border-fuchsia-500/25 bg-fuchsia-500/[0.06]',
  activity: 'text-white/50 border-white/10 bg-white/[0.03]',
};

export const SEARCH_ERROR_LABEL_ES: Record<string, string> = {
  unauthorized: 'No tienes permiso para buscar en este workspace.',
  workspace_mismatch: 'La búsqueda no corresponde a este workspace.',
};
