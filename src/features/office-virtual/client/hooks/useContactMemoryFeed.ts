import { useCallback, useState } from 'react';
import {
  applyMemoryMutation,
  createCentralMemoryState,
  createMemoryFixtures,
  reduceMemoryMutations,
} from '../central-memory';
import type { CentralMemoryState, MemoryMutationEvent } from '../central-memory/types';

// Adapter hook for src/central-memory (Codex's pure model) — same pattern as
// useOfficeActivityFeed: fixtures today, real workspace events later, without
// changing what MemoriaView consumes. See COORDINACION_CLAUDE_CODEX.md.
// createMemoryFixtures() hardcodes every event to 'workspace-demo' and takes
// no parameter, so every seeded profile came back tagged 'workspace-demo'
// regardless of the real workspace — not just failing searchWorkspace, but
// silently dropping forgetItem too (central-memory's reducer ignores a
// mutation whose workspaceId doesn't match the profile it already has).
// Restamped here before reducing, without touching central-memory itself.

export type ContactMemoryFeed = {
  state: CentralMemoryState;
  forgetItem: (contactId: string, itemId: string) => void;
};

/** Exported for isolation tests — verifies fixture profiles come back scoped to the given workspace, not the shared demo id. */
export function seedMemoryState(workspaceId: string): CentralMemoryState {
  const events = createMemoryFixtures().map((event) => ({ ...event, workspaceId }));
  return reduceMemoryMutations(events, createCentralMemoryState());
}

export function useContactMemoryFeed(workspaceId: string, demoMode = false): ContactMemoryFeed {
  const [state, setState] = useState<CentralMemoryState>(() =>
    demoMode ? seedMemoryState(workspaceId) : createCentralMemoryState(),
  );

  const forgetItem = useCallback((contactId: string, itemId: string) => {
    const event: MemoryMutationEvent = {
      id: `forget-${itemId}-${Date.now()}`,
      kind: 'item.forgotten',
      workspaceId,
      contactId,
      source: 'manual',
      occurredAt: new Date().toISOString(),
      itemId,
    };
    setState((prev) => applyMemoryMutation(prev, event));
  }, [workspaceId]);

  return { state, forgetItem };
}
