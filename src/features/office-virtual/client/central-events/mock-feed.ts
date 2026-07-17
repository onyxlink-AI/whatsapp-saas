import type { AgentId } from '../../schemas';
import type {
  OfficeActivityEvent,
  OfficeActivitySource,
  OfficeActivityStatus,
  OfficeEntityType,
} from './types';

type MockEventInput = {
  activityId: string;
  offsetMs: number;
  agentId: AgentId;
  status: OfficeActivityStatus;
  source: OfficeActivitySource;
  title: string;
  entityType?: OfficeEntityType;
  entityId?: string;
};

/** Deterministic feed for developing the office before the real panel is connected. */
export function createMockOfficeFeed(
  workspaceId = 'workspace-demo',
  startAt = new Date('2026-07-14T09:00:00.000Z'),
): OfficeActivityEvent[] {
  const inputs: MockEventInput[] = [
    {
      activityId: 'wa-001-route',
      offsetMs: 0,
      agentId: 'coordinator',
      status: 'working',
      source: 'whatsapp',
      title: 'Enrutando un nuevo mensaje de WhatsApp',
      entityType: 'conversation',
      entityId: 'conversation-001',
    },
    {
      activityId: 'wa-001-route',
      offsetMs: 1_000,
      agentId: 'coordinator',
      status: 'completed',
      source: 'whatsapp',
      title: 'Mensaje enviado a Lead Intake',
      entityType: 'conversation',
      entityId: 'conversation-001',
    },
    {
      activityId: 'wa-001-intake',
      offsetMs: 1_100,
      agentId: 'lead-intake',
      status: 'working',
      source: 'whatsapp',
      title: 'Identificando y calificando el contacto',
      entityType: 'contact',
      entityId: 'contact-001',
    },
    {
      activityId: 'wa-001-intake',
      offsetMs: 3_000,
      agentId: 'lead-intake',
      status: 'completed',
      source: 'whatsapp',
      title: 'Contacto calificado',
      entityType: 'contact',
      entityId: 'contact-001',
    },
    {
      activityId: 'voice-001-summary',
      offsetMs: 3_200,
      agentId: 'strategy',
      status: 'working',
      source: 'voice',
      title: 'Analizando el resumen de una llamada',
      entityType: 'voice_call',
      entityId: 'voice-call-001',
    },
    {
      activityId: 'voice-001-summary',
      offsetMs: 5_200,
      agentId: 'strategy',
      status: 'completed',
      source: 'voice',
      title: 'Siguiente acción añadida al pipeline',
      entityType: 'deal',
      entityId: 'deal-001',
    },
    {
      activityId: 'proposal-001-review',
      offsetMs: 5_500,
      agentId: 'review-qa',
      status: 'approval_required',
      source: 'manual',
      title: 'Propuesta pendiente de aprobación',
      entityType: 'deal',
      entityId: 'deal-001',
    },
    {
      activityId: 'automation-001-followup',
      offsetMs: 5_800,
      agentId: 'content',
      status: 'queued',
      source: 'automation',
      title: 'Seguimiento de lead frío en cola',
      entityType: 'template',
      entityId: 'template-001',
    },
  ];

  return inputs.map((input, index) => ({
    id: `mock-event-${index + 1}`,
    activityId: input.activityId,
    workspaceId,
    agentId: input.agentId,
    status: input.status,
    source: input.source,
    title: input.title,
    occurredAt: new Date(startAt.getTime() + input.offsetMs).toISOString(),
    entityType: input.entityType,
    entityId: input.entityId,
    dedupeKey: `mock:${input.activityId}:${input.status}`,
  }));
}

