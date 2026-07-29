import type { CentralTask, CentralTaskState, TaskFilters, TaskPriority, TaskStats, TaskStatus } from './types';

const PRIORITY_RANK: Record<TaskPriority, number> = { urgent: 0, high: 1, normal: 2, low: 3 };

export function isTaskOverdue(task: CentralTask, now = Date.now()): boolean {
  return Boolean(task.dueAt && !['completed', 'cancelled'].includes(task.status) && Date.parse(task.dueAt) < now);
}

export function selectTasks(state: CentralTaskState, filters: TaskFilters = {}, now = Date.now()): CentralTask[] {
  const query = filters.query?.trim().toLocaleLowerCase('es') ?? '';
  return Object.values(state.tasks)
    .filter((task) => !filters.status || task.status === filters.status)
    .filter((task) => !filters.priority || task.priority === filters.priority)
    .filter((task) => !filters.assignedAgentId || task.assignedAgentId === filters.assignedAgentId)
    .filter((task) => !filters.contactId || task.contactId === filters.contactId)
    .filter((task) => !filters.source || task.source === filters.source)
    .filter((task) => !filters.overdueOnly || isTaskOverdue(task, now))
    .filter((task) => !query || [task.title, task.description, task.contactId].filter(Boolean).some((value) => value!.toLocaleLowerCase('es').includes(query)))
    .sort((a, b) => {
      const priority = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
      if (priority !== 0) return priority;
      return Date.parse(b.updatedAt) - Date.parse(a.updatedAt);
    });
}

export function selectTask(state: CentralTaskState, taskId: string): CentralTask | null {
  return state.tasks[taskId] ?? null;
}

export function selectTaskHistory(state: CentralTaskState, taskId: string) {
  return state.history.filter((entry) => entry.taskId === taskId).sort((a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt));
}

export function selectTaskBoard(state: CentralTaskState): Record<TaskStatus, CentralTask[]> {
  const statuses: TaskStatus[] = ['pending', 'in_progress', 'approval_required', 'blocked', 'completed', 'failed', 'cancelled'];
  return Object.fromEntries(statuses.map((status) => [status, selectTasks(state, { status })])) as Record<TaskStatus, CentralTask[]>;
}

export function selectTaskStats(state: CentralTaskState, now = Date.now()): TaskStats {
  const tasks = Object.values(state.tasks);
  return {
    total: tasks.length,
    pending: tasks.filter((task) => task.status === 'pending').length,
    inProgress: tasks.filter((task) => task.status === 'in_progress').length,
    approvalRequired: tasks.filter((task) => task.status === 'approval_required').length,
    blocked: tasks.filter((task) => task.status === 'blocked').length,
    completed: tasks.filter((task) => task.status === 'completed').length,
    failed: tasks.filter((task) => task.status === 'failed').length,
    overdue: tasks.filter((task) => isTaskOverdue(task, now)).length,
  };
}
