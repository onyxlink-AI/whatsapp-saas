import type { ChatbotProvider } from '@/features/chatbot/types';
import type { IntegrationHealth, WhatsAppAgentType, WorkspaceCapabilitySnapshot } from './types';

export type SaasWorkspaceCapabilityRow = {
  id: string;
  whatsapp_agent_enabled: boolean;
  office_whatsapp_enabled: boolean;
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
  configured: boolean;
};

export type SaasIntegrationHealthSignal = {
  health: IntegrationHealth;
  checkedAt?: string;
  issueCode?: string;
};

/** The Chatbot's own live eligibility/state — computed the same way getChatbotRuntimeConfig computes it, never cached. */
export type SaasChatbotRow = {
  configured: boolean;
  enabled: boolean;
  provider: ChatbotProvider | null;
};

export type SaasWorkspaceCapabilityInput = {
  workspace: SaasWorkspaceCapabilityRow;
  activeWhatsappAgent: SaasActiveAgentRow | null;
  ycloudIntegration: SaasYCloudIntegrationRow | null;
  ycloudHealth: SaasIntegrationHealthSignal;
  voiceHealth: SaasIntegrationHealthSignal;
  chatbot: SaasChatbotRow | null;
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
      officeEnabled: workspace.office_whatsapp_enabled,
      activeAgentId: activeAgent?.id ?? null,
      activeAgentType: activeAgent?.type ?? null,
    },
    ycloud: {
      configured: ycloudIntegration?.configured === true,
      enabled: ycloudIntegration?.enabled === true,
      ...input.ycloudHealth,
    },
    voice: {
      configured: voiceConfigured,
      enabled: voiceConfigured,
      assistantId: workspace.vapi_assistant_id,
      ...input.voiceHealth,
    },
    chatbot: {
      configured: input.chatbot?.configured === true,
      // Live-recheck (e.g. WhatsApp mutual exclusion) already happened
      // server-side before this input was built — see capability-snapshot/route.ts.
      enabled: input.chatbot?.enabled === true,
      health: input.chatbot?.enabled ? 'healthy' : 'unknown',
      provider: input.chatbot?.provider ?? null,
    },
    features: {
      advancedMemory: workspace.advanced_memory_enabled,
      crossChannelMemory: workspace.cross_channel_memory_enabled,
      pipelineAi: workspace.pipeline_ai_enabled,
      coldLeadRecovery: workspace.cold_lead_recovery_enabled,
    },
  };
}
