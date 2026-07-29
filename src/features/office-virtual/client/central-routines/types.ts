import type { AgentId } from '../../schemas';
import type { TaskPriority, TaskSource } from '../central-tasks';

export type RoutineStatus = 'draft' | 'active' | 'paused' | 'archived';
export type RoutineRunStatus = 'queued' | 'working' | 'completed' | 'failed' | 'cancelled';
export type RoutineScheduleKind = 'once' | 'daily' | 'weekly' | 'monthly';

export type RoutineSchedule = {
  kind: RoutineScheduleKind;
  timezone: string;
  time: string;
  daysOfWeek: number[];
  dayOfMonth: number | null;
  scheduledAt: string | null;
};

export type RoutineTaskTemplate = {
  title: string;
  description: string;
  priority: TaskPriority;
  source: Extract<TaskSource, 'automation' | 'routine'>;
  requiresApproval: boolean;
};

export type CentralRoutine = {
  id: string;
  workspaceId: string;
  name: string;
  description: string;
  status: RoutineStatus;
  assignedAgentId: AgentId | null;
  schedule: RoutineSchedule;
  taskTemplate: RoutineTaskTemplate;
  revision: number;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  nextRunAt: string | null;
  lastRunAt: string | null;
};

export type RoutineRun = {
  id: string;
  routineId: string;
  workspaceId: string;
  status: RoutineRunStatus;
  scheduledFor: string;
  queuedAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  taskId: string | null;
  error: string | null;
  revision: number;
};

export type RoutineActor = {
  actorId: string;
  role: 'super_admin' | 'workspace_admin' | 'workspace_member' | 'agent' | 'system';
};

export type RoutineHistoryAction =
  | 'created'
  | 'updated'
  | 'activated'
  | 'paused'
  | 'archived'
  | 'run_queued'
  | 'run_started'
  | 'run_completed'
  | 'run_failed'
  | 'run_cancelled';

export type RoutineHistoryEntry = {
  commandId: string;
  workspaceId: string;
  routineId: string;
  runId: string | null;
  action: RoutineHistoryAction;
  actor: RoutineActor;
  occurredAt: string;
  note: string | null;
  revision: number;
};

export type CentralRoutineState = {
  workspaceId: string;
  routines: Record<string, CentralRoutine>;
  runs: Record<string, RoutineRun>;
  history: RoutineHistoryEntry[];
  processedCommandIds: string[];
};

type CommandBase = {
  commandId: string;
  workspaceId: string;
  actor: RoutineActor;
  occurredAt: string;
};

type RoutineCommandBase = CommandBase & {
  routineId: string;
  expectedRevision: number;
};

type RunCommandBase = CommandBase & {
  routineId: string;
  runId: string;
  expectedRunRevision: number;
};

export type RoutineCommand =
  | (CommandBase & {
      type: 'routine.created';
      routineId: string;
      name: string;
      description?: string;
      assignedAgentId: AgentId | null;
      schedule: RoutineSchedule;
      taskTemplate: RoutineTaskTemplate;
    })
  | (RoutineCommandBase & {
      type: 'routine.updated';
      patch: Partial<Pick<CentralRoutine, 'name' | 'description' | 'assignedAgentId' | 'schedule' | 'taskTemplate'>>;
      nextRunAt?: string | null;
    })
  | (RoutineCommandBase & { type: 'routine.activated'; nextRunAt: string })
  | (RoutineCommandBase & { type: 'routine.paused' })
  | (RoutineCommandBase & { type: 'routine.archived' })
  | (RoutineCommandBase & {
      type: 'routine.run_queued';
      runId: string;
      scheduledFor: string;
      nextRunAt: string | null;
    })
  | (RunCommandBase & { type: 'routine.run_started' })
  | (RunCommandBase & { type: 'routine.run_completed'; taskId: string | null })
  | (RunCommandBase & { type: 'routine.run_failed'; error: string })
  | (RunCommandBase & { type: 'routine.run_cancelled'; reason?: string });

export type RoutineMutationErrorCode =
  | 'workspace_mismatch'
  | 'routine_not_found'
  | 'routine_exists'
  | 'run_not_found'
  | 'run_exists'
  | 'stale_revision'
  | 'invalid_transition'
  | 'unauthorized';

export type RoutineMutationResult =
  | { success: true; state: CentralRoutineState; routine: CentralRoutine; run: RoutineRun | null; duplicate: boolean }
  | { success: false; code: RoutineMutationErrorCode };

export type RoutineFilters = {
  query?: string;
  status?: RoutineStatus;
  assignedAgentId?: AgentId;
  scheduleKind?: RoutineScheduleKind;
};

export type RoutineStats = {
  total: number;
  active: number;
  paused: number;
  draft: number;
  queuedRuns: number;
  workingRuns: number;
  completedRuns: number;
  failedRuns: number;
};
