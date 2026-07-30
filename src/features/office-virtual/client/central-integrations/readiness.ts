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

function provisioningState(enabled: boolean): OfficeProvisioningState {
  return enabled ? 'active' : 'ready_to_enable';
}

/**
 * Product decision (2026-07-30): the 7 requirements below are informational
 * only — they no longer gate whether a workspace can enable or access
 * Oficina Virtual. Earlier this required WhatsApp/Voice/every paid AI
 * add-on to be configured first, which made the office unreachable for any
 * client who only wants the office itself. The superadmin's Activación
 * switch (`snapshot.virtualOfficeEnabled`) is now the only real gate;
 * `requirements` still reports each item's real met/unmet state so the
 * Activación screen can keep showing "N/7 requisitos listos" as a status
 * hint, but `blockingRequirementIds` is always empty and never blocks
 * `canEnable`/`visibleToWorkspace`/`accessible` — see activation.ts and
 * access.ts, which key off those fields rather than `requirements` directly.
 */
export function selectOfficeProvisioningReadiness(
  snapshot: WorkspaceCapabilitySnapshot,
): OfficeProvisioningReadiness {
  const requirements = selectOfficeRequirements(snapshot);
  const unmetCount = requirements.filter((item) => !item.met).length;

  return {
    workspaceId: snapshot.workspaceId,
    state: provisioningState(snapshot.virtualOfficeEnabled),
    requirementsMet: requirements.length - unmetCount,
    requirementsTotal: requirements.length,
    canEnable: !snapshot.virtualOfficeEnabled,
    visibleToWorkspace: snapshot.virtualOfficeEnabled,
    accessible: snapshot.virtualOfficeEnabled,
    requirements,
    blockingRequirementIds: [],
  };
}
