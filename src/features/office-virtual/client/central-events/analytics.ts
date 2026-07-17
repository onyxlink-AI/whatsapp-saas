import type { OfficeActivityEvent, OfficeActivitySource, OfficeActivityStatus } from './types';

export type AnalyticsPeriod = 'today' | '24h' | '7d' | '30d';

export type AnalyticsPeriodBounds = {
  period: AnalyticsPeriod;
  startAt: number;
  endAt: number;
  previousStartAt: number;
  previousEndAt: number;
  bucketMs: number;
};

export type PeriodMetrics = {
  events: number;
  activities: number;
  completed: number;
  failed: number;
  blocked: number;
  approvalsRequired: number;
  completionRate: number;
  averageCompletionMs: number | null;
  bySource: Record<OfficeActivitySource, number>;
};

export type MetricChange = number | null;

export type PeriodMetricChanges = {
  activities: MetricChange;
  completed: MetricChange;
  failed: MetricChange;
  approvalsRequired: MetricChange;
};

export type PeriodAnalytics = {
  bounds: AnalyticsPeriodBounds;
  current: PeriodMetrics;
  previous: PeriodMetrics;
  changes: PeriodMetricChanges;
};

export type TrendBucket = {
  startAt: string;
  endAt: string;
  events: number;
  activities: number;
  completed: number;
  failed: number;
  attention: number;
};

const HOUR_MS = 60 * 60 * 1_000;
const DAY_MS = 24 * HOUR_MS;
const SOURCES: OfficeActivitySource[] = ['whatsapp', 'voice', 'manual', 'automation'];
const ATTENTION_STATUSES = new Set<OfficeActivityStatus>([
  'failed',
  'blocked',
  'approval_required',
]);

function eventTime(event: OfficeActivityEvent): number {
  const value = Date.parse(event.occurredAt);
  return Number.isFinite(value) ? value : 0;
}

function zonedParts(timestamp: number, timeZone: string) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  const parts = Object.fromEntries(
    formatter
      .formatToParts(new Date(timestamp))
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, Number(part.value)]),
  );
  return {
    year: parts.year,
    month: parts.month,
    day: parts.day,
    hour: parts.hour,
    minute: parts.minute,
    second: parts.second,
  };
}

function startOfDayInTimeZone(now: number, timeZone: string): number {
  const local = zonedParts(now, timeZone);
  const desiredAsUtc = Date.UTC(local.year, local.month - 1, local.day, 0, 0, 0);
  let candidate = desiredAsUtc;

  // Iteration handles positive/negative offsets and daylight-saving boundaries.
  for (let index = 0; index < 3; index += 1) {
    const represented = zonedParts(candidate, timeZone);
    const representedAsUtc = Date.UTC(
      represented.year,
      represented.month - 1,
      represented.day,
      represented.hour,
      represented.minute,
      represented.second,
    );
    candidate -= representedAsUtc - desiredAsUtc;
  }

  return candidate;
}

export function resolveAnalyticsPeriod(
  period: AnalyticsPeriod,
  now = Date.now(),
  timeZone = 'UTC',
): AnalyticsPeriodBounds {
  const durationByPeriod: Record<Exclude<AnalyticsPeriod, 'today'>, number> = {
    '24h': DAY_MS,
    '7d': 7 * DAY_MS,
    '30d': 30 * DAY_MS,
  };
  const startAt = period === 'today' ? startOfDayInTimeZone(now, timeZone) : now - durationByPeriod[period];
  const duration = Math.max(1, now - startAt);

  return {
    period,
    startAt,
    endAt: now,
    previousStartAt: startAt - duration,
    previousEndAt: startAt,
    bucketMs: period === '7d' || period === '30d' ? DAY_MS : HOUR_MS,
  };
}

function eventsInRange(events: OfficeActivityEvent[], startAt: number, endAt: number) {
  return events.filter((event) => {
    const time = eventTime(event);
    return time >= startAt && time < endAt;
  });
}

function latestByActivity(events: OfficeActivityEvent[]): OfficeActivityEvent[] {
  const latest = new Map<string, OfficeActivityEvent>();
  for (const event of events) {
    const current = latest.get(event.activityId);
    if (!current || eventTime(event) >= eventTime(current)) latest.set(event.activityId, event);
  }
  return [...latest.values()];
}

function averageCompletionTime(events: OfficeActivityEvent[], startAt: number, endAt: number): number | null {
  const lifecycle = new Map<string, OfficeActivityEvent[]>();
  for (const event of events) {
    const list = lifecycle.get(event.activityId) ?? [];
    list.push(event);
    lifecycle.set(event.activityId, list);
  }

  const durations: number[] = [];
  for (const activityEvents of lifecycle.values()) {
    const ordered = activityEvents.sort((a, b) => eventTime(a) - eventTime(b));
    const started = ordered.find((event) => event.status === 'queued' || event.status === 'working');
    const completed = [...ordered].reverse().find((event) => event.status === 'completed');
    if (!started || !completed) continue;
    const completedAt = eventTime(completed);
    if (completedAt < startAt || completedAt >= endAt) continue;
    durations.push(Math.max(0, completedAt - eventTime(started)));
  }

  if (durations.length === 0) return null;
  return Math.round(durations.reduce((total, duration) => total + duration, 0) / durations.length);
}

function calculateMetrics(
  allEvents: OfficeActivityEvent[],
  startAt: number,
  endAt: number,
): PeriodMetrics {
  const periodEvents = eventsInRange(allEvents, startAt, endAt);
  const activities = latestByActivity(periodEvents);
  const completed = activities.filter((event) => event.status === 'completed').length;
  const failed = activities.filter((event) => event.status === 'failed').length;
  const blocked = activities.filter((event) => event.status === 'blocked').length;
  const terminal = completed + failed + blocked;
  const bySource = Object.fromEntries(SOURCES.map((source) => [source, 0])) as Record<OfficeActivitySource, number>;
  for (const activity of activities) bySource[activity.source] += 1;

  return {
    events: periodEvents.length,
    activities: activities.length,
    completed,
    failed,
    blocked,
    approvalsRequired: activities.filter((event) => event.status === 'approval_required').length,
    completionRate: terminal === 0 ? 0 : Math.round((completed / terminal) * 1_000) / 10,
    averageCompletionMs: averageCompletionTime(allEvents, startAt, endAt),
    bySource,
  };
}

function percentageChange(current: number, previous: number): MetricChange {
  if (previous === 0) return current === 0 ? 0 : null;
  return Math.round(((current - previous) / previous) * 1_000) / 10;
}

export function selectPeriodAnalytics(
  events: OfficeActivityEvent[],
  period: AnalyticsPeriod,
  now = Date.now(),
  timeZone = 'UTC',
): PeriodAnalytics {
  const bounds = resolveAnalyticsPeriod(period, now, timeZone);
  const current = calculateMetrics(events, bounds.startAt, bounds.endAt);
  const previous = calculateMetrics(events, bounds.previousStartAt, bounds.previousEndAt);

  return {
    bounds,
    current,
    previous,
    changes: {
      activities: percentageChange(current.activities, previous.activities),
      completed: percentageChange(current.completed, previous.completed),
      failed: percentageChange(current.failed, previous.failed),
      approvalsRequired: percentageChange(current.approvalsRequired, previous.approvalsRequired),
    },
  };
}

export function selectTrendBuckets(
  events: OfficeActivityEvent[],
  bounds: AnalyticsPeriodBounds,
): TrendBucket[] {
  const bucketCount = Math.max(1, Math.ceil((bounds.endAt - bounds.startAt) / bounds.bucketMs));

  return Array.from({ length: bucketCount }, (_, index) => {
    const startAt = bounds.startAt + index * bounds.bucketMs;
    const endAt = Math.min(bounds.endAt, startAt + bounds.bucketMs);
    const bucketEvents = eventsInRange(events, startAt, endAt);
    const activities = latestByActivity(bucketEvents);
    return {
      startAt: new Date(startAt).toISOString(),
      endAt: new Date(endAt).toISOString(),
      events: bucketEvents.length,
      activities: activities.length,
      completed: activities.filter((event) => event.status === 'completed').length,
      failed: activities.filter((event) => event.status === 'failed').length,
      attention: activities.filter((event) => ATTENTION_STATUSES.has(event.status)).length,
    };
  });
}

