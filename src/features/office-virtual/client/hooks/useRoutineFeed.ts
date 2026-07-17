import { useMemo, useState } from 'react';
import type { AgentId } from '../../schemas';
import {
  applyRoutineCommand,
  createCentralRoutineState,
  createRoutineFixtures,
  selectRoutines,
} from '../central-routines';
import type {
  CentralRoutine,
  CentralRoutineState,
  RoutineActor,
  RoutineCommand,
  RoutineHistoryAction,
  RoutineSchedule,
} from '../central-routines';

export type RoutineFrequency = 'once' | 'daily' | 'weekly' | 'monthly';
export type RoutineStatus = 'active' | 'paused';
export type { RoutineHistoryAction } from '../central-routines';

export type RoutineHistoryEntry = {
  id: string;
  action: RoutineHistoryAction;
  occurredAt: string;
  note: string | null;
};

export type Routine = {
  id: string;
  workspaceId: string;
  name: string;
  description: string;
  frequency: RoutineFrequency;
  time: string;
  weekday: number | null;
  dayOfMonth: number | null;
  scheduledAt: string | null;
  targetAgentId: AgentId | null;
  taskTitle: string;
  status: RoutineStatus;
  createdAt: string;
  updatedAt: string;
  lastRunAt: string | null;
  history: RoutineHistoryEntry[];
};

export type RoutineDraft = {
  name: string;
  description: string;
  frequency: RoutineFrequency;
  time: string;
  weekday: number | null;
  dayOfMonth: number | null;
  scheduledAt: string | null;
  targetAgentId: AgentId | null;
  taskTitle: string;
};

export type RoutineFilters = {
  query: string;
  agentId: AgentId | 'all';
  frequency: RoutineFrequency | 'all';
  status: RoutineStatus | 'all';
};

const DEFAULT_FILTERS: RoutineFilters = { query: '', agentId: 'all', frequency: 'all', status: 'all' };
const TIMEZONE = 'Europe/Madrid';

export const EMPTY_ROUTINE_DRAFT: RoutineDraft = {
  name: '', description: '', frequency: 'daily', time: '09:00', weekday: 1,
  dayOfMonth: 1, scheduledAt: null, targetAgentId: null, taskTitle: '',
};

function withTime(date: Date, time: string): Date {
  const [hours, minutes] = time.split(':').map(Number);
  const result = new Date(date);
  result.setHours(hours, minutes, 0, 0);
  return result;
}

function nextMonthlyRun(from: Date, schedule: RoutineSchedule): Date | null {
  const day = schedule.dayOfMonth ?? 1;
  for (let offset = 0; offset < 14; offset += 1) {
    const candidate = withTime(new Date(from.getFullYear(), from.getMonth() + offset, day), schedule.time);
    if (candidate.getDate() === day && candidate > from) return candidate;
  }
  return null;
}

function nextForSchedule(schedule: RoutineSchedule, from: Date): Date | null {
  if (schedule.kind === 'once') {
    if (!schedule.scheduledAt) return null;
    const scheduled = new Date(schedule.scheduledAt);
    return scheduled > from ? scheduled : null;
  }
  if (schedule.kind === 'daily') {
    const today = withTime(from, schedule.time);
    return today > from ? today : withTime(new Date(from.getTime() + 24 * 60 * 60_000), schedule.time);
  }
  if (schedule.kind === 'monthly') return nextMonthlyRun(from, schedule);

  const targetWeekday = schedule.daysOfWeek[0] ?? 1;
  for (let offset = 0; offset < 8; offset += 1) {
    const candidate = withTime(new Date(from.getTime() + offset * 24 * 60 * 60_000), schedule.time);
    if (candidate.getDay() === targetWeekday && candidate > from) return candidate;
  }
  return null;
}

function scheduleFromDraft(draft: RoutineDraft): RoutineSchedule {
  return {
    kind: draft.frequency,
    timezone: TIMEZONE,
    time: draft.frequency === 'once' && draft.scheduledAt
      ? new Date(draft.scheduledAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
      : draft.time,
    daysOfWeek: draft.frequency === 'weekly' ? [draft.weekday ?? 1] : [],
    dayOfMonth: draft.frequency === 'monthly' ? draft.dayOfMonth ?? 1 : null,
    scheduledAt: draft.frequency === 'once' ? draft.scheduledAt : null,
  };
}

function applyOrKeep(state: CentralRoutineState, command: RoutineCommand): CentralRoutineState {
  const result = applyRoutineCommand(state, command);
  return result.success ? result.state : state;
}

/** Exported for isolation tests — verifies fixtures come back scoped to the given workspace/actor, not a shared demo constant. */
export function seedRoutineState(workspaceId: string, actor: RoutineActor): CentralRoutineState {
  let state = createRoutineFixtures(workspaceId).reduce(applyOrKeep, createCentralRoutineState(workspaceId));
  const now = new Date();
  const inThreeDays = new Date(now.getTime() + 3 * 24 * 60 * 60_000);
  inThreeDays.setHours(15, 30, 0, 0);
  const commands: RoutineCommand[] = [
    {
      type: 'routine.activated', commandId: 'routine-seed-activate-weekly', routineId: 'routine-weekly-quality',
      workspaceId: workspaceId, expectedRevision: 1, actor: actor, occurredAt: now.toISOString(),
      nextRunAt: nextForSchedule(state.routines['routine-weekly-quality'].schedule, now)!.toISOString(),
    },
    {
      type: 'routine.created', commandId: 'routine-seed-create-once', routineId: 'routine-cold-lead',
      workspaceId: workspaceId, actor: actor, occurredAt: now.toISOString(), name: 'Recuperar lead frío',
      description: 'Retomar contacto tras la ventana de inactividad.', assignedAgentId: 'operations',
      schedule: { kind: 'once', timezone: TIMEZONE, time: '15:30', daysOfWeek: [], dayOfMonth: null, scheduledAt: inThreeDays.toISOString() },
      taskTemplate: { title: 'Reactivar lead frío', description: '', priority: 'normal', source: 'routine', requiresApproval: false },
    },
    {
      type: 'routine.activated', commandId: 'routine-seed-activate-once', routineId: 'routine-cold-lead',
      workspaceId: workspaceId, expectedRevision: 1, actor: actor, occurredAt: now.toISOString(), nextRunAt: inThreeDays.toISOString(),
    },
    {
      type: 'routine.created', commandId: 'routine-seed-create-backup', routineId: 'routine-backup',
      workspaceId: workspaceId, actor: actor, occurredAt: now.toISOString(), name: 'Backup de plantillas',
      description: 'Copia de seguridad nocturna de las plantillas.', assignedAgentId: 'content',
      schedule: { kind: 'daily', timezone: TIMEZONE, time: '23:00', daysOfWeek: [], dayOfMonth: null, scheduledAt: null },
      taskTemplate: { title: 'Generar copia de seguridad de plantillas', description: '', priority: 'low', source: 'routine', requiresApproval: false },
    },
    {
      type: 'routine.activated', commandId: 'routine-seed-activate-backup', routineId: 'routine-backup',
      workspaceId: workspaceId, expectedRevision: 1, actor: actor, occurredAt: now.toISOString(),
      nextRunAt: nextForSchedule({ kind: 'daily', timezone: TIMEZONE, time: '23:00', daysOfWeek: [], dayOfMonth: null, scheduledAt: null }, now)!.toISOString(),
    },
    {
      type: 'routine.paused', commandId: 'routine-seed-pause-backup', routineId: 'routine-backup',
      workspaceId: workspaceId, expectedRevision: 2, actor: actor, occurredAt: now.toISOString(),
    },
  ];
  for (const command of commands) state = applyOrKeep(state, command);
  return state;
}

function projectRoutine(state: CentralRoutineState, routine: CentralRoutine): Routine {
  return {
    id: routine.id, workspaceId: routine.workspaceId, name: routine.name, description: routine.description,
    frequency: routine.schedule.kind, time: routine.schedule.time,
    weekday: routine.schedule.kind === 'weekly' ? routine.schedule.daysOfWeek[0] ?? 1 : null,
    dayOfMonth: routine.schedule.dayOfMonth, scheduledAt: routine.schedule.scheduledAt,
    targetAgentId: routine.assignedAgentId, taskTitle: routine.taskTemplate.title,
    status: routine.status as RoutineStatus, createdAt: routine.createdAt, updatedAt: routine.updatedAt,
    lastRunAt: routine.lastRunAt,
    history: state.history.filter((entry) => entry.routineId === routine.id).map((entry) => ({
      id: entry.commandId, action: entry.action, occurredAt: entry.occurredAt, note: entry.note,
    })),
  };
}

export function selectNextRun(routine: Routine, from: Date = new Date()): Date | null {
  if (routine.status === 'paused') return null;
  return nextForSchedule({
    kind: routine.frequency, timezone: TIMEZONE, time: routine.time,
    daysOfWeek: routine.frequency === 'weekly' ? [routine.weekday ?? 1] : [],
    dayOfMonth: routine.frequency === 'monthly' ? routine.dayOfMonth ?? 1 : null,
    scheduledAt: routine.frequency === 'once' ? routine.scheduledAt : null,
  }, from);
}

export function routineOccursOnDate(routine: Routine, date: Date): boolean {
  if (routine.status === 'paused') return false;
  if (routine.frequency === 'once') {
    if (!routine.scheduledAt) return false;
    const scheduled = new Date(routine.scheduledAt);
    return scheduled.getFullYear() === date.getFullYear() && scheduled.getMonth() === date.getMonth() && scheduled.getDate() === date.getDate();
  }
  if (routine.frequency === 'daily') return true;
  if (routine.frequency === 'monthly') return date.getDate() === (routine.dayOfMonth ?? 1);
  return date.getDay() === (routine.weekday ?? 1);
}

export type RoutineFeed = {
  state: CentralRoutineState;
  loading: boolean;
  routines: Routine[];
  filteredRoutines: Routine[];
  filters: RoutineFilters;
  setFilters: (patch: Partial<RoutineFilters>) => void;
  resetFilters: () => void;
  createRoutine: (draft: RoutineDraft) => string | null;
  updateRoutine: (id: string, patch: Partial<RoutineDraft>) => void;
  toggleRoutineStatus: (id: string) => void;
  runRoutineNow: (id: string) => void;
  deleteRoutine: (id: string) => void;
};

export function useRoutineFeed(workspaceId: string, actor: RoutineActor): RoutineFeed {
  const [state, setState] = useState<CentralRoutineState>(() => seedRoutineState(workspaceId, actor));
  const [filters, setFiltersState] = useState<RoutineFilters>(DEFAULT_FILTERS);
  const setFilters = (patch: Partial<RoutineFilters>) => setFiltersState((previous) => ({ ...previous, ...patch }));
  const resetFilters = () => setFiltersState(DEFAULT_FILTERS);

  const createRoutine = (draft: RoutineDraft): string | null => {
    if (!draft.name.trim() || !draft.taskTitle.trim() || !draft.targetAgentId) return null;
    const routineId = crypto.randomUUID();
    const schedule = scheduleFromDraft(draft);
    const now = new Date();
    const next = nextForSchedule(schedule, now);
    if (!next) return null;
    setState((previous) => {
      let nextState = applyOrKeep(previous, {
        type: 'routine.created', commandId: crypto.randomUUID(), routineId, workspaceId: previous.workspaceId,
        actor: actor, occurredAt: now.toISOString(), name: draft.name, description: draft.description,
        assignedAgentId: draft.targetAgentId, schedule,
        taskTemplate: { title: draft.taskTitle, description: draft.description, priority: 'normal', source: 'routine', requiresApproval: false },
      });
      nextState = applyOrKeep(nextState, {
        type: 'routine.activated', commandId: crypto.randomUUID(), routineId, workspaceId: previous.workspaceId,
        expectedRevision: 1, actor: actor, occurredAt: now.toISOString(), nextRunAt: next.toISOString(),
      });
      return nextState;
    });
    return routineId;
  };

  const updateRoutine = (routineId: string, patch: Partial<RoutineDraft>) => setState((previous) => {
    const routine = previous.routines[routineId];
    if (!routine) return previous;
    const currentDraft: RoutineDraft = {
      name: routine.name, description: routine.description, frequency: routine.schedule.kind,
      time: routine.schedule.time, weekday: routine.schedule.daysOfWeek[0] ?? null,
      dayOfMonth: routine.schedule.dayOfMonth, scheduledAt: routine.schedule.scheduledAt,
      targetAgentId: routine.assignedAgentId, taskTitle: routine.taskTemplate.title,
    };
    const draft = { ...currentDraft, ...patch };
    const schedule = scheduleFromDraft(draft);
    const next = routine.status === 'active' ? nextForSchedule(schedule, new Date())?.toISOString() ?? null : null;
    return applyOrKeep(previous, {
      type: 'routine.updated', commandId: crypto.randomUUID(), routineId, workspaceId: previous.workspaceId,
      expectedRevision: routine.revision, actor: actor, occurredAt: new Date().toISOString(), nextRunAt: next,
      patch: {
        name: draft.name, description: draft.description, assignedAgentId: draft.targetAgentId,
        schedule, taskTemplate: { ...routine.taskTemplate, title: draft.taskTitle, description: draft.description },
      },
    });
  });

  const toggleRoutineStatus = (routineId: string) => setState((previous) => {
    const routine = previous.routines[routineId];
    if (!routine) return previous;
    if (routine.status === 'active') return applyOrKeep(previous, {
      type: 'routine.paused', commandId: crypto.randomUUID(), routineId, workspaceId: previous.workspaceId,
      expectedRevision: routine.revision, actor: actor, occurredAt: new Date().toISOString(),
    });
    const next = nextForSchedule(routine.schedule, new Date());
    if (!next) return previous;
    return applyOrKeep(previous, {
      type: 'routine.activated', commandId: crypto.randomUUID(), routineId, workspaceId: previous.workspaceId,
      expectedRevision: routine.revision, actor: actor, occurredAt: new Date().toISOString(), nextRunAt: next.toISOString(),
    });
  });

  const runRoutineNow = (routineId: string) => setState((previous) => {
    const routine = previous.routines[routineId];
    if (!routine || routine.status !== 'active') return previous;
    const now = new Date();
    const runId = crypto.randomUUID();
    const nextRunAt = routine.schedule.kind === 'once' ? null : nextForSchedule(routine.schedule, now)?.toISOString() ?? null;
    let next = applyOrKeep(previous, {
      type: 'routine.run_queued', commandId: crypto.randomUUID(), routineId, runId, workspaceId: previous.workspaceId,
      expectedRevision: routine.revision, actor: actor, occurredAt: now.toISOString(), scheduledFor: now.toISOString(), nextRunAt,
    });
    next = applyOrKeep(next, {
      type: 'routine.run_started', commandId: crypto.randomUUID(), routineId, runId, workspaceId: previous.workspaceId,
      expectedRunRevision: 1, actor: { actorId: 'demo-worker', role: 'system' }, occurredAt: new Date(now.getTime() + 1).toISOString(),
    });
    next = applyOrKeep(next, {
      type: 'routine.run_completed', commandId: crypto.randomUUID(), routineId, runId, workspaceId: previous.workspaceId,
      expectedRunRevision: 2, actor: { actorId: 'demo-worker', role: 'system' }, occurredAt: new Date(now.getTime() + 2).toISOString(), taskId: null,
    });
    if (routine.schedule.kind === 'once') {
      const updated = next.routines[routineId];
      next = applyOrKeep(next, {
        type: 'routine.paused', commandId: crypto.randomUUID(), routineId, workspaceId: previous.workspaceId,
        expectedRevision: updated.revision, actor: actor, occurredAt: new Date(now.getTime() + 3).toISOString(),
      });
    }
    return next;
  });

  const deleteRoutine = (routineId: string) => setState((previous) => {
    const routine = previous.routines[routineId];
    if (!routine) return previous;
    return applyOrKeep(previous, {
      type: 'routine.archived', commandId: crypto.randomUUID(), routineId, workspaceId: previous.workspaceId,
      expectedRevision: routine.revision, actor: actor, occurredAt: new Date().toISOString(),
    });
  });

  const routines = useMemo(() => selectRoutines(state)
    .filter((routine): routine is CentralRoutine & { status: RoutineStatus } => routine.status === 'active' || routine.status === 'paused')
    .map((routine) => projectRoutine(state, routine)), [state]);
  const filteredRoutines = useMemo(() => {
    const query = filters.query.trim().toLocaleLowerCase('es');
    return routines
      .filter((routine) => filters.agentId === 'all' || routine.targetAgentId === filters.agentId)
      .filter((routine) => filters.frequency === 'all' || routine.frequency === filters.frequency)
      .filter((routine) => filters.status === 'all' || routine.status === filters.status)
      .filter((routine) => !query || `${routine.name} ${routine.description}`.toLocaleLowerCase('es').includes(query))
      .sort((a, b) => (selectNextRun(a)?.getTime() ?? Infinity) - (selectNextRun(b)?.getTime() ?? Infinity));
  }, [routines, filters]);

  return { state, loading: false, routines, filteredRoutines, filters, setFilters, resetFilters, createRoutine, updateRoutine, toggleRoutineStatus, runRoutineNow, deleteRoutine };
}
