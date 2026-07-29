import type {
  CentralRoutine,
  CentralRoutineState,
  RoutineCommand,
  RoutineHistoryAction,
  RoutineHistoryEntry,
  RoutineMutationResult,
  RoutineRun,
} from './types';

const MAX_HISTORY = 5_000;
const MAX_COMMANDS = 2_000;
const ADMIN_ROLES = new Set(['super_admin', 'workspace_admin']);

export function createCentralRoutineState(workspaceId: string): CentralRoutineState {
  return { workspaceId, routines: {}, runs: {}, history: [], processedCommandIds: [] };
}

function action(command: RoutineCommand): RoutineHistoryAction {
  return command.type.replace('routine.', '').replace('run_', 'run_') as RoutineHistoryAction;
}

function note(command: RoutineCommand): string | null {
  if (command.type === 'routine.run_failed') return command.error;
  if (command.type === 'routine.run_cancelled') return command.reason?.trim() || null;
  return null;
}

function success(state: CentralRoutineState, routine: CentralRoutine, run: RoutineRun | null, duplicate = false): RoutineMutationResult {
  return { success: true, state, routine, run, duplicate };
}

function append(
  state: CentralRoutineState,
  command: RoutineCommand,
  routine: CentralRoutine,
  run: RoutineRun | null,
): CentralRoutineState {
  const entry: RoutineHistoryEntry = {
    commandId: command.commandId,
    workspaceId: state.workspaceId,
    routineId: routine.id,
    runId: run?.id ?? ('runId' in command ? command.runId : null),
    action: action(command),
    actor: command.actor,
    occurredAt: command.occurredAt,
    note: note(command),
    revision: run?.revision ?? routine.revision,
  };
  return {
    ...state,
    routines: { ...state.routines, [routine.id]: routine },
    runs: run ? { ...state.runs, [run.id]: run } : state.runs,
    history: [...state.history, entry].slice(-MAX_HISTORY),
    processedCommandIds: [command.commandId, ...state.processedCommandIds].slice(0, MAX_COMMANDS),
  };
}

export function applyRoutineCommand(state: CentralRoutineState, command: RoutineCommand): RoutineMutationResult {
  if (command.workspaceId !== state.workspaceId) return { success: false, code: 'workspace_mismatch' };
  if (state.processedCommandIds.includes(command.commandId)) {
    const routine = state.routines[command.routineId];
    if (!routine) return { success: false, code: 'routine_not_found' };
    const run = 'runId' in command ? state.runs[command.runId] ?? null : null;
    return success(state, routine, run, true);
  }

  if (command.type === 'routine.created') {
    if (!ADMIN_ROLES.has(command.actor.role)) return { success: false, code: 'unauthorized' };
    if (state.routines[command.routineId]) return { success: false, code: 'routine_exists' };
    const routine: CentralRoutine = {
      id: command.routineId, workspaceId: state.workspaceId, name: command.name.trim(),
      description: command.description?.trim() ?? '', status: 'draft', assignedAgentId: command.assignedAgentId,
      schedule: { ...command.schedule, daysOfWeek: [...command.schedule.daysOfWeek] },
      taskTemplate: { ...command.taskTemplate }, revision: 1, createdAt: command.occurredAt,
      createdBy: command.actor.actorId, updatedAt: command.occurredAt, nextRunAt: null, lastRunAt: null,
    };
    const next = append(state, command, routine, null);
    return success(next, routine, null);
  }

  const routine = state.routines[command.routineId];
  if (!routine) return { success: false, code: 'routine_not_found' };

  if ('expectedRunRevision' in command) {
    const run = state.runs[command.runId];
    if (!run) return { success: false, code: 'run_not_found' };
    if (run.revision !== command.expectedRunRevision) return { success: false, code: 'stale_revision' };
    let nextRun: RoutineRun | null = null;
    if (command.type === 'routine.run_started' && run.status === 'queued') {
      nextRun = { ...run, status: 'working', startedAt: command.occurredAt, revision: run.revision + 1 };
    } else if (command.type === 'routine.run_completed' && run.status === 'working') {
      nextRun = { ...run, status: 'completed', finishedAt: command.occurredAt, taskId: command.taskId, revision: run.revision + 1 };
    } else if (command.type === 'routine.run_failed' && ['queued', 'working'].includes(run.status)) {
      nextRun = { ...run, status: 'failed', finishedAt: command.occurredAt, error: command.error.trim(), revision: run.revision + 1 };
    } else if (command.type === 'routine.run_cancelled' && ['queued', 'working'].includes(run.status)) {
      nextRun = { ...run, status: 'cancelled', finishedAt: command.occurredAt, revision: run.revision + 1 };
    }
    if (!nextRun) return { success: false, code: 'invalid_transition' };
    const nextRoutine = { ...routine, lastRunAt: nextRun.finishedAt ?? routine.lastRunAt };
    const next = append(state, command, nextRoutine, nextRun);
    return success(next, nextRoutine, nextRun);
  }

  if (command.expectedRevision !== routine.revision) return { success: false, code: 'stale_revision' };
  if (!ADMIN_ROLES.has(command.actor.role) && command.type !== 'routine.run_queued') {
    return { success: false, code: 'unauthorized' };
  }

  let nextRoutine: CentralRoutine | null = null;
  let nextRun: RoutineRun | null = null;
  if (command.type === 'routine.updated' && routine.status !== 'archived') {
    const patch = command.patch;
    nextRoutine = {
      ...routine,
      name: patch.name?.trim() ?? routine.name,
      description: patch.description?.trim() ?? routine.description,
      assignedAgentId: patch.assignedAgentId === undefined ? routine.assignedAgentId : patch.assignedAgentId,
      schedule: patch.schedule ? { ...patch.schedule, daysOfWeek: [...patch.schedule.daysOfWeek] } : routine.schedule,
      taskTemplate: patch.taskTemplate ? { ...patch.taskTemplate } : routine.taskTemplate,
      revision: routine.revision + 1,
      updatedAt: command.occurredAt,
      nextRunAt: command.nextRunAt === undefined ? routine.nextRunAt : command.nextRunAt,
    };
  } else if (command.type === 'routine.activated' && ['draft', 'paused'].includes(routine.status)) {
    nextRoutine = { ...routine, status: 'active', nextRunAt: command.nextRunAt, revision: routine.revision + 1, updatedAt: command.occurredAt };
  } else if (command.type === 'routine.paused' && routine.status === 'active') {
    nextRoutine = { ...routine, status: 'paused', nextRunAt: null, revision: routine.revision + 1, updatedAt: command.occurredAt };
  } else if (command.type === 'routine.archived' && routine.status !== 'archived') {
    nextRoutine = { ...routine, status: 'archived', nextRunAt: null, revision: routine.revision + 1, updatedAt: command.occurredAt };
  } else if (command.type === 'routine.run_queued' && routine.status === 'active') {
    if (state.runs[command.runId]) return { success: false, code: 'run_exists' };
    nextRoutine = {
      ...routine, nextRunAt: command.nextRunAt, revision: routine.revision + 1, updatedAt: command.occurredAt,
    };
    nextRun = {
      id: command.runId, routineId: routine.id, workspaceId: state.workspaceId, status: 'queued',
      scheduledFor: command.scheduledFor, queuedAt: command.occurredAt, startedAt: null, finishedAt: null,
      taskId: null, error: null, revision: 1,
    };
  }
  if (!nextRoutine) return { success: false, code: 'invalid_transition' };
  const next = append(state, command, nextRoutine, nextRun);
  return success(next, nextRoutine, nextRun);
}
