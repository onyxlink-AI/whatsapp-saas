import type { AgentId } from '../../schemas';
import type { OfficeActivityEvent, OfficeActivitySource, OfficeActivityStatus } from './types';

const AGENTS: AgentId[] = [
  'coordinator',
  'lead-intake',
  'strategy',
  'proposal',
  'operations',
  'content',
  'review-qa',
];
const SOURCES: OfficeActivitySource[] = ['whatsapp', 'voice', 'manual', 'automation'];

/** Stable 30-day dataset for Panel/Analytics development before Supabase is connected. */
export function createHistoricalOfficeFeed(
  workspaceId = 'workspace-demo',
  endAt = new Date('2026-07-15T00:00:00.000Z'),
  days = 30,
): OfficeActivityEvent[] {
  const events: OfficeActivityEvent[] = [];
  const safeDays = Math.max(0, Math.floor(days));

  for (let day = safeDays - 1; day >= 0; day -= 1) {
    for (let item = 0; item < 4; item += 1) {
      const sequence = day * 4 + item;
      const agentId = AGENTS[sequence % AGENTS.length];
      const source = SOURCES[sequence % SOURCES.length];
      const activityId = `history:${day}:${item}`;
      const startedAt = endAt.getTime() - day * 86_400_000 - (20 - item * 4) * 3_600_000;
      const terminalStatus: OfficeActivityStatus =
        sequence % 17 === 0 ? 'blocked' : sequence % 11 === 0 ? 'failed' : 'completed';
      const entityType = source === 'voice' ? ('voice_call' as const) : ('conversation' as const);

      events.push({
        id: `${activityId}:working`,
        activityId,
        workspaceId,
        agentId,
        status: 'working',
        source,
        title: `Actividad histórica ${sequence + 1}`,
        occurredAt: new Date(startedAt).toISOString(),
        entityType,
        entityId: `${entityType}-${sequence + 1}`,
        dedupeKey: `${activityId}:working`,
      });
      events.push({
        id: `${activityId}:${terminalStatus}`,
        activityId,
        workspaceId,
        agentId,
        status: terminalStatus,
        source,
        title: terminalStatus === 'completed' ? 'Actividad completada' : 'Actividad requiere atención',
        occurredAt: new Date(startedAt + 120_000).toISOString(),
        entityType,
        entityId: `${entityType}-${sequence + 1}`,
        dedupeKey: `${activityId}:${terminalStatus}`,
      });
    }
  }

  return events.sort((a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt));
}

