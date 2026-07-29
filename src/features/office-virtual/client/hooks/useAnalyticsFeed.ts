import { useMemo, useState } from 'react';
import {
  selectWorkspaceAnalyticsForActor,
} from '../central-analytics';
import type { AnalyticsPeriod, OfficeActivityEvent, TrendBucket } from '../central-events';
import { selectTrendBuckets } from '../central-events';
import type { CentralRoutineState } from '../central-routines';
import type { CentralTaskState } from '../central-tasks';
import type { AnalyticsActor, WorkspaceAnalytics } from '../central-analytics';

export type AnalyticsFeed = {
  workspaceId: string;
  period: AnalyticsPeriod;
  setPeriod: (period: AnalyticsPeriod) => void;
  analytics: WorkspaceAnalytics | null;
  trend: TrendBucket[];
  loading: boolean;
  error: 'workspace_mismatch' | 'unauthorized' | null;
};

const TIME_ZONE = 'Europe/Madrid';

export type AnalyticsFeedOptions = {
  workspaceId: string;
  actor: AnalyticsActor;
  events: OfficeActivityEvent[];
  taskState: CentralTaskState;
  routineState: CentralRoutineState;
};

export function useAnalyticsFeed(options: AnalyticsFeedOptions): AnalyticsFeed {
  // Real sources only, always supplied by the caller — this used to
  // silently fabricate 35 days of demo activity/tasks/routines and present
  // KPIs computed from them as if they were this workspace's real numbers
  // whenever a caller omitted these fields. Required (not optional) props
  // make that fixture landmine impossible instead of merely unused today.
  const { workspaceId, actor, events, taskState, routineState } = options;
  const [period, setPeriod] = useState<AnalyticsPeriod>('7d');
  // eslint-disable-next-line react-hooks/purity -- stable reference timestamp for the analytics window, intentionally captured once per mount.
  const now = useMemo(() => Date.now(), []);
  const result = useMemo(() => selectWorkspaceAnalyticsForActor(
    actor,
    { workspaceId, period, now, timeZone: TIME_ZONE },
    events,
    taskState,
    routineState,
  ), [actor, events, now, period, routineState, taskState, workspaceId]);

  if (!result.success) {
    return { workspaceId, period, setPeriod, analytics: null, trend: [], loading: false, error: result.error };
  }

  return {
    workspaceId,
    period,
    setPeriod,
    analytics: result.analytics,
    trend: selectTrendBuckets(events, result.analytics.activity.bounds),
    loading: false,
    error: null,
  };
}
