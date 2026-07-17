import { AGENT_ORDER } from '../../agents/registry';
import { resolveAnalyticsPeriod, selectPeriodAnalytics } from '../central-events';
import type { OfficeActivityEvent } from '../central-events';
import { selectRoutineStats } from '../central-routines';
import type { CentralRoutineState, RoutineRun } from '../central-routines';
import { isTaskOverdue, selectTaskStats } from '../central-tasks';
import type { CentralTaskState, TaskHistoryEntry, TaskSource } from '../central-tasks';
import type { AnalyticsActor, AnalyticsInput, RoutineAnalytics, TaskAnalytics, WorkspaceAnalyticsResult } from './types';

const TASK_SOURCES: TaskSource[] = ['manual', 'whatsapp', 'voice', 'automation', 'routine'];

function inRange(timestamp: string | null, startAt: number, endAt: number): boolean {
  if (!timestamp) return false;
  const time = Date.parse(timestamp);
  return Number.isFinite(time) && time >= startAt && time < endAt;
}

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return Math.round(values.reduce((total, value) => total + value, 0) / values.length);
}

function percent(numerator: number, denominator: number): number {
  if (denominator === 0) return 0;
  return Math.round((numerator / denominator) * 1_000) / 10;
}

function approvalDurations(history: TaskHistoryEntry[], startAt: number, endAt: number): number[] {
  const byTask = new Map<string, TaskHistoryEntry[]>();
  for (const entry of history) {
    const entries = byTask.get(entry.taskId) ?? [];
    entries.push(entry);
    byTask.set(entry.taskId, entries);
  }

  const durations: number[] = [];
  for (const entries of byTask.values()) {
    const ordered = [...entries].sort((a, b) => Date.parse(a.occurredAt) - Date.parse(b.occurredAt));
    for (let index = 0; index < ordered.length; index += 1) {
      if (ordered[index].action !== 'approval_requested') continue;
      const resolved = ordered.slice(index + 1).find((entry) =>
        entry.action === 'approval_approved' || entry.action === 'approval_rejected',
      );
      if (!resolved || !inRange(resolved.occurredAt, startAt, endAt)) continue;
      durations.push(Math.max(0, Date.parse(resolved.occurredAt) - Date.parse(ordered[index].occurredAt)));
    }
  }
  return durations;
}

function taskAnalytics(state: CentralTaskState, startAt: number, endAt: number, now: number): TaskAnalytics {
  const tasks = Object.values(state.tasks);
  const completed = tasks.filter((task) => task.status === 'completed' && inRange(task.completedAt, startAt, endAt));
  const failed = tasks.filter((task) => task.status === 'failed' && inRange(task.updatedAt, startAt, endAt));
  const bySource = Object.fromEntries(TASK_SOURCES.map((source) => [source, 0])) as Record<TaskSource, number>;
  for (const task of tasks.filter((item) => inRange(item.createdAt, startAt, endAt))) bySource[task.source] += 1;

  return {
    snapshot: selectTaskStats(state, now),
    createdInPeriod: tasks.filter((task) => inRange(task.createdAt, startAt, endAt)).length,
    completedInPeriod: completed.length,
    failedInPeriod: failed.length,
    completionRate: percent(completed.length, completed.length + failed.length),
    averageCompletionMs: average(completed.map((task) => Math.max(0, Date.parse(task.completedAt!) - Date.parse(task.createdAt)))),
    averageApprovalWaitMs: average(approvalDurations(state.history, startAt, endAt)),
    bySource,
  };
}

function routineAnalytics(state: CentralRoutineState, startAt: number, endAt: number): RoutineAnalytics {
  const runs = Object.values(state.runs).filter((run) => inRange(run.queuedAt, startAt, endAt));
  const completed = runs.filter((run) => run.status === 'completed');
  const failed = runs.filter((run) => run.status === 'failed');
  const cancelled = runs.filter((run) => run.status === 'cancelled');
  const durations = runs
    .filter((run): run is RoutineRun & { startedAt: string; finishedAt: string } => Boolean(run.startedAt && run.finishedAt))
    .map((run) => Math.max(0, Date.parse(run.finishedAt) - Date.parse(run.startedAt)));

  return {
    snapshot: selectRoutineStats(state),
    runsInPeriod: runs.length,
    completedRuns: completed.length,
    failedRuns: failed.length,
    cancelledRuns: cancelled.length,
    successRate: percent(completed.length, completed.length + failed.length),
    averageRunMs: average(durations),
  };
}

function workspaceMatches(
  workspaceId: string,
  events: OfficeActivityEvent[],
  taskState: CentralTaskState,
  routineState: CentralRoutineState,
): boolean {
  return taskState.workspaceId === workspaceId &&
    routineState.workspaceId === workspaceId &&
    events.every((event) => event.workspaceId === workspaceId) &&
    Object.values(taskState.tasks).every((task) => task.workspaceId === workspaceId) &&
    Object.values(routineState.routines).every((routine) => routine.workspaceId === workspaceId) &&
    Object.values(routineState.runs).every((run) => run.workspaceId === workspaceId);
}

export function selectWorkspaceAnalytics(
  input: AnalyticsInput,
  events: OfficeActivityEvent[],
  taskState: CentralTaskState,
  routineState: CentralRoutineState,
): WorkspaceAnalyticsResult {
  if (!workspaceMatches(input.workspaceId, events, taskState, routineState)) {
    return { success: false, error: 'workspace_mismatch' };
  }

  const now = input.now ?? Date.now();
  const timeZone = input.timeZone ?? 'UTC';
  const bounds = resolveAnalyticsPeriod(input.period, now, timeZone);
  const tasks = Object.values(taskState.tasks);
  const routines = Object.values(routineState.routines);

  return {
    success: true,
    analytics: {
      workspaceId: input.workspaceId,
      generatedAt: new Date(now).toISOString(),
      activity: selectPeriodAnalytics(events, input.period, now, timeZone),
      tasks: taskAnalytics(taskState, bounds.startAt, bounds.endAt, now),
      routines: routineAnalytics(routineState, bounds.startAt, bounds.endAt),
      agents: AGENT_ORDER.map((agentId) => {
        const assigned = tasks.filter((task) => task.assignedAgentId === agentId);
        return {
          agentId,
          assignedTasks: assigned.length,
          openTasks: assigned.filter((task) => !['completed', 'cancelled'].includes(task.status)).length,
          completedTasks: assigned.filter((task) => task.status === 'completed').length,
          overdueTasks: assigned.filter((task) => isTaskOverdue(task, now)).length,
          activeRoutines: routines.filter((routine) => routine.assignedAgentId === agentId && routine.status === 'active').length,
        };
      }),
    },
  };
}

export function selectWorkspaceAnalyticsForActor(
  actor: AnalyticsActor,
  input: AnalyticsInput,
  events: OfficeActivityEvent[],
  taskState: CentralTaskState,
  routineState: CentralRoutineState,
): WorkspaceAnalyticsResult {
  const canReadWorkspace = actor.role === 'super_admin' || actor.workspaceId === input.workspaceId;
  if (!canReadWorkspace) return { success: false, error: 'unauthorized' };
  return selectWorkspaceAnalytics(input, events, taskState, routineState);
}
