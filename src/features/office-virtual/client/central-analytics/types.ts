import type { AgentId } from '../../schemas';
import type { AnalyticsPeriod, PeriodAnalytics } from '../central-events';
import type { RoutineStats } from '../central-routines';
import type { TaskSource, TaskStats } from '../central-tasks';

export type AnalyticsInput = {
  workspaceId: string;
  period: AnalyticsPeriod;
  now?: number;
  timeZone?: string;
};

export type AnalyticsActor = {
  actorId: string;
  role: 'super_admin' | 'workspace_admin' | 'workspace_member';
  workspaceId: string | null;
};

export type TaskAnalytics = {
  snapshot: TaskStats;
  createdInPeriod: number;
  completedInPeriod: number;
  failedInPeriod: number;
  completionRate: number;
  averageCompletionMs: number | null;
  averageApprovalWaitMs: number | null;
  bySource: Record<TaskSource, number>;
};

export type RoutineAnalytics = {
  snapshot: RoutineStats;
  runsInPeriod: number;
  completedRuns: number;
  failedRuns: number;
  cancelledRuns: number;
  successRate: number;
  averageRunMs: number | null;
};

export type AgentWorkloadAnalytics = {
  agentId: AgentId;
  assignedTasks: number;
  openTasks: number;
  completedTasks: number;
  overdueTasks: number;
  activeRoutines: number;
};

export type WorkspaceAnalytics = {
  workspaceId: string;
  generatedAt: string;
  activity: PeriodAnalytics;
  tasks: TaskAnalytics;
  routines: RoutineAnalytics;
  agents: AgentWorkloadAnalytics[];
};

export type WorkspaceAnalyticsResult =
  | { success: true; analytics: WorkspaceAnalytics }
  | { success: false; error: 'workspace_mismatch' | 'unauthorized' };
