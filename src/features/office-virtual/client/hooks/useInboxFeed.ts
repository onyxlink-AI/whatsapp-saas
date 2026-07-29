import { useMemo, useState } from 'react';
import { projectInboxThread, selectInboxStats, selectInboxThreads } from '../central-inbox';
import type { InboxFilters, InboxStats, InboxThread } from '../central-inbox/types';
import { seedScopedContact } from './workspaceContactFixture';

// Adapter hook for src/central-inbox (Codex's multichannel inbox contract —
// see COORDINACION_CLAUDE_CODEX.md). projectInboxThread isn't wired to a live
// Supabase query yet, so useInboxFeed honestly starts empty instead of
// showing the demo fixture as if it were the workspace's real inbox.
// seedInboxThreads below is kept only for isolation.test.ts, which calls it
// directly to verify the workspace-scoping logic still holds.

const DEFAULT_FILTERS: InboxFilters = { sort: 'recent' };

export type InboxFeed = {
  threads: InboxThread[];
  filteredThreads: InboxThread[];
  filters: InboxFilters;
  setFilters: (patch: Partial<InboxFilters>) => void;
  resetFilters: () => void;
  stats: InboxStats;
  draftsByContact: Record<string, string[]>;
  addDraftMessage: (contactId: string, text: string) => void;
};

/** Exported for isolation tests only — verifies the thread comes back scoped to the given workspace, not the shared demo fixture. Not used by useInboxFeed in production. */
export function seedInboxThreads(workspaceId: string): InboxThread[] {
  const contact = seedScopedContact(workspaceId);
  if (!contact) return [];
  const result = projectInboxThread({
    contact,
    messages: [
      {
        id: 'message-000',
        workspaceId,
        conversationId: 'conversation-001',
        direction: 'out',
        body: 'Hola Lucía, podemos ayudarte a unificar la atención de tu clínica.',
        status: 'read',
        occurredAt: '2026-07-14T15:05:00.000Z',
      },
      {
        id: 'message-001',
        workspaceId,
        conversationId: 'conversation-001',
        direction: 'in',
        body: 'Quiero automatizar WhatsApp y las llamadas de la clínica.',
        status: 'read',
        occurredAt: '2026-07-14T15:10:00.000Z',
      },
    ],
    voiceCalls: [
      {
        id: 'voice-call-001',
        workspaceId,
        contactId: 'contact-lucia',
        callStatus: 'ended',
        durationSeconds: 183,
        summary: 'Busca atención multicanal para su clínica.',
        endedReason: 'customer-ended-call',
        occurredAt: '2026-07-14T14:00:00.000Z',
      },
    ],
  });
  return result.success ? [result.thread] : [];
}

export function useInboxFeed(_workspaceId: string): InboxFeed {
  const [threads] = useState<InboxThread[]>([]);
  const [filters, setFiltersState] = useState<InboxFilters>(DEFAULT_FILTERS);
  const [draftsByContact, setDraftsByContact] = useState<Record<string, string[]>>({});

  const filteredThreads = useMemo(() => selectInboxThreads(threads, filters), [threads, filters]);
  const stats = useMemo(() => selectInboxStats(threads), [threads]);

  const setFilters = (patch: Partial<InboxFilters>) => setFiltersState((prev) => ({ ...prev, ...patch }));
  const resetFilters = () => setFiltersState(DEFAULT_FILTERS);

  const addDraftMessage = (contactId: string, text: string) => {
    if (!text.trim()) return;
    setDraftsByContact((prev) => ({ ...prev, [contactId]: [...(prev[contactId] ?? []), text.trim()] }));
  };

  return { threads, filteredThreads, filters, setFilters, resetFilters, stats, draftsByContact, addDraftMessage };
}
