import type { AgentId } from '../../schemas';
import type { OfficeActivityEvent } from '../central-events';
import { createMockOfficeFeed } from '../central-events';
import type { OfficeConfigurationDocument } from '../central-integrations/configuration';
import type { OfficeAgentSeatProjection } from '../central-integrations/office-agent-projection';
import { STANDARD_OFFICE_PRESET } from '../central-integrations/preset';
import {
  CONFIGURABLE_AGENT_IDS,
  DEFAULT_SPECIALIST_COLORS,
} from '../central-integrations/specialist-seats';
import { SPECIALIST_TEMPLATES } from '../central-integrations/specialist-templates';
import type { WorkspaceCapabilitySnapshot } from '../central-integrations/types';
import type { WorkspaceWhatsAppBinding } from '../central-integrations/whatsapp-binding';
import type { OpenRouterConnectionBinding } from '../central-orchestration';

const DAY_MS = 24 * 60 * 60 * 1_000;

/**
 * Creates a rolling, deterministic-looking history around the current date so
 * 7/14/30-day analytics all contain meaningful comparison data. Every event is
 * scoped to the authenticated demo workspace.
 */
export function createDemoOfficeEvents(workspaceId: string, now = Date.now()): OfficeActivityEvent[] {
  const history = Array.from({ length: 31 }, (_, daysAgo) => {
    const start = new Date(now - daysAgo * DAY_MS);
    start.setHours(9 + (daysAgo % 4), 12, 0, 0);
    return createMockOfficeFeed(workspaceId, start).map((event, index) => ({
      ...event,
      id: `demo-${daysAgo}-${index}-${event.id}`,
      activityId: `demo-${daysAgo}-${event.activityId}`,
      dedupeKey: `demo:${daysAgo}:${event.activityId}:${event.status}`,
    }));
  }).flat();

  const liveInputs: Array<{
    id: string;
    agentId: AgentId;
    status: OfficeActivityEvent['status'];
    source: OfficeActivityEvent['source'];
    title: string;
  }> = [
    { id: 'live-sales', agentId: 'proposal', status: 'working', source: 'whatsapp', title: 'Preparando una propuesta comercial' },
    { id: 'live-operations', agentId: 'operations', status: 'working', source: 'automation', title: 'Actualizando el seguimiento de clientes' },
    { id: 'live-content', agentId: 'content', status: 'queued', source: 'manual', title: 'Contenido semanal preparado para revisión' },
    { id: 'live-approval', agentId: 'review-qa', status: 'approval_required', source: 'manual', title: 'Informe ejecutivo pendiente de aprobación' },
  ];

  const live = liveInputs.map((input, index): OfficeActivityEvent => ({
    id: `demo-${input.id}`,
    activityId: `demo-${input.id}`,
    workspaceId,
    agentId: input.agentId,
    status: input.status,
    source: input.source,
    title: input.title,
    occurredAt: new Date(now - (index + 1) * 45_000).toISOString(),
    entityType: index === 3 ? 'task' : 'deal',
    entityId: `demo-entity-${index + 1}`,
    dedupeKey: `demo:live:${input.id}`,
  }));

  return [...history, ...live];
}

export function createDemoOfficeConfiguration(workspaceId: string): OfficeConfigurationDocument {
  const specialists = Object.fromEntries(
    CONFIGURABLE_AGENT_IDS.map((agentId, index) => {
      const template = SPECIALIST_TEMPLATES[index];
      return [
        agentId,
        {
          agentId,
          enabled: true,
          templateId: template.id,
          name: template.name,
          color: DEFAULT_SPECIALIST_COLORS[agentId],
          function: template.function,
          objective: template.objective,
          instructions: template.instructions,
          clientLayer: 'Ejemplo de presentación: prioriza claridad, trazabilidad y aprobación humana en acciones sensibles.',
          model: null,
          extensions: index === 2 ? ['marketing-contenidos'] : index === 3 ? ['agenda-reservas'] : [],
          skills: index % 2 === 0 ? ['redaccion', 'revision-calidad'] : ['investigacion', 'analisis-documental'],
          allowedActions: [...template.allowedActions],
          approvalPolicy: template.approvalPolicy,
        },
      ];
    }),
  ) as OfficeConfigurationDocument['specialists'];

  return {
    workspaceId,
    presetId: STANDARD_OFFICE_PRESET.id,
    presetVersion: STANDARD_OFFICE_PRESET.version,
    revision: 8,
    status: 'published',
    officeDisplayName: 'OnyxLink Demo · Equipo Digital',
    sectorId: 'clinica-estetica',
    specialists,
    updatedAt: new Date().toISOString(),
    updatedBy: 'equipo@onyxlink.es',
  };
}

export function projectDemoSpecialists(
  document: OfficeConfigurationDocument,
): OfficeAgentSeatProjection[] {
  return CONFIGURABLE_AGENT_IDS
    .map((agentId) => document.specialists[agentId])
    .filter((specialist) => specialist.enabled)
    .map((specialist) => ({
      agentId: specialist.agentId,
      name: specialist.name,
      function: specialist.function,
      objective: specialist.objective,
      color: specialist.color,
    }));
}

export function createDemoCapabilitySnapshot(workspaceId: string): WorkspaceCapabilitySnapshot {
  const capturedAt = new Date().toISOString();
  return {
    workspaceId,
    capturedAt,
    virtualOfficeEnabled: true,
    whatsappAgent: {
      enabled: true,
      officeEnabled: true,
      activeAgentId: 'demo-whatsapp-agent',
      activeAgentType: 'agendamiento',
    },
    ycloud: { configured: true, enabled: true, health: 'healthy', checkedAt: capturedAt },
    voice: {
      configured: true,
      enabled: true,
      health: 'healthy',
      checkedAt: capturedAt,
      assistantId: 'demo-voice-assistant',
    },
    chatbot: {
      configured: true,
      enabled: true,
      health: 'healthy',
      checkedAt: capturedAt,
      provider: 'telegram',
    },
    features: {
      advancedMemory: true,
      crossChannelMemory: true,
      pipelineAi: true,
      coldLeadRecovery: true,
    },
  };
}

export function createDemoWhatsAppBinding(workspaceId: string): WorkspaceWhatsAppBinding {
  return {
    workspaceId,
    officeAgentId: 'lead-intake',
    state: 'ready',
    connectionId: 'demo-ycloud-connection',
    provider: 'ycloud',
    phoneNumberMasked: '+34 6•• •• •• 42',
    activeAgentId: 'demo-whatsapp-agent',
    activeAgentType: 'agendamiento',
  };
}

export function createDemoOpenRouterBinding(workspaceId: string): OpenRouterConnectionBinding {
  return {
    workspaceId,
    connectionId: 'demo-openrouter-connection',
    connectionKind: 'dedicated',
    status: 'connected',
    pendingAction: null,
    pendingRequestId: null,
    hasCredential: true,
    statusDetail: 'Conexión de muestra verificada.',
    updatedAt: new Date().toISOString(),
    updatedBy: 'onyxlink-demo',
  };
}
