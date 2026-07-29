import type {
  GlobalSearchActor,
  GlobalSearchCategory,
  GlobalSearchQuery,
  GlobalSearchResponse,
  GlobalSearchResult,
  GlobalSearchSources,
} from './types';

const ALL_CATEGORIES: GlobalSearchCategory[] = ['contact', 'conversation', 'task', 'routine', 'memory', 'activity'];

function normalize(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es').trim();
}

function relevance(query: string, title: string, fields: Array<string | null | undefined>): number {
  const normalizedTitle = normalize(title);
  const normalizedFields = fields.filter(Boolean).map((value) => normalize(value!));
  const tokens = query.split(/\s+/).filter(Boolean);
  const searchable = [normalizedTitle, ...normalizedFields].join(' ');
  if (!tokens.every((token) => searchable.includes(token))) return 0;

  let score = 20 + tokens.length * 4;
  if (normalizedTitle === query) score += 100;
  else if (normalizedTitle.startsWith(query)) score += 70;
  else if (normalizedTitle.includes(query)) score += 45;
  for (const field of normalizedFields) {
    if (field === query) score += 30;
    else if (field.includes(query)) score += 12;
  }
  return score;
}

function workspaceMatches(workspaceId: string, sources: GlobalSearchSources): boolean {
  return [
    ...sources.contacts,
    ...sources.conversations,
    ...sources.tasks,
    ...sources.routines,
    ...sources.memories,
    ...sources.activities,
  ].every((source) => source.workspaceId === workspaceId);
}

function sortResults(results: GlobalSearchResult[]): GlobalSearchResult[] {
  return results.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return Date.parse(b.occurredAt ?? '') - Date.parse(a.occurredAt ?? '');
  });
}

export function searchWorkspace(
  actor: GlobalSearchActor,
  input: GlobalSearchQuery,
  sources: GlobalSearchSources,
): GlobalSearchResponse {
  if (actor.role !== 'super_admin' && actor.workspaceId !== input.workspaceId) {
    return { success: false, error: 'unauthorized' };
  }
  if (!workspaceMatches(input.workspaceId, sources)) return { success: false, error: 'workspace_mismatch' };

  const query = normalize(input.query);
  if (!query) return { success: true, results: [], total: 0 };
  const categories = new Set(input.categories?.length ? input.categories : ALL_CATEGORIES);
  const results: GlobalSearchResult[] = [];

  if (categories.has('contact')) {
    for (const contact of sources.contacts) {
      const score = relevance(query, contact.displayName, [contact.phoneMasked, contact.emailMasked, contact.source, contact.tags.join(' '), contact.nextAction]);
      if (!score) continue;
      results.push({
        id: `contact:${contact.contactId}`, workspaceId: input.workspaceId, category: 'contact', title: contact.displayName,
        subtitle: contact.phoneMasked, excerpt: contact.nextAction, occurredAt: contact.latestActivityAt, score,
        target: { view: 'contactos', entityId: contact.contactId, contactId: contact.contactId },
      });
    }
  }

  if (categories.has('conversation')) {
    for (const thread of sources.conversations) {
      const timelineText = thread.timeline.map((item) => item.kind === 'message' ? item.body : item.summary).filter(Boolean).join(' ');
      const score = relevance(query, thread.displayName, [thread.phoneMasked, thread.latestPreview, thread.memorySummary, thread.nextAction, timelineText]);
      if (!score) continue;
      results.push({
        id: `conversation:${thread.contactId}`, workspaceId: input.workspaceId, category: 'conversation', title: thread.displayName,
        subtitle: thread.channels.join(' + '), excerpt: thread.latestPreview, occurredAt: thread.latestAt, score,
        target: { view: 'bandeja', entityId: thread.contactId, contactId: thread.contactId },
      });
    }
  }

  if (categories.has('task')) {
    for (const task of sources.tasks) {
      const score = relevance(query, task.title, [task.description, task.status, task.priority, task.source, task.assignedAgentId]);
      if (!score) continue;
      results.push({
        id: `task:${task.id}`, workspaceId: input.workspaceId, category: 'task', title: task.title,
        subtitle: `${task.status} · ${task.priority}`, excerpt: task.description || null, occurredAt: task.updatedAt, score,
        target: { view: 'tareas', entityId: task.id, contactId: task.contactId },
      });
    }
  }

  if (categories.has('routine')) {
    for (const routine of sources.routines) {
      const score = relevance(query, routine.name, [routine.description, routine.status, routine.schedule.kind, routine.taskTemplate.title, routine.assignedAgentId]);
      if (!score) continue;
      results.push({
        id: `routine:${routine.id}`, workspaceId: input.workspaceId, category: 'routine', title: routine.name,
        subtitle: `${routine.status} · ${routine.schedule.kind}`, excerpt: routine.description || routine.taskTemplate.title,
        occurredAt: routine.updatedAt, score, target: { view: 'rutinas', entityId: routine.id, contactId: null },
      });
    }
  }

  if (categories.has('memory')) {
    const mayReadSensitive = input.includeSensitiveMemory && ['super_admin', 'workspace_admin'].includes(actor.role);
    for (const profile of sources.memories) {
      const visibleItems = profile.items.filter((item) => mayReadSensitive || item.sensitivity !== 'sensitive');
      const matchingItems = visibleItems.filter((item) => normalize(item.value).includes(query));
      const score = relevance(query, profile.displayName ?? profile.contactId, [profile.phoneMasked, profile.summary, ...visibleItems.map((item) => item.value)]);
      if (!score) continue;
      results.push({
        id: `memory:${profile.contactId}`, workspaceId: input.workspaceId, category: 'memory',
        title: profile.displayName ?? profile.contactId, subtitle: `${visibleItems.length} recuerdos`,
        excerpt: matchingItems[0]?.value ?? (normalize(profile.summary).includes(query) ? profile.summary : null),
        occurredAt: profile.updatedAt, score, target: { view: 'memoria', entityId: profile.contactId, contactId: profile.contactId },
      });
    }
  }

  if (categories.has('activity')) {
    for (const event of sources.activities) {
      const score = relevance(query, event.title, [event.agentId, event.status, event.source, event.entityType, event.entityId]);
      if (!score) continue;
      results.push({
        id: `activity:${event.id}`, workspaceId: input.workspaceId, category: 'activity', title: event.title,
        subtitle: `${event.agentId} · ${event.status}`, excerpt: event.source, occurredAt: event.occurredAt, score,
        target: { view: 'actividad', entityId: event.id, contactId: event.entityType === 'contact' ? event.entityId ?? null : null },
      });
    }
  }

  const sorted = sortResults(results);
  const limit = Math.min(100, Math.max(1, input.limit ?? 30));
  return { success: true, results: sorted.slice(0, limit), total: sorted.length };
}
