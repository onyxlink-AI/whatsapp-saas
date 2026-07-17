export type WhatsAppAgentType = 'setter' | 'soporte' | 'agendamiento';

export type IntegrationHealth = 'unknown' | 'healthy' | 'degraded' | 'error';

export type ChannelIntegrationSnapshot = {
  configured: boolean;
  enabled: boolean;
  health: IntegrationHealth;
  checkedAt?: string;
  issueCode?: string;
};

export type WorkspaceCapabilitySnapshot = {
  workspaceId: string;
  capturedAt: string;
  virtualOfficeEnabled: boolean;
  whatsappAgent: {
    enabled: boolean;
    activeAgentId: string | null;
    activeAgentType: WhatsAppAgentType | null;
  };
  ycloud: ChannelIntegrationSnapshot;
  voice: ChannelIntegrationSnapshot & {
    assistantId: string | null;
  };
  features: {
    advancedMemory: boolean;
    crossChannelMemory: boolean;
    pipelineAi: boolean;
    coldLeadRecovery: boolean;
  };
};

export type OfficeRequirementId =
  | 'whatsapp_agent'
  | 'ycloud'
  | 'voice'
  | 'advanced_memory'
  | 'cross_channel_memory'
  | 'pipeline_ai'
  | 'cold_lead_recovery';

export type OfficeRequirement = {
  id: OfficeRequirementId;
  label: string;
  met: boolean;
  reason: string | null;
};

export type OfficeProvisioningState = 'not_ready' | 'ready_to_enable' | 'active' | 'misconfigured';

export type OfficeProvisioningReadiness = {
  workspaceId: string;
  state: OfficeProvisioningState;
  requirementsMet: number;
  requirementsTotal: number;
  canEnable: boolean;
  visibleToWorkspace: boolean;
  accessible: boolean;
  requirements: OfficeRequirement[];
  blockingRequirementIds: OfficeRequirementId[];
};

export type OfficeActorRole =
  | 'onyxlink_super_admin'
  | 'workspace_admin'
  | 'workspace_member';

export type OfficeViewer = {
  actorId: string;
  role: OfficeActorRole;
  workspaceId: string | null;
};

export type OfficeAccessReason =
  | 'super_admin_console'
  | 'workspace_active'
  | 'workspace_mismatch'
  | 'insufficient_role'
  | 'office_disabled'
  | 'office_misconfigured';

export type OfficeAccessDecision = {
  visible: boolean;
  accessible: boolean;
  reason: OfficeAccessReason;
};

export type OfficeActivationAction = 'enable' | 'disable';

export type OfficeActivationRequest = {
  requestId: string;
  workspaceId: string;
  action: OfficeActivationAction;
  expectedEnabled: boolean;
  requestedAt: string;
  actor: OfficeViewer;
};

export type OfficeActivationDecisionCode =
  | 'approved'
  | 'already_in_state'
  | 'unauthorized'
  | 'workspace_mismatch'
  | 'stale_state'
  | 'prerequisites_not_met';

export type OfficeActivationAuditRecord = {
  requestId: string;
  workspaceId: string;
  actorId: string;
  action: OfficeActivationAction;
  occurredAt: string;
  fromEnabled: boolean;
  toEnabled: boolean;
  blockingRequirementIds: OfficeRequirementId[];
};

export type OfficeActivationDecision = {
  allowed: boolean;
  code: OfficeActivationDecisionCode;
  nextEnabled: boolean;
  auditRecord: OfficeActivationAuditRecord | null;
};
