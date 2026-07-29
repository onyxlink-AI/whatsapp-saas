import { useState } from 'react';
import { AGENT_ORDER } from '../../agents/registry';
import type { AgentId } from '../../schemas';
import { createOfficeActivityState, reduceOfficeActivityEvents, selectAgentActivity } from '../central-events';
import type { AgentActivitySnapshot, OfficeActivityEvent, OfficeActivityState } from '../central-events/types';
import { createDemoOfficeEvents } from '../demo/demoPresentationData';

// See COORDINACION_CLAUDE_CODEX.md > "Punto de integración acordado": this is
// the adapter hook — honestly empty until wired to a real event source
// (Supabase Realtime). It never touches the central-events contract, only
// consumes it. Nothing here fabricates activity on a timer.

export type OfficeActivityFeed = {
  snapshots: Record<AgentId, AgentActivitySnapshot>;
  /** Newest first — see src/central-events/state.ts (capped, deduped). */
  recentEvents: OfficeActivityEvent[];
  /** Raw reducer state, for consumers that need central-events/selectors.ts (e.g. PanelView). */
  state: OfficeActivityState;
};

/**
 * Drives the office's visual status (and the Actividad timeline) from the
 * shared OfficeActivityEvent contract instead of chat "typing" state or a
 * timer. No real event source is wired yet (that becomes a Supabase
 * Realtime subscription later), so this honestly reports "no activity"
 * rather than replaying a scripted feed.
 */
export function useOfficeActivityFeed(workspaceId: string, demoMode = false): OfficeActivityFeed {
  const [feed] = useState<OfficeActivityFeed>(() => {
    const now = Date.now();
    const state = demoMode
      ? reduceOfficeActivityEvents(createDemoOfficeEvents(workspaceId, now))
      : createOfficeActivityState();
    const snapshots = {} as Record<AgentId, AgentActivitySnapshot>;
    for (const id of AGENT_ORDER) snapshots[id] = selectAgentActivity(state, id, now);
    return { snapshots, recentEvents: state.recentEvents, state };
  });
  return feed;
}
