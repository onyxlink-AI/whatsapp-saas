import type {
  AppointmentCallSnapshot,
  AppointmentReminderRequest,
  QueueAppointmentReminderContext,
  QueueAppointmentReminderResult,
  VoiceCallJob,
  VoiceOutboundAuditEntry,
  VoiceOutboundCommand,
  VoiceOutboundMutationResult,
  VoiceOutboundReadiness,
  VoiceOutboundState,
  VoiceProviderResult,
} from './types';
import {
  validateAppointmentReminderRequest,
  validateVoiceOutboundCommand,
  validateVoiceProviderResult,
} from './validation';

const MAX_AUDIT = 2_000;
const MAX_PROCESSED = 2_000;
const ADMIN_ROLES = new Set(['super_admin', 'workspace_admin']);

export function createVoiceOutboundState(workspaceId: string): VoiceOutboundState {
  return {
    workspaceId,
    revision: 1,
    policy: {
      enabled: false,
      allowedPurposes: ['appointment_reminder'],
      allowedRequesterRoles: ['workspace_owner'],
      authorizedPrincipalIds: [],
      timeZone: 'Europe/Madrid',
      callingWindow: { startHour: 9, endHour: 20 },
      maxAttempts: 1,
    },
    vapi: {
      assistantId: null,
      phoneNumberId: null,
      hasApiKey: false,
      status: 'not_configured',
      statusDetail: null,
      checkedAt: null,
    },
    jobs: {},
    audit: [],
    processedCommandIds: [],
    processedProviderEventIds: [],
  };
}

function appendAudit(state: VoiceOutboundState, entry: VoiceOutboundAuditEntry): VoiceOutboundState {
  return { ...state, audit: [...state.audit, entry].slice(-MAX_AUDIT) };
}

export function applyVoiceOutboundCommand(
  state: VoiceOutboundState,
  input: unknown,
): VoiceOutboundMutationResult {
  const validated = validateVoiceOutboundCommand(input);
  if (!validated.success) {
    const code = (input as { type?: unknown } | null)?.type === 'voice_outbound.vapi_binding_reported'
      ? 'invalid_binding'
      : 'invalid_policy';
    return { success: false, code, issues: validated.issues };
  }
  const command: VoiceOutboundCommand = validated.command;
  if (command.workspaceId !== state.workspaceId) return { success: false, code: 'workspace_mismatch' };
  if (state.processedCommandIds.includes(command.commandId)) return { success: true, state, duplicate: true };
  if (command.expectedRevision !== state.revision) return { success: false, code: 'stale_revision' };

  if (command.type === 'voice_outbound.policy_updated') {
    if (!ADMIN_ROLES.has(command.actor.role) || (command.actor.role !== 'super_admin' && command.actor.workspaceId !== state.workspaceId)) {
      return { success: false, code: 'unauthorized' };
    }
  } else if (command.actor.role !== 'system' || command.actor.workspaceId !== state.workspaceId) {
    return { success: false, code: 'unauthorized' };
  }

  const next: VoiceOutboundState = {
    ...state,
    revision: state.revision + 1,
    policy: command.type === 'voice_outbound.policy_updated' ? command.policy : state.policy,
    vapi: command.type === 'voice_outbound.vapi_binding_reported' ? command.binding : state.vapi,
    processedCommandIds: [command.commandId, ...state.processedCommandIds].slice(0, MAX_PROCESSED),
  };
  const action = command.type === 'voice_outbound.policy_updated' ? 'policy_updated' : 'vapi_binding_reported';
  return {
    success: true,
    state: appendAudit(next, {
      id: command.commandId,
      workspaceId: state.workspaceId,
      action,
      actorId: command.actor.actorId,
      occurredAt: command.occurredAt,
      jobId: null,
      note: null,
    }),
    duplicate: false,
  };
}

export function selectVoiceOutboundReadiness(state: VoiceOutboundState): VoiceOutboundReadiness {
  const blockers: VoiceOutboundReadiness['blockers'] = [];
  if (!state.policy.enabled) blockers.push('policy_disabled');
  if (!state.policy.allowedRequesterRoles.includes('workspace_owner')) blockers.push('no_allowed_owner_role');
  if (!state.vapi.hasApiKey) blockers.push('vapi_api_key_missing');
  if (!state.vapi.assistantId) blockers.push('vapi_assistant_missing');
  if (!state.vapi.phoneNumberId) blockers.push('vapi_phone_number_missing');
  if (state.vapi.status !== 'ready') blockers.push('vapi_not_ready');
  return { ready: blockers.length === 0, blockers };
}

function hourInTimeZone(iso: string, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(iso));
  return Number(parts.find((part) => part.type === 'hour')?.value ?? -1);
}

function isE164(value: string): boolean {
  return /^\+[1-9]\d{7,14}$/.test(value);
}

function jobIdForRequest(requestId: string): string {
  return `voice-reminder:${requestId}`;
}

function contextMatches(
  request: AppointmentReminderRequest,
  appointment: AppointmentCallSnapshot,
): boolean {
  return request.workspaceId === appointment.workspaceId
    && request.contactId === appointment.contactId
    && request.appointmentId === appointment.appointmentId;
}

export function queueHermesAppointmentReminder(
  state: VoiceOutboundState,
  requestInput: unknown,
  context: QueueAppointmentReminderContext,
): QueueAppointmentReminderResult {
  const validated = validateAppointmentReminderRequest(requestInput);
  if (!validated.success) return { success: false, code: 'invalid_request', issues: validated.issues };
  const request = validated.request;
  const existing = state.jobs[jobIdForRequest(request.requestId)];
  if (existing) return { success: true, state, job: existing, duplicate: true };

  if (
    request.workspaceId !== state.workspaceId
    || context.orchestrator.workspaceId !== state.workspaceId
    || context.principal.workspaceId !== state.workspaceId
    || context.appointment.workspaceId !== state.workspaceId
  ) return { success: false, code: 'workspace_mismatch' };
  if (context.orchestrator.activeMode !== 'hermes_telegram') {
    return { success: false, code: 'orchestrator_not_hermes' };
  }
  if (context.orchestrator.hermesTelegram.status !== 'connected' || !context.orchestrator.hermesTelegram.hasSecret) {
    return { success: false, code: 'hermes_not_connected' };
  }
  if (!selectVoiceOutboundReadiness(state).ready) return { success: false, code: 'voice_not_ready' };
  if (!context.principal.telegramIdentityVerified) return { success: false, code: 'identity_not_verified' };
  if (!state.policy.allowedRequesterRoles.includes(context.principal.role)) {
    return { success: false, code: 'requester_not_authorized' };
  }
  if (state.policy.authorizedPrincipalIds.length > 0 && !state.policy.authorizedPrincipalIds.includes(context.principal.principalId)) {
    return { success: false, code: 'requester_not_authorized' };
  }
  if (!state.policy.allowedPurposes.includes('appointment_reminder')) {
    return { success: false, code: 'purpose_not_allowed' };
  }
  if (!contextMatches(request, context.appointment)) return { success: false, code: 'contact_mismatch' };
  if (!context.appointment.consent.outboundVoiceAllowed || !context.appointment.consent.capturedAt) {
    return { success: false, code: 'consent_required' };
  }
  if (!isE164(context.appointment.phoneE164)) return { success: false, code: 'invalid_phone_number' };
  if (Date.parse(context.appointment.appointmentAt) <= Date.parse(request.occurredAt)) {
    return { success: false, code: 'appointment_not_in_future' };
  }
  const hour = hourInTimeZone(request.occurredAt, state.policy.timeZone);
  if (hour < state.policy.callingWindow.startHour || hour >= state.policy.callingWindow.endHour) {
    return { success: false, code: 'outside_calling_window' };
  }

  const jobId = jobIdForRequest(request.requestId);
  const job: VoiceCallJob = {
    id: jobId,
    requestId: request.requestId,
    workspaceId: state.workspaceId,
    telegramConversationId: request.telegramConversationId,
    requestedByPrincipalId: context.principal.principalId,
    purpose: 'appointment_reminder',
    contactId: request.contactId,
    appointmentId: request.appointmentId,
    contactDisplayName: context.appointment.contactDisplayName,
    customerNumber: context.appointment.phoneE164,
    appointmentAt: context.appointment.appointmentAt,
    assistantId: state.vapi.assistantId!,
    phoneNumberId: state.vapi.phoneNumberId!,
    status: 'queued',
    attempts: 0,
    maxAttempts: state.policy.maxAttempts,
    providerCallId: null,
    resultSummary: null,
    failureReason: null,
    createdAt: request.occurredAt,
    updatedAt: request.occurredAt,
  };
  const next = appendAudit({ ...state, jobs: { ...state.jobs, [jobId]: job } }, {
    id: `voice-reminder-queued:${request.requestId}`,
    workspaceId: state.workspaceId,
    action: 'reminder_queued',
    actorId: context.principal.principalId,
    occurredAt: request.occurredAt,
    jobId,
    note: 'Recordatorio de cita preautorizado por un propietario verificado desde Hermes.',
  });
  return { success: true, state: next, job, duplicate: false };
}

export function recordVoiceProviderResult(
  state: VoiceOutboundState,
  eventInput: unknown,
): { success: true; state: VoiceOutboundState; job: VoiceCallJob; duplicate: boolean } | { success: false; code: 'invalid_event' | 'workspace_mismatch' | 'job_not_found' | 'invalid_transition' } {
  const validated = validateVoiceProviderResult(eventInput);
  if (!validated.success) return { success: false, code: 'invalid_event' };
  const event: VoiceProviderResult = validated.event;
  if (event.workspaceId !== state.workspaceId) return { success: false, code: 'workspace_mismatch' };
  const current = state.jobs[event.jobId];
  if (!current) return { success: false, code: 'job_not_found' };
  if (state.processedProviderEventIds.includes(event.eventId)) {
    return { success: true, state, job: current, duplicate: true };
  }
  const terminalStatuses = new Set(['completed', 'no_answer', 'failed', 'cancelled']);
  if (terminalStatuses.has(current.status) && event.status !== current.status) {
    return { success: false, code: 'invalid_transition' };
  }
  const nextJob: VoiceCallJob = {
    ...current,
    status: event.status,
    attempts: event.status === 'submitted' ? current.attempts + 1 : current.attempts,
    providerCallId: event.providerCallId,
    resultSummary: event.summary?.trim() || current.resultSummary,
    failureReason: event.failureReason?.trim() || null,
    updatedAt: event.occurredAt,
  };
  const next = appendAudit({
    ...state,
    jobs: { ...state.jobs, [current.id]: nextJob },
    processedProviderEventIds: [event.eventId, ...state.processedProviderEventIds].slice(0, MAX_PROCESSED),
  }, {
    id: event.eventId,
    workspaceId: state.workspaceId,
    action: 'provider_result_recorded',
    actorId: 'vapi-webhook',
    occurredAt: event.occurredAt,
    jobId: current.id,
    note: event.summary?.trim() || event.failureReason?.trim() || event.status,
  });
  return { success: true, state: next, job: nextJob, duplicate: false };
}
