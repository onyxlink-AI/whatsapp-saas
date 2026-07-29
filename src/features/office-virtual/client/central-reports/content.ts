import type { BuildReportContentInput, ReportContent, ReportMetric, ReportSection } from './types';

const metric = (id: string, label: string, value: number, unit: ReportMetric['unit'] = 'count'): ReportMetric => ({ id, label, value, unit });

export function buildReportContent({ kind, analytics, agentIds = [] }: BuildReportContentInput): ReportContent {
  const selectedAgents = analytics.agents.filter((agent) => agentIds.length === 0 || agentIds.includes(agent.agentId));
  const commonMetrics = [
    metric('activities', 'Actividades', analytics.activity.current.activities),
    metric('completed', 'Completadas', analytics.activity.current.completed),
    metric('completion-rate', 'Tasa de finalización', analytics.activity.current.completionRate, 'percent'),
  ];
  let metrics = commonMetrics;
  let sections: ReportSection[] = [];

  if (kind === 'overview') {
    metrics = [
      ...commonMetrics,
      metric('tasks', 'Tareas creadas', analytics.tasks.createdInPeriod),
      metric('routine-runs', 'Ejecuciones de rutinas', analytics.routines.runsInPeriod),
    ];
  } else if (kind === 'agents') {
    sections = [{
      id: 'agents', title: 'Carga por agente', columns: ['agentId', 'assigned', 'open', 'completed', 'overdue', 'routines'],
      rows: selectedAgents.map((agent) => ({
        agentId: agent.agentId, assigned: agent.assignedTasks, open: agent.openTasks,
        completed: agent.completedTasks, overdue: agent.overdueTasks, routines: agent.activeRoutines,
      })),
    }];
  } else if (kind === 'channels') {
    sections = [{
      id: 'channels', title: 'Actividad por canal', columns: ['channel', 'activities'],
      rows: Object.entries(analytics.activity.current.bySource).map(([channel, activities]) => ({ channel, activities })),
    }];
  } else if (kind === 'tasks') {
    metrics = [
      metric('created', 'Creadas', analytics.tasks.createdInPeriod),
      metric('completed', 'Completadas', analytics.tasks.completedInPeriod),
      metric('failed', 'Fallidas', analytics.tasks.failedInPeriod),
      metric('completion-rate', 'Tasa de finalización', analytics.tasks.completionRate, 'percent'),
      metric('average-completion', 'Tiempo medio', analytics.tasks.averageCompletionMs ?? 0, 'milliseconds'),
    ];
  } else if (kind === 'routines') {
    metrics = [
      metric('runs', 'Ejecuciones', analytics.routines.runsInPeriod),
      metric('completed', 'Completadas', analytics.routines.completedRuns),
      metric('failed', 'Fallidas', analytics.routines.failedRuns),
      metric('cancelled', 'Canceladas', analytics.routines.cancelledRuns),
      metric('success-rate', 'Tasa de éxito', analytics.routines.successRate, 'percent'),
    ];
  } else if (kind === 'approvals') {
    metrics = [
      metric('required', 'Aprobaciones requeridas', analytics.activity.current.approvalsRequired),
      metric('average-wait', 'Espera media', analytics.tasks.averageApprovalWaitMs ?? 0, 'milliseconds'),
      metric('pending', 'Pendientes actuales', analytics.tasks.snapshot.approvalRequired),
    ];
  } else {
    metrics = [
      metric('failed', 'Fallos', analytics.activity.current.failed),
      metric('blocked', 'Bloqueos', analytics.activity.current.blocked),
      metric('failed-tasks', 'Tareas fallidas', analytics.tasks.failedInPeriod),
      metric('failed-runs', 'Rutinas fallidas', analytics.routines.failedRuns),
    ];
  }

  return { analyticsGeneratedAt: analytics.generatedAt, metrics, sections };
}
