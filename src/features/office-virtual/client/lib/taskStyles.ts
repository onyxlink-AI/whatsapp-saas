import type { TaskHistoryAction, TaskPriority, TaskStatus } from '../hooks/useTaskFeed';

export const TASK_STATUS_LABEL_ES: Record<TaskStatus, string> = {
  pending: 'Pendiente',
  in_progress: 'En curso',
  approval_required: 'Requiere aprobación',
  blocked: 'Bloqueada',
  completed: 'Completada',
  failed: 'Fallida',
  cancelled: 'Cancelada',
};

export const TASK_STATUS_TW: Record<TaskStatus, string> = {
  pending: 'text-white/45 border-white/10 bg-white/[0.03]',
  in_progress: 'text-amber-300/80 border-amber-500/25 bg-amber-500/[0.06]',
  approval_required: 'text-fuchsia-300/80 border-fuchsia-500/25 bg-fuchsia-500/[0.06]',
  blocked: 'text-orange-300/80 border-orange-500/25 bg-orange-500/[0.06]',
  completed: 'text-emerald-300/80 border-emerald-500/25 bg-emerald-500/[0.06]',
  failed: 'text-rose-300/80 border-rose-500/25 bg-rose-500/[0.06]',
  cancelled: 'text-white/30 border-white/10 bg-white/[0.03]',
};

export const TASK_PRIORITY_LABEL_ES: Record<TaskPriority, string> = {
  urgent: 'Urgente',
  high: 'Alta',
  normal: 'Normal',
  low: 'Baja',
};

export const TASK_PRIORITY_TW: Record<TaskPriority, string> = {
  urgent: 'text-rose-300/80 border-rose-500/25 bg-rose-500/[0.06]',
  high: 'text-amber-300/80 border-amber-500/25 bg-amber-500/[0.06]',
  normal: 'text-white/45 border-white/10 bg-white/[0.03]',
  low: 'text-white/30 border-white/10 bg-white/[0.03]',
};

export const TASK_HISTORY_ACTION_LABEL_ES: Record<TaskHistoryAction, string> = {
  created: 'Creada',
  updated: 'Editada',
  assigned: 'Asignada',
  started: 'Iniciada',
  approval_requested: 'Aprobación solicitada',
  approval_approved: 'Aprobada',
  approval_rejected: 'Rechazada',
  blocked: 'Bloqueada',
  completed: 'Completada',
  failed: 'Fallida',
  cancelled: 'Cancelada',
  reopened: 'Reabierta',
};

export const TASK_BOARD_COLUMNS: TaskStatus[] = [
  'pending',
  'in_progress',
  'approval_required',
  'blocked',
  'completed',
  'failed',
  'cancelled',
];
