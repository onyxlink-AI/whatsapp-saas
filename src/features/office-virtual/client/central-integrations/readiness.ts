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

/** Prepared in the SaaS panel: entitlement, selected profile and real YCloud connection. */
export function isWhatsAppChannelConfigured(snapshot: WorkspaceCapabilitySnapshot): boolean {
  return channelReady(snapshot.ycloud) && snapshot.whatsappAgent.enabled && snapshot.whatsappAgent.activeAgentId !== null && snapshot.whatsappAgent.activeAgentType !== null;
}

/** Visible and operational only after the separate switch in Oficina Virtual is on. */
export function isWhatsAppChannelReady(snapshot: WorkspaceCapabilitySnapshot): boolean {
  return isWhatsAppChannelConfigured(snapshot) && snapshot.whatsappAgent.officeEnabled;
}

/** Whether the workspace's real voice assistant seat is ready to show a character in the 3D office. */
export function isVoiceChannelReady(snapshot: WorkspaceCapabilitySnapshot): boolean {
  return channelReady(snapshot.voice) && snapshot.voice.assistantId !== null;
}

/** Whether the workspace's 💬 Chatbot seat is ready to show a character in the 3D office. Not a prerequisite for enabling Oficina Virtual itself — see selectOfficeRequirements, which deliberately omits it. */
export function isChatbotChannelReady(snapshot: WorkspaceCapabilitySnapshot): boolean {
  return channelReady(snapshot.chatbot) && snapshot.chatbot.provider !== null;
}

export function selectOfficeRequirements(snapshot: WorkspaceCapabilitySnapshot): OfficeRequirement[] {
  const whatsappReady = isWhatsAppChannelReady(snapshot);
  const voiceReady = isVoiceChannelReady(snapshot);

  return [
    requirement(
      'whatsapp_agent',
      'Agente WhatsApp configurado y activo',
      whatsappReady,
      'Configura y selecciona el agente en el panel, conecta YCloud y actívalo desde la oficina.',
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
