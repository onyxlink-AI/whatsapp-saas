import type { CentralRoutineState, RoutineFilters, RoutineStats } from './types';

export function selectRoutines(state: CentralRoutineState, filters: RoutineFilters = {}) {
  const query = filters.query?.trim().toLocaleLowerCase('es') ?? '';
  return Object.values(state.routines)
    .filter((routine) => !filters.status || routine.status === filters.status)
    .filter((routine) => !filters.assignedAgentId || routine.assignedAgentId === filters.assignedAgentId)
    .filter((routine) => !filters.scheduleKind || routine.schedule.kind === filters.scheduleKind)
    .filter((routine) => !query || `${routine.name} ${routine.description}`.toLocaleLowerCase('es').includes(query))
    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
}

export function selectRoutineRuns(state: CentralRoutineState, routineId: string) {
  return Object.values(state.runs)
    .filter((run) => run.routineId === routineId)
    .sort((a, b) => Date.parse(b.queuedAt) - Date.parse(a.queuedAt));
}

export function selectDueRoutines(state: CentralRoutineState, now = Date.now()) {
  return Object.values(state.routines).filter((routine) =>
    routine.status === 'active' && routine.nextRunAt !== null && Date.parse(routine.nextRunAt) <= now,
  );
}

export function selectRoutineStats(state: CentralRoutineState): RoutineStats {
  const routines = Object.values(state.routines);
  const runs = Object.values(state.runs);
  return {
    total: routines.length,
    active: routines.filter((routine) => routine.status === 'active').length,
    paused: routines.filter((routine) => routine.status === 'paused').length,
    draft: routines.filter((routine) => routine.status === 'draft').length,
    queuedRuns: runs.filter((run) => run.status === 'queued').length,
    workingRuns: runs.filter((run) => run.status === 'working').length,
    completedRuns: runs.filter((run) => run.status === 'completed').length,
    failedRuns: runs.filter((run) => run.status === 'failed').length,
  };
}
