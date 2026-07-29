import type { WorkspaceOrchestratorBinding } from '../central-orchestrator';

export type VoiceOutboundPurpose = 'appointment_reminder';
export type VoiceRequesterRole = 'workspace_owner' | 'workspace_admin' | 'workspace_member';
export type VoiceConnectionStatus = 'not_configured' | 'pending' | 'ready' | 'error';
export type VoiceCallJobStatus = 'queued' | 'submitted' | 'calling' | 'completed' | 'no_answer' | 'failed' | 'cancelled';

export type VoiceOutboundPolicy = {
  enabled: boolean;
  allowedPurposes: VoiceOutboundPurpose[];
  allowedRequesterRoles: VoiceRequesterRole[];
  authorizedPrincipalIds: string[];
  timeZone: string;
  callingWindow: { startHour: number; endHour: number };
  maxAttempts: number;
};

export type VapiOutboundBinding = {
  assistantId: string | null;
  phoneNumberId: string | null;
  hasApiKey: boolean;
  status: VoiceConnectionStatus;
  statusDetail: string | null;
  checkedAt: string | null;
};

export type VoiceOutboundActor = {
  actorId: string;
  role: 'super_admin' | 'workspace_admin' | 'system';
  workspaceId: string | null;
};

export type VoiceOutboundState = {
  workspaceId: string;
  revision: number;
  policy: VoiceOutboundPolicy;
  vapi: VapiOutboundBinding;
  jobs: Record<string, VoiceCallJob>;
  audit: VoiceOutboundAuditEntry[];
  processedCommandIds: string[];
  processedProviderEventIds: string[];
};

type VoiceCommandBase = {
  commandId: string;
  workspaceId: string;
  expectedRevision: number;
  actor: VoiceOutboundActor;
  occurredAt: string;
};

export type VoiceOutboundCommand =
  | (VoiceCommandBase & { type: 'voice_outbound.policy_updated'; policy: VoiceOutboundPolicy })
  | (VoiceCommandBase & { type: 'voice_outbound.vapi_binding_reported'; binding: VapiOutboundBinding });

export type VoiceOutboundAuditEntry = {
  id: string;
  workspaceId: string;
  action: 'policy_updated' | 'vapi_binding_reported' | 'reminder_queued' | 'provider_result_recorded';
  actorId: string;
  occurredAt: string;
  jobId: string | null;
  note: string | null;
};

export type VerifiedHermesPrincipal = {
  principalId: string;
  workspaceId: string;
  role: VoiceRequesterRole;
  telegramIdentityVerified: boolean;
};

export type AppointmentReminderRequest = {
  requestId: string;
  workspaceId: string;
  telegramConversationId: string;
  contactId: string;
  appointmentId: string;
  occurredAt: string;
};

export type VoiceConsentSnapshot = {
  outboundVoiceAllowed: boolean;
  capturedAt: string | null;
  source: 'appointment_booking' | 'contact_preferences' | 'manual_confirmation' | null;
};

export type AppointmentCallSnapshot = {
  workspaceId: string;
  contactId: string;
  appointmentId: string;
  contactDisplayName: string;
  phoneE164: string;
  appointmentAt: string;
  consent: VoiceConsentSnapshot;
};

export type VoiceCallJob = {
  id: string;
  requestId: string;
  workspaceId: string;
  telegramConversationId: string;
  requestedByPrincipalId: string;
  purpose: VoiceOutboundPurpose;
  contactId: string;
  appointmentId: string;
  contactDisplayName: string;
  customerNumber: string;
  appointmentAt: string;
  assistantId: string;
  phoneNumberId: string;
  status: VoiceCallJobStatus;
  attempts: number;
  maxAttempts: number;
  providerCallId: string | null;
  resultSummary: string | null;
  failureReason: string | null;
  createdAt: string;
  updatedAt: string;
};

export type VoiceOutboundReadiness = {
  ready: boolean;
  blockers: Array<
    | 'policy_disabled'
    | 'no_allowed_owner_role'
    | 'vapi_api_key_missing'
    | 'vapi_assistant_missing'
    | 'vapi_phone_number_missing'
    | 'vapi_not_ready'
  >;
};

export type VoiceOutboundMutationResult =
  | { success: true; state: VoiceOutboundState; duplicate: boolean }
  | {
      success: false;
      code: 'workspace_mismatch' | 'unauthorized' | 'stale_revision' | 'invalid_policy' | 'invalid_binding';
      issues?: { path: string; message: string }[];
    };

export type QueueAppointmentReminderResult =
  | { success: true; state: VoiceOutboundState; job: VoiceCallJob; duplicate: boolean }
  | {
      success: false;
      code:
        | 'invalid_request'
        | 'workspace_mismatch'
        | 'orchestrator_not_hermes'
        | 'hermes_not_connected'
        | 'voice_not_ready'
        | 'identity_not_verified'
        | 'requester_not_authorized'
        | 'purpose_not_allowed'
        | 'contact_mismatch'
        | 'consent_required'
        | 'invalid_phone_number'
        | 'appointment_not_in_future'
        | 'outside_calling_window';
      issues?: { path: string; message: string }[];
    };

export type QueueAppointmentReminderContext = {
  orchestrator: WorkspaceOrchestratorBinding;
  principal: VerifiedHermesPrincipal;
  appointment: AppointmentCallSnapshot;
};

export type VapiOutboundCallRequest = {
  assistantId: string;
  phoneNumberId: string;
  customer: { number: string; name: string };
  assistantOverrides: {
    variableValues: {
      purpose: VoiceOutboundPurpose;
      customerName: string;
      appointmentAt: string;
      contactId: string;
      appointmentId: string;
      voiceJobId: string;
    };
  };
  metadata: {
    workspaceId: string;
    voiceJobId: string;
    requestId: string;
    contactId: string;
    appointmentId: string;
  };
};

export type VoiceProviderResult = {
  eventId: string;
  workspaceId: string;
  jobId: string;
  providerCallId: string;
  status: 'submitted' | 'calling' | 'completed' | 'no_answer' | 'failed' | 'cancelled';
  occurredAt: string;
  summary?: string;
  failureReason?: string;
};
