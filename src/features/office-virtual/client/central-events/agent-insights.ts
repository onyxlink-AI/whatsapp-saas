import type { AgentId } from '../../schemas';
import { selectAgentActivity } from './state';
import type {
  AgentActivitySnapshot,
  OfficeActivityEvent,
  OfficeActivitySource,
  OfficeActivityState,
} from './types';

export type AgentCapabilityId =
  | 'route-work'
  | 'qualify-leads'
  | 'cross-channel-memory'
  | 'design-strategy'
  | 'classify-pipeline'
  | 'draft-proposals'
  | 'estimate-delivery'
  | 'manage-projects'
  | 'schedule-actions'
  | 'execute-tools'
  | 'create-content'
  | 'manage-templates'
  | 'quality-review'
  | 'request-approval'
  | 'audit-events';

export type AgentCapability = {
  id: AgentCapabilityId;
  label: string;
};

export type AgentAvailability = 'available' | 'queued' | 'busy' | 'attention';

export type AgentOperationalInsight = {
  agentId: AgentId;
  snapshot: AgentActivitySnapshot;
  availability: AgentAvailability;
  canAcceptWork: boolean;
  currentSource: OfficeActivitySource | null;
  lastEvent: OfficeActivityEvent | null;
  totalActivities: number;
  completedActivities: number;
  attentionActivities: number;
  successRate: number;
  averageCompletionMs: number | null;
  sourceCounts: Record<OfficeActivitySource, number>;
  primarySource: OfficeActivitySource | null;
  capabilities: readonly AgentCapability[];
};

const SOURCES: OfficeActivitySource[] = ['whatsapp', 'voice', 'manual', 'automation'];

export const AGENT_CAPABILITIES: Record<AgentId, readonly AgentCapability[]> = {
  coordinator: [
    { id: 'route-work', label: 'Enrutamiento de trabajo' },
    { id: 'cross-channel-memory', label: 'Contexto multicanal' },
    { id: 'audit-events', label: 'Supervisión operativa' },
  ],
  'lead-intake': [
    { id: 'qualify-leads', label: 'Calificación de leads' },
    { id: 'cross-channel-memory', label: 'Memoria WhatsApp y voz' },
  ],
  strategy: [
    { id: 'design-strategy', label: 'Diseño de estrategia' },
    { id: 'classify-pipeline', label: 'Clasificación de pipeline' },
    { id: 'cross-channel-memory', label: 'Análisis de contexto' },
  ],
  proposal: [
    { id: 'draft-proposals', label: 'Creación de propuestas' },
    { id: 'estimate-delivery', label: 'Estimación de alcance' },
    { id: 'request-approval', label: 'Solicitud de aprobación' },
  ],
  operations: [
    { id: 'manage-projects', label: 'Gestión de proyectos' },
    { id: 'schedule-actions', label: 'Agenda y seguimiento' },
    { id: 'execute-tools', label: 'Ejecución de herramientas' },
  ],
  content: [
    { id: 'create-content', label: 'Creación de contenido' },
    { id: 'manage-templates', label: 'Plantillas y seguimiento' },
  ],
  'review-qa': [
    { id: 'quality-review', label: 'Control de calidad' },
    { id: 'request-approval', label: 'Aprobaciones humanas' },
    { id: 'audit-events', label: 'Auditoría de actividad' },
  ],
};

function eventTime(event: OfficeActivityEvent): number {
  const value = Date.parse(event.occurredAt);
  return Number.isFinite(value) ? value : 0;
}

function latestActivityEvents(events: OfficeActivityEvent[]): OfficeActivityEvent[] {
  const latest = new Map<string, OfficeActivityEvent>();
  for (const event of events) {
    const current = latest.get(event.activityId);
    if (!current || eventTime(event) >= eventTime(current)) latest.set(event.activityId, event);
  }
  return [...latest.values()];
}

function availabilityFor(snapshot: AgentActivitySnapshot): AgentAvailability {
  switch (snapshot.status) {
    case 'available':
    case 'completed':
      return 'available';
    case 'queued':
      return 'queued';
    case 'working':
      return 'busy';
    case 'failed':
    case 'blocked':
    case 'approval_required':
      return 'attention';
  }
}

function averageCompletionMs(events: OfficeActivityEvent[]): number | null {
  const byActivity = new Map<string, OfficeActivityEvent[]>();
  for (const event of events) {
    const list = byActivity.get(event.activityId) ?? [];
    list.push(event);
    byActivity.set(event.activityId, list);
  }

  const durations: number[] = [];
  for (const lifecycle of byActivity.values()) {
    const ordered = lifecycle.sort((a, b) => eventTime(a) - eventTime(b));
    const start = ordered.find((event) => event.status === 'queued' || event.status === 'working');
    const completed = [...ordered].reverse().find((event) => event.status === 'completed');
    if (start && completed) durations.push(Math.max(0, eventTime(completed) - eventTime(start)));
  }

  if (durations.length === 0) return null;
  return Math.round(durations.reduce((sum, duration) => sum + duration, 0) / durations.length);
}

function emptySourceCounts(): Record<OfficeActivitySource, number> {
  return { whatsapp: 0, voice: 0, manual: 0, automation: 0 };
}

export function selectAgentOperationalInsights(
  state: OfficeActivityState,
  historicalEvents: OfficeActivityEvent[],
  agentIds: AgentId[],
  now = Date.now(),
): AgentOperationalInsight[] {
  return agentIds.map((agentId) => {
    const snapshot = selectAgentActivity(state, agentId, now);
    const agentHistory = historicalEvents.filter((event) => event.agentId === agentId);
    const activities = latestActivityEvents(agentHistory);
    const sourceCounts = emptySourceCounts();
    for (const event of activities) sourceCounts[event.source] += 1;

    const terminal = activities.filter((event) =>
      event.status === 'completed' || event.status === 'failed' || event.status === 'blocked',
    );
    const completedActivities = terminal.filter((event) => event.status === 'completed').length;
    const attentionActivities = activities.filter((event) =>
      event.status === 'failed' || event.status === 'blocked' || event.status === 'approval_required',
    ).length;
    const primarySource = [...SOURCES].sort((a, b) => sourceCounts[b] - sourceCounts[a])[0];
    const availability = availabilityFor(snapshot);

    return {
      agentId,
      snapshot,
      availability,
      canAcceptWork: availability === 'available',
      currentSource: snapshot.event?.source ?? null,
      lastEvent: [...agentHistory].sort((a, b) => eventTime(b) - eventTime(a))[0] ?? null,
      totalActivities: activities.length,
      completedActivities,
      attentionActivities,
      successRate: terminal.length === 0 ? 0 : Math.round((completedActivities / terminal.length) * 1_000) / 10,
      averageCompletionMs: averageCompletionMs(agentHistory),
      sourceCounts,
      primarySource: primarySource && sourceCounts[primarySource] > 0 ? primarySource : null,
      capabilities: AGENT_CAPABILITIES[agentId],
    };
  });
}

export function selectAgentLastActivity(
  events: OfficeActivityEvent[],
  agentId: AgentId,
): OfficeActivityEvent | null {
  return [...events]
    .filter((event) => event.agentId === agentId)
    .sort((a, b) => eventTime(b) - eventTime(a))[0] ?? null;
}

