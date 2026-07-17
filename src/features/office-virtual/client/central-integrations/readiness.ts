import type {
  ChannelIntegrationSnapshot,
  OfficeProvisioningReadiness,
  OfficeProvisioningState,
  OfficeRequirement,
  WorkspaceCapabilitySnapshot,
} from './types';

function channelReady(channel: ChannelIntegrationSnapshot): boolean {
  return channel.configured && channel.enabled && channel.health === 'healthy';
}

function requirement(
  id: OfficeRequirement['id'],
  label: string,
  met: boolean,
  reason: string,
): OfficeRequirement {
  return { id, label, met, reason: met ? null : reason };
}

export function selectOfficeRequirements(snapshot: WorkspaceCapabilitySnapshot): OfficeRequirement[] {
  const whatsappReady =
    snapshot.whatsappAgent.enabled &&
    snapshot.whatsappAgent.activeAgentId !== null &&
    snapshot.whatsappAgent.activeAgentType !== null;
  const voiceReady = channelReady(snapshot.voice) && snapshot.voice.assistantId !== null;

  return [
    requirement(
      'whatsapp_agent',
      'Agente WhatsApp activo',
      whatsappReady,
      'El workspace necesita exactamente un agente WhatsApp activo.',
    ),
    requirement(
      'ycloud',
      'YCloud operativo',
      channelReady(snapshot.ycloud),
      'YCloud debe estar configurado, habilitado y saludable.',
    ),
    requirement(
      'voice',
      'Asistente de voz operativo',
      voiceReady,
      'Vapi debe tener un assistant vinculado y una conexión saludable.',
    ),
    requirement(
      'advanced_memory',
      'Memoria avanzada',
      snapshot.features.advancedMemory,
      'La memoria avanzada debe estar habilitada.',
    ),
    requirement(
      'cross_channel_memory',
      'Memoria compartida',
      snapshot.features.crossChannelMemory,
      'WhatsApp y voz deben compartir memoria por contacto.',
    ),
    requirement(
      'pipeline_ai',
      'Pipeline inteligente',
      snapshot.features.pipelineAi,
      'La clasificación de pipeline debe estar habilitada.',
    ),
    requirement(
      'cold_lead_recovery',
      'Recuperación de leads fríos',
      snapshot.features.coldLeadRecovery,
      'La recuperación de leads fríos debe estar habilitada.',
    ),
  ];
}

function provisioningState(prerequisitesMet: boolean, enabled: boolean): OfficeProvisioningState {
  if (enabled && !prerequisitesMet) return 'misconfigured';
  if (enabled) return 'active';
  if (prerequisitesMet) return 'ready_to_enable';
  return 'not_ready';
}

export function selectOfficeProvisioningReadiness(
  snapshot: WorkspaceCapabilitySnapshot,
): OfficeProvisioningReadiness {
  const requirements = selectOfficeRequirements(snapshot);
  const blockingRequirementIds = requirements.filter((item) => !item.met).map((item) => item.id);
  const prerequisitesMet = blockingRequirementIds.length === 0;

  return {
    workspaceId: snapshot.workspaceId,
    state: provisioningState(prerequisitesMet, snapshot.virtualOfficeEnabled),
    requirementsMet: requirements.length - blockingRequirementIds.length,
    requirementsTotal: requirements.length,
    canEnable: prerequisitesMet && !snapshot.virtualOfficeEnabled,
    visibleToWorkspace: prerequisitesMet && snapshot.virtualOfficeEnabled,
    accessible: prerequisitesMet && snapshot.virtualOfficeEnabled,
    requirements,
    blockingRequirementIds,
  };
}
