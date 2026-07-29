import type { AgentId } from '../../schemas';
import type {
  OfficeActivityEvent,
  OfficeActivitySource,
  OfficeActivityStatus,
  OfficeEntityType,
} from './types';
import { defaultAgentForSource } from './agent-bindings';

type BaseAdapterInput = {
  eventId: string;
  workspaceId: string;
  occurredAt: string;
  title?: string;
  payload?: Record<string, unknown>;
};

export type WhatsAppActivityInput = BaseAdapterInput & {
  conversationId: string;
  phase: 'received' | 'routing' | 'processing' | 'responded' | 'handoff' | 'failed';
  agentId?: AgentId;
};

export type VoiceActivityInput = BaseAdapterInput & {
  callId: string;
  phase: 'ringing' | 'connected' | 'tool_running' | 'ended' | 'failed';
  agentId?: AgentId;
};

export type WorkflowActivityInput = BaseAdapterInput & {
  runId: string;
  phase: 'queued' | 'started' | 'completed' | 'failed' | 'blocked';
  agentId: AgentId;
  entityType?: OfficeEntityType;
  entityId?: string;
};

export type ApprovalActivityInput = BaseAdapterInput & {
  approvalId: string;
  runId?: string;
  phase: 'requested' | 'approved' | 'rejected';
  requestedByAgentId?: AgentId;
};

type EventParts = {
  activityId: string;
  agentId: AgentId;
  status: OfficeActivityStatus;
  source: OfficeActivitySource;
  title: string;
  entityType?: OfficeEntityType;
  entityId?: string;
  runId?: string;
};

function buildEvent(input: BaseAdapterInput, parts: EventParts): OfficeActivityEvent {
  return {
    id: input.eventId,
    activityId: parts.activityId,
    workspaceId: input.workspaceId,
    agentId: parts.agentId,
    status: parts.status,
    source: parts.source,
    title: input.title ?? parts.title,
    occurredAt: input.occurredAt,
    entityType: parts.entityType,
    entityId: parts.entityId,
    runId: parts.runId,
    dedupeKey: `${parts.source}:${input.eventId}`,
    payload: input.payload,
  };
}

export function adaptWhatsAppActivity(input: WhatsAppActivityInput): OfficeActivityEvent {
  const specialist = input.agentId ?? defaultAgentForSource('whatsapp');
  const routeActivityId = `whatsapp:${input.conversationId}:route`;
  const specialistActivityId = `whatsapp:${input.conversationId}:${specialist}`;

  switch (input.phase) {
    case 'received':
      return buildEvent(input, {
        activityId: routeActivityId,
        agentId: 'coordinator',
        status: 'queued',
        source: 'whatsapp',
        title: 'Nuevo mensaje de WhatsApp en cola',
        entityType: 'conversation',
        entityId: input.conversationId,
      });
    case 'routing':
      return buildEvent(input, {
        activityId: routeActivityId,
        agentId: 'coordinator',
        status: 'working',
        source: 'whatsapp',
        title: 'Enrutando conversación de WhatsApp',
        entityType: 'conversation',
        entityId: input.conversationId,
      });
    case 'processing':
      return buildEvent(input, {
        activityId: specialistActivityId,
        agentId: specialist,
        status: 'working',
        source: 'whatsapp',
        title: 'Procesando conversación de WhatsApp',
        entityType: 'conversation',
        entityId: input.conversationId,
      });
    case 'responded':
      return buildEvent(input, {
        activityId: specialistActivityId,
        agentId: specialist,
        status: 'completed',
        source: 'whatsapp',
        title: 'Respuesta de WhatsApp completada',
        entityType: 'conversation',
        entityId: input.conversationId,
      });
    case 'handoff':
      return buildEvent(input, {
        activityId: `whatsapp:${input.conversationId}:handoff`,
        agentId: 'review-qa',
        status: 'approval_required',
        source: 'whatsapp',
        title: 'Conversación pendiente de intervención humana',
        entityType: 'conversation',
        entityId: input.conversationId,
      });
    case 'failed':
      return buildEvent(input, {
        activityId: specialistActivityId,
        agentId: specialist,
        status: 'failed',
        source: 'whatsapp',
        title: 'Error procesando conversación de WhatsApp',
        entityType: 'conversation',
        entityId: input.conversationId,
      });
  }
}

export function adaptVoiceActivity(input: VoiceActivityInput): OfficeActivityEvent {
  const agentId = input.agentId ?? defaultAgentForSource('voice');
  const activityId = `voice:${input.callId}:${agentId}`;

  switch (input.phase) {
    case 'ringing':
      return buildEvent(input, {
        activityId,
        agentId,
        status: 'queued',
        source: 'voice',
        title: 'Llamada entrante',
        entityType: 'voice_call',
        entityId: input.callId,
      });
    case 'connected':
      return buildEvent(input, {
        activityId,
        agentId,
        status: 'working',
        source: 'voice',
        title: 'Atendiendo llamada',
        entityType: 'voice_call',
        entityId: input.callId,
      });
    case 'tool_running':
      return buildEvent(input, {
        activityId,
        agentId,
        status: 'working',
        source: 'voice',
        title: 'Ejecutando una herramienta durante la llamada',
        entityType: 'voice_call',
        entityId: input.callId,
      });
    case 'ended':
      return buildEvent(input, {
        activityId,
        agentId,
        status: 'completed',
        source: 'voice',
        title: 'Llamada finalizada',
        entityType: 'voice_call',
        entityId: input.callId,
      });
    case 'failed':
      return buildEvent(input, {
        activityId,
        agentId,
        status: 'failed',
        source: 'voice',
        title: 'Error durante la llamada',
        entityType: 'voice_call',
        entityId: input.callId,
      });
  }
}

export function adaptWorkflowActivity(input: WorkflowActivityInput): OfficeActivityEvent {
  const statusByPhase: Record<WorkflowActivityInput['phase'], OfficeActivityStatus> = {
    queued: 'queued',
    started: 'working',
    completed: 'completed',
    failed: 'failed',
    blocked: 'blocked',
  };

  return buildEvent(input, {
    activityId: `workflow:${input.runId}:${input.agentId}`,
    agentId: input.agentId,
    status: statusByPhase[input.phase],
    source: 'automation',
    title: `Workflow ${input.phase}`,
    entityType: input.entityType,
    entityId: input.entityId,
    runId: input.runId,
  });
}

export function adaptApprovalActivity(input: ApprovalActivityInput): OfficeActivityEvent {
  const statusByPhase: Record<ApprovalActivityInput['phase'], OfficeActivityStatus> = {
    requested: 'approval_required',
    approved: 'completed',
    rejected: 'blocked',
  };
  const defaultTitle: Record<ApprovalActivityInput['phase'], string> = {
    requested: 'Acción pendiente de aprobación',
    approved: 'Acción aprobada',
    rejected: 'Acción rechazada',
  };

  return buildEvent(input, {
    activityId: `approval:${input.approvalId}`,
    agentId: input.requestedByAgentId ?? 'review-qa',
    status: statusByPhase[input.phase],
    source: 'manual',
    title: defaultTitle[input.phase],
    runId: input.runId,
  });
}
