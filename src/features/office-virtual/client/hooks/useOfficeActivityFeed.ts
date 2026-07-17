import { useEffect, useRef, useState } from 'react';
import { AGENT_ORDER } from '../../agents/registry';
import type { AgentId } from '../../schemas';
import {
  applyOfficeActivityEvent,
  createMockOfficeFeed,
  createOfficeActivityState,
  selectAgentActivity,
} from '../central-events';
import type { AgentActivitySnapshot, OfficeActivityEvent, OfficeActivityState } from '../central-events/types';

// See COORDINACION_CLAUDE_CODEX.md > "Punto de integración acordado": this is
// the adapter hook — mock source today, Supabase Realtime later. It never
// touches the central-events contract, only consumes it.

const SNAPSHOT_TICK_MS = 1000;
const LOOP_GAP_MS = 4000;

export type OfficeActivityFeed = {
  snapshots: Record<AgentId, AgentActivitySnapshot>;
  /** Newest first — see src/central-events/state.ts (capped, deduped). */
  recentEvents: OfficeActivityEvent[];
  /** Raw reducer state, for consumers that need central-events/selectors.ts (e.g. PanelView). */
  state: OfficeActivityState;
};

function emptyFeed(): OfficeActivityFeed {
  const now = Date.now();
  const state = createOfficeActivityState();
  const snapshots = {} as Record<AgentId, AgentActivitySnapshot>;
  for (const id of AGENT_ORDER) snapshots[id] = selectAgentActivity(state, id, now);
  return { snapshots, recentEvents: state.recentEvents, state };
}

/**
 * Drives the office's visual status (and the Actividad timeline) from the
 * shared OfficeActivityEvent contract instead of chat "typing" state. Today
 * it replays the deterministic mock feed on a loop (so the office always has
 * something happening); once a real workspace exists this becomes a Supabase
 * Realtime subscription without any change to the components consuming it.
 */
export function useOfficeActivityFeed(workspaceId: string): OfficeActivityFeed {
  const [feed, setFeed] = useState<OfficeActivityFeed>(emptyFeed);
  const stateRef = useRef<OfficeActivityState>(createOfficeActivityState());

  useEffect(() => {
    const timeouts: ReturnType<typeof setTimeout>[] = [];

    const recompute = () => {
      const snapshots = {} as Record<AgentId, AgentActivitySnapshot>;
      const now = Date.now();
      for (const id of AGENT_ORDER) snapshots[id] = selectAgentActivity(stateRef.current, id, now);
      setFeed({ snapshots, recentEvents: stateRef.current.recentEvents, state: stateRef.current });
    };

    const ingest = (event: OfficeActivityEvent) => {
      stateRef.current = applyOfficeActivityEvent(stateRef.current, event);
      recompute();
    };

    const scheduleLoop = (loopIndex: number) => {
      const template = createMockOfficeFeed(workspaceId);
      const baseTime = template.length ? Date.parse(template[0].occurredAt) : Date.now();

      let maxOffset = 0;
      for (const item of template) {
        const offset = Math.max(0, Date.parse(item.occurredAt) - baseTime);
        maxOffset = Math.max(maxOffset, offset);
        timeouts.push(
          setTimeout(() => {
            ingest({
              ...item,
              id: `${item.id}-loop${loopIndex}`,
              dedupeKey: item.dedupeKey ? `${item.dedupeKey}:loop${loopIndex}` : undefined,
              occurredAt: new Date().toISOString(),
            });
          }, offset),
        );
      }

      timeouts.push(setTimeout(() => scheduleLoop(loopIndex + 1), maxOffset + LOOP_GAP_MS));
    };

    scheduleLoop(0);
    const tickId = setInterval(recompute, SNAPSHOT_TICK_MS);

    return () => {
      timeouts.forEach(clearTimeout);
      clearInterval(tickId);
    };
  }, [workspaceId]);

  return feed;
}
