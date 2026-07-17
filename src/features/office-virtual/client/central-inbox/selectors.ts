import type { InboxFilters, InboxPriority, InboxStats, InboxThread } from './types';

const PRIORITY_RANK: Record<InboxPriority, number> = {
  urgent: 0,
  high: 1,
  normal: 2,
  low: 3,
};

export function selectInboxThreads(
  threads: InboxThread[],
  filters: InboxFilters = {},
): InboxThread[] {
  const query = filters.query?.trim().toLocaleLowerCase('es') ?? '';
  const selected = threads
    .filter((thread) => !filters.channel || thread.channels.includes(filters.channel))
    .filter((thread) => !filters.status || thread.status === filters.status)
    .filter((thread) => !filters.priority || thread.priority === filters.priority)
    .filter(
      (thread) => !filters.assignedAgentId || thread.responsibleAgentId === filters.assignedAgentId,
    )
    .filter((thread) => !filters.unreadOnly || thread.unreadCount > 0)
    .filter((thread) => !filters.attentionOnly || thread.attentionReasons.length > 0)
    .filter((thread) => {
      if (!query) return true;
      return [
        thread.displayName,
        thread.phoneMasked,
        thread.latestPreview,
        thread.memorySummary,
        thread.nextAction,
      ]
        .filter((value): value is string => Boolean(value))
        .some((value) => value.toLocaleLowerCase('es').includes(query));
    });

  return selected.sort((a, b) => {
    if (filters.sort === 'priority') {
      const rank = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
      if (rank !== 0) return rank;
    }
    return Date.parse(b.latestAt) - Date.parse(a.latestAt);
  });
}

export function selectInboxThread(
  threads: InboxThread[],
  workspaceId: string,
  contactId: string,
): InboxThread | null {
  return (
    threads.find(
      (thread) => thread.workspaceId === workspaceId && thread.contactId === contactId,
    ) ?? null
  );
}

export function selectInboxStats(threads: InboxThread[]): InboxStats {
  return {
    total: threads.length,
    open: threads.filter((thread) => thread.status === 'open').length,
    waiting: threads.filter((thread) => thread.status === 'waiting').length,
    handoff: threads.filter((thread) => thread.status === 'handoff').length,
    unread: threads.reduce((total, thread) => total + thread.unreadCount, 0),
    whatsapp: threads.filter((thread) => thread.channels.includes('whatsapp')).length,
    voice: threads.filter((thread) => thread.channels.includes('voice')).length,
  };
}
