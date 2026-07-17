import type { AgentId } from '../../schemas';
import type {
  AgentActivitySnapshot,
  AgentRuntimeStatus,
  OfficeActivityEvent,
  OfficeActivityState,
} from './types';

const MAX_EVENT_HISTORY = 200;
const MAX_TRACKED_ACTIVITIES = 500;
const COMPLETION_SETTLE_MS = 5_000;

const ACTIVE_STATUSES = new Set<AgentRuntimeStatus>([
  'queued',
  'working',
  'failed',
  'blocked',
  'approval_required',
]);

const STATUS_PRIORITY: Record<AgentRuntimeStatus, number> = {
  available: 0,
  completed: 1,
  queued: 2,
  working: 3,
  failed: 4,
  blocked: 5,
  approval_required: 6,
};

export function createOfficeActivityState(): OfficeActivityState {
  return {
    activities: {},
    recentEvents: [],
    processedEventIds: [],
    processedDedupeKeys: [],
  };
}

function eventTime(event: OfficeActivityEvent): number {
  const parsed = Date.parse(event.occurredAt);
  return Number.isFinite(parsed) ? parsed : 0;
}

function compareEvents(a: OfficeActivityEvent, b: OfficeActivityEvent): number {
  const timeDifference = eventTime(b) - eventTime(a);
  if (timeDifference !== 0) return timeDifference;
  return STATUS_PRIORITY[b.status] - STATUS_PRIORITY[a.status];
}

function limitActivities(
  activities: Record<string, OfficeActivityEvent>,
): Record<string, OfficeActivityEvent> {
  const entries = Object.entries(activities);
  if (entries.length <= MAX_TRACKED_ACTIVITIES) return activities;

  return Object.fromEntries(
    entries
      .sort(([, a], [, b]) => compareEvents(a, b))
      .slice(0, MAX_TRACKED_ACTIVITIES),
  );
}

/**
 * Idempotent reducer for webhook/realtime delivery. Older lifecycle updates for
 * the same activity cannot overwrite a newer state.
 */
export function applyOfficeActivityEvent(
  state: OfficeActivityState,
  event: OfficeActivityEvent,
): OfficeActivityState {
  if (state.processedEventIds.includes(event.id)) return state;
  if (event.dedupeKey && state.processedDedupeKeys.includes(event.dedupeKey)) return state;

  const current = state.activities[event.activityId];
  if (current && eventTime(event) < eventTime(current)) return state;

  const recentEvents = [event, ...state.recentEvents]
    .sort(compareEvents)
    .slice(0, MAX_EVENT_HISTORY);

  return {
    activities: limitActivities({ ...state.activities, [event.activityId]: event }),
    recentEvents,
    processedEventIds: [event.id, ...state.processedEventIds].slice(0, MAX_EVENT_HISTORY),
    processedDedupeKeys: event.dedupeKey
      ? [event.dedupeKey, ...state.processedDedupeKeys].slice(0, MAX_EVENT_HISTORY)
      : state.processedDedupeKeys,
  };
}

export function reduceOfficeActivityEvents(
  events: OfficeActivityEvent[],
  initialState = createOfficeActivityState(),
): OfficeActivityState {
  return events.reduce(applyOfficeActivityEvent, initialState);
}

export function selectAgentActivity(
  state: OfficeActivityState,
  agentId: AgentId,
  now = Date.now(),
): AgentActivitySnapshot {
  const events = Object.values(state.activities)
    .filter((event) => event.agentId === agentId)
    .sort(compareEvents);
  const activeEvents = events.filter((event) => ACTIVE_STATUSES.has(event.status));

  if (activeEvents.length > 0) {
    const event = [...activeEvents].sort((a, b) => {
      const priorityDifference = STATUS_PRIORITY[b.status] - STATUS_PRIORITY[a.status];
      return priorityDifference || compareEvents(a, b);
    })[0];

    return { agentId, status: event.status, event, activeCount: activeEvents.length };
  }

  const latestCompleted = events.find((event) => event.status === 'completed') ?? null;
  if (latestCompleted && now - eventTime(latestCompleted) <= COMPLETION_SETTLE_MS) {
    return { agentId, status: 'completed', event: latestCompleted, activeCount: 0 };
  }

  return { agentId, status: 'available', event: latestCompleted, activeCount: 0 };
}

/** The 3D character must sit only while backend work is actually running. */
export function shouldAgentBeSeated(snapshot: AgentActivitySnapshot): boolean {
  return snapshot.status === 'working';
}

