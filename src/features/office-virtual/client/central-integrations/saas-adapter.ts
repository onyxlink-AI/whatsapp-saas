import type { IntegrationHealth, WhatsAppAgentType, WorkspaceCapabilitySnapshot } from './types';

export type SaasWorkspaceCapabilityRow = {
  id: string;
  whatsapp_agent_enabled: boolean;
  vapi_assistant_id: string | null;
  advanced_memory_enabled: boolean;
  cross_channel_memory_enabled: boolean;
  pipeline_ai_enabled: boolean;
  cold_lead_recovery_enabled: boolean;
  /** Future add-on column. Missing/null must behave as disabled. */
  virtual_office_enabled?: boolean | null;
};

export type SaasActiveAgentRow = {
  id: string;
  type: WhatsAppAgentType;
  is_active: boolean;
};

export type SaasYCloudIntegrationRow = {
  provider: 'ycloud';
  enabled: boolean;
};

export type SaasIntegrationHealthSignal = {
  health: IntegrationHealth;
  checkedAt?: string;
  issueCode?: string;
};

export type SaasWorkspaceCapabilityInput = {
  workspace: SaasWorkspaceCapabilityRow;
  activeWhatsappAgent: SaasActiveAgentRow | null;
  ycloudIntegration: SaasYCloudIntegrationRow | null;
  ycloudHealth: SaasIntegrationHealthSignal;
  voiceHealth: SaasIntegrationHealthSignal;
  capturedAt: string;
};

/**
 * Maps sanitized SaaS rows to the office contract. Credentials and provider
 * payloads are intentionally absent from every accepted input type.
 */
export function adaptSaasWorkspaceCapabilities(
  input: SaasWorkspaceCapabilityInput,
): WorkspaceCapabilitySnapshot {
  const { workspace, activeWhatsappAgent, ycloudIntegration } = input;
  const activeAgent = activeWhatsappAgent?.is_active ? activeWhatsappAgent : null;
  const voiceConfigured = workspace.vapi_assistant_id !== null;

  return {
    workspaceId: workspace.id,
    capturedAt: input.capturedAt,
    virtualOfficeEnabled: workspace.virtual_office_enabled === true,
    whatsappAgent: {
      enabled: workspace.whatsapp_agent_enabled,
      activeAgentId: activeAgent?.id ?? null,
      activeAgentType: activeAgent?.type ?? null,
    },
    ycloud: {
      configured: ycloudIntegration !== null,
      enabled: ycloudIntegration?.enabled === true,
      ...input.ycloudHealth,
    },
    voice: {
      configured: voiceConfigured,
      enabled: voiceConfigured,
      assistantId: workspace.vapi_assistant_id,
      ...input.voiceHealth,
    },
    features: {
      advancedMemory: workspace.advanced_memory_enabled,
      crossChannelMemory: workspace.cross_channel_memory_enabled,
      pipelineAi: workspace.pipeline_ai_enabled,
      coldLeadRecovery: workspace.cold_lead_recovery_enabled,
    },
  };
}
