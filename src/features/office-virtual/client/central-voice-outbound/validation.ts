import { z } from 'zod';
import type { AppointmentReminderRequest, VoiceOutboundCommand, VoiceProviderResult } from './types';

const Id = z.string().trim().min(1).max(300);
const Iso = z.string().datetime({ offset: true });
const TimeZone = z.string().trim().min(1).max(100).refine((value) => {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value }).format(new Date());
    return true;
  } catch {
    return false;
  }
}, 'Invalid IANA time zone');

const Actor = z.object({
  actorId: Id,
  role: z.enum(['super_admin', 'workspace_admin', 'system']),
  workspaceId: Id.nullable(),
}).strict();

const Policy = z.object({
  enabled: z.boolean(),
  allowedPurposes: z.array(z.literal('appointment_reminder')).min(1).max(1),
  allowedRequesterRoles: z.array(z.enum(['workspace_owner', 'workspace_admin', 'workspace_member'])).min(1).max(3),
  authorizedPrincipalIds: z.array(Id).max(20),
  timeZone: TimeZone,
  callingWindow: z.object({
    startHour: z.number().int().min(0).max(23),
    endHour: z.number().int().min(1).max(24),
  }).strict().refine((window) => window.startHour < window.endHour, 'Calling window must have a positive duration'),
  maxAttempts: z.number().int().min(1).max(3),
}).strict();

const Binding = z.object({
  assistantId: Id.nullable(),
  phoneNumberId: Id.nullable(),
  hasApiKey: z.boolean(),
  status: z.enum(['not_configured', 'pending', 'ready', 'error']),
  statusDetail: z.string().trim().max(500).nullable(),
  checkedAt: Iso.nullable(),
}).strict();

const Base = z.object({
  commandId: Id,
  workspaceId: Id,
  expectedRevision: z.number().int().positive(),
  actor: Actor,
  occurredAt: Iso,
});

export const VoiceOutboundCommandSchema = z.discriminatedUnion('type', [
  Base.extend({ type: z.literal('voice_outbound.policy_updated'), policy: Policy }).strict(),
  Base.extend({ type: z.literal('voice_outbound.vapi_binding_reported'), binding: Binding }).strict(),
]);

export const AppointmentReminderRequestSchema = z.object({
  requestId: Id,
  workspaceId: Id,
  telegramConversationId: Id,
  contactId: Id,
  appointmentId: Id,
  occurredAt: Iso,
}).strict();

export const VoiceProviderResultSchema = z.object({
  eventId: Id,
  workspaceId: Id,
  jobId: Id,
  providerCallId: Id,
  status: z.enum(['submitted', 'calling', 'completed', 'no_answer', 'failed', 'cancelled']),
  occurredAt: Iso,
  summary: z.string().trim().max(4_000).optional(),
  failureReason: z.string().trim().max(2_000).optional(),
}).strict();

function issues(error: z.ZodError) {
  return error.issues.map((issue) => ({
    path: issue.path.length ? issue.path.join('.') : '$',
    message: issue.message,
  }));
}

export function validateVoiceOutboundCommand(input: unknown) {
  const parsed = VoiceOutboundCommandSchema.safeParse(input);
  return parsed.success
    ? { success: true as const, command: parsed.data as VoiceOutboundCommand }
    : { success: false as const, issues: issues(parsed.error) };
}

export function validateAppointmentReminderRequest(input: unknown) {
  const parsed = AppointmentReminderRequestSchema.safeParse(input);
  return parsed.success
    ? { success: true as const, request: parsed.data as AppointmentReminderRequest }
    : { success: false as const, issues: issues(parsed.error) };
}

export function validateVoiceProviderResult(input: unknown) {
  const parsed = VoiceProviderResultSchema.safeParse(input);
  return parsed.success
    ? { success: true as const, event: parsed.data as VoiceProviderResult }
    : { success: false as const, issues: issues(parsed.error) };
}
