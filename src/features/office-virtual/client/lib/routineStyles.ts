import type { RoutineFrequency, RoutineHistoryAction, RoutineStatus } from '../hooks/useRoutineFeed';

export const ROUTINE_FREQUENCY_LABEL_ES: Record<RoutineFrequency, string> = {
  once: 'Una vez',
  daily: 'Diaria',
  weekly: 'Semanal',
  monthly: 'Mensual',
};

export const ROUTINE_STATUS_LABEL_ES: Record<RoutineStatus, string> = {
  active: 'Activa',
  paused: 'Pausada',
};

export const ROUTINE_STATUS_TW: Record<RoutineStatus, string> = {
  active: 'text-emerald-300/80 border-emerald-500/25 bg-emerald-500/[0.06]',
  paused: 'text-white/40 border-white/10 bg-white/[0.03]',
};

export const ROUTINE_HISTORY_ACTION_LABEL_ES: Record<RoutineHistoryAction, string> = {
  created: 'Creada',
  updated: 'Editada',
  activated: 'Activada',
  paused: 'Pausada',
  archived: 'Archivada',
  run_queued: 'Ejecución en cola',
  run_started: 'Ejecución iniciada',
  run_completed: 'Ejecución completada',
  run_failed: 'Ejecución fallida',
  run_cancelled: 'Ejecución cancelada',
};

export const WEEKDAY_LABEL_ES = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
export const WEEKDAY_SHORT_ES = ['D', 'L', 'M', 'X', 'J', 'V', 'S'];
export const MONTH_LABEL_ES = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
];
