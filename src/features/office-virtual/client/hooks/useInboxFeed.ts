import { useMemo, useState } from 'react';
import { projectInboxThread, selectInboxStats, selectInboxThreads } from '../central-inbox';
import type { InboxFilters, InboxStats, InboxThread } from '../central-inbox/types';
import { seedScopedContact } from './workspaceContactFixture';

// Adapter hook for src/central-inbox (Codex's multichannel inbox contract —
// see COORDINACION_CLAUDE_CODEX.md). Seeds from Codex's own fixture shape,
// wrapping the same workspace-scoped Contact360 useContact360Feed uses (see
// workspaceContactFixture.ts) plus simulated messages/calls restamped to the
// same real workspaceId — central-inbox's projectInboxThread rejects the
// thread outright (`workspace_mismatch`) the moment a message/call disagrees
// with the contact's workspace, so this can never desync from the contact
// feed. The only thing owned here is `draftsByContact`: unsent draft replies
// typed in the UI. They never join `thread.timeline` and are never
// dispatched anywhere — "no enviaremos mensajes... aparecerán como...
// borradores".

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

/** Exported for isolation tests — verifies the thread comes back scoped to the given workspace, not the shared demo fixture. */
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

export function useInboxFeed(workspaceId: string): InboxFeed {
  const [threads] = useState<InboxThread[]>(() => seedInboxThreads(workspaceId));
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
