import type { RoutineCommand } from './types';

export function createRoutineFixtures(workspaceId = 'workspace-demo'): RoutineCommand[] {
  const actor = { actorId: 'admin-demo', role: 'workspace_admin' as const };
  return [
    {
      type: 'routine.created', commandId: 'routine-command-1', routineId: 'routine-daily-follow-up', workspaceId,
      actor, occurredAt: '2026-07-15T08:00:00.000Z', name: 'Seguimiento diario de oportunidades',
      description: 'Crea tareas para revisar oportunidades abiertas.', assignedAgentId: 'proposal',
      schedule: { kind: 'daily', timezone: 'Europe/Madrid', time: '09:00', daysOfWeek: [], dayOfMonth: null, scheduledAt: null },
      taskTemplate: { title: 'Revisar oportunidades abiertas', description: 'Priorizar el siguiente contacto.', priority: 'high', source: 'routine', requiresApproval: false },
    },
    {
      type: 'routine.activated', commandId: 'routine-command-2', routineId: 'routine-daily-follow-up', workspaceId,
      expectedRevision: 1, actor, occurredAt: '2026-07-15T08:01:00.000Z', nextRunAt: '2026-07-16T07:00:00.000Z',
    },
    {
      type: 'routine.created', commandId: 'routine-command-3', routineId: 'routine-weekly-quality', workspaceId,
      actor, occurredAt: '2026-07-15T08:02:00.000Z', name: 'Revisión semanal de calidad',
      assignedAgentId: 'review-qa', schedule: { kind: 'weekly', timezone: 'Europe/Madrid', time: '16:30', daysOfWeek: [5], dayOfMonth: null, scheduledAt: null },
      taskTemplate: { title: 'Auditar conversaciones de la semana', description: '', priority: 'normal', source: 'routine', requiresApproval: true },
    },
  ];
}
