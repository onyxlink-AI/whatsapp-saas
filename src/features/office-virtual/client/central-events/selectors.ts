import type { AgentId } from '../../schemas';
import { selectAgentActivity } from './state';
import type {
  AgentActivitySnapshot,
  OfficeActivityEvent,
  OfficeActivitySource,
  OfficeActivityState,
  OfficeActivityStatus,
} from './types';

const ATTENTION_STATUSES = new Set<OfficeActivityStatus>([
  'failed',
  'blocked',
  'approval_required',
]);

const ACTIVE_STATUSES = new Set<OfficeActivityStatus>([
  'queued',
  'working',
  'failed',
  'blocked',
  'approval_required',
]);

const SOURCES: OfficeActivitySource[] = ['whatsapp', 'voice', 'manual', 'automation'];

export type OfficeOverview = {
  totalTrackedActivities: number;
  activeActivities: number;
  workingAgents: number;
  queuedActivities: number;
  completedActivities: number;
  attentionActivities: number;
};

export type SourceActivityMetrics = {
  source: OfficeActivitySource;
  total: number;
  active: number;
  completed: number;
  attention: number;
};

export type AgentActivityMetrics = {
  agentId: AgentId;
  snapshot: AgentActivitySnapshot;
  total: number;
  active: number;
  completed: number;
  attention: number;
};

export type TimelineFilter = {
  agentIds?: AgentId[];
  sources?: OfficeActivitySource[];
  statuses?: OfficeActivityStatus[];
  limit?: number;
};

function timestamp(event: OfficeActivityEvent): number {
  const value = Date.parse(event.occurredAt);
  return Number.isFinite(value) ? value : 0;
}

function latestActivities(state: OfficeActivityState): OfficeActivityEvent[] {
  return Object.values(state.activities);
}

export function isAttentionActivity(event: OfficeActivityEvent): boolean {
  return ATTENTION_STATUSES.has(event.status);
}

/** Current operational totals. Each activityId is counted only once. */
export function selectOfficeOverview(
  state: OfficeActivityState,
  agentIds: AgentId[],
  now = Date.now(),
): OfficeOverview {
  const activities = latestActivities(state);
  const snapshots = agentIds.map((agentId) => selectAgentActivity(state, agentId, now));

  return {
    totalTrackedActivities: activities.length,
    activeActivities: activities.filter((event) => ACTIVE_STATUSES.has(event.status)).length,
    workingAgents: snapshots.filter((snapshot) => snapshot.status === 'working').length,
    queuedActivities: activities.filter((event) => event.status === 'queued').length,
    completedActivities: activities.filter((event) => event.status === 'completed').length,
    attentionActivities: activities.filter(isAttentionActivity).length,
  };
}

export function selectSourceActivityMetrics(state: OfficeActivityState): SourceActivityMetrics[] {
  const activities = latestActivities(state);

  return SOURCES.map((source) => {
    const sourceActivities = activities.filter((event) => event.source === source);
    return {
      source,
      total: sourceActivities.length,
      active: sourceActivities.filter((event) => ACTIVE_STATUSES.has(event.status)).length,
      completed: sourceActivities.filter((event) => event.status === 'completed').length,
      attention: sourceActivities.filter(isAttentionActivity).length,
    };
  });
}

export function selectAgentActivityMetrics(
  state: OfficeActivityState,
  agentIds: AgentId[],
  now = Date.now(),
): AgentActivityMetrics[] {
  const activities = latestActivities(state);

  return agentIds.map((agentId) => {
    const agentActivities = activities.filter((event) => event.agentId === agentId);
    return {
      agentId,
      snapshot: selectAgentActivity(state, agentId, now),
      total: agentActivities.length,
      active: agentActivities.filter((event) => ACTIVE_STATUSES.has(event.status)).length,
      completed: agentActivities.filter((event) => event.status === 'completed').length,
      attention: agentActivities.filter(isAttentionActivity).length,
    };
  });
}

export function selectAttentionActivities(
  state: OfficeActivityState,
  limit = 20,
): OfficeActivityEvent[] {
  return latestActivities(state)
    .filter(isAttentionActivity)
    .sort((a, b) => timestamp(b) - timestamp(a))
    .slice(0, Math.max(0, limit));
}

/** Historical transitions for timelines and analytics; lifecycle events remain separate. */
export function selectTimelineEvents(
  events: OfficeActivityEvent[],
  filter: TimelineFilter = {},
): OfficeActivityEvent[] {
  const agentIds = filter.agentIds ? new Set(filter.agentIds) : null;
  const sources = filter.sources ? new Set(filter.sources) : null;
  const statuses = filter.statuses ? new Set(filter.statuses) : null;
  const limit = Math.max(0, filter.limit ?? events.length);

  return events
    .filter((event) => !agentIds || agentIds.has(event.agentId))
    .filter((event) => !sources || sources.has(event.source))
    .filter((event) => !statuses || statuses.has(event.status))
    .sort((a, b) => timestamp(b) - timestamp(a))
    .slice(0, limit);
}

