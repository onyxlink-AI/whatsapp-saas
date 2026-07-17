import { z } from 'zod';
import { AgentIdSchema } from '../../schemas';
import {
  adaptApprovalActivity,
  adaptVoiceActivity,
  adaptWhatsAppActivity,
  adaptWorkflowActivity,
} from './adapters';
import type { OfficeActivityEvent } from './types';

const IdentifierSchema = z.string().trim().min(1).max(300);
const TitleSchema = z.string().trim().min(1).max(500);
const PayloadSchema = z.record(z.string(), z.unknown());
const IsoDateSchema = z.string().refine(
  (value) => /T/.test(value) && /(Z|[+-]\d{2}:\d{2})$/.test(value) && Number.isFinite(Date.parse(value)),
  'Expected a valid ISO-8601 timestamp with timezone',
);

const BaseAdapterInputSchema = z.object({
  eventId: IdentifierSchema,
  workspaceId: IdentifierSchema,
  occurredAt: IsoDateSchema,
  title: TitleSchema.optional(),
  payload: PayloadSchema.optional(),
});

export const WhatsAppActivityInputSchema = BaseAdapterInputSchema.extend({
  conversationId: IdentifierSchema,
  phase: z.enum(['received', 'routing', 'processing', 'responded', 'handoff', 'failed']),
  agentId: AgentIdSchema.optional(),
}).strict();

export const VoiceActivityInputSchema = BaseAdapterInputSchema.extend({
  callId: IdentifierSchema,
  phase: z.enum(['ringing', 'connected', 'tool_running', 'ended', 'failed']),
  agentId: AgentIdSchema.optional(),
}).strict();

export const WorkflowActivityInputSchema = BaseAdapterInputSchema.extend({
  runId: IdentifierSchema,
  phase: z.enum(['queued', 'started', 'completed', 'failed', 'blocked']),
  agentId: AgentIdSchema,
  entityType: z
    .enum(['contact', 'conversation', 'voice_call', 'deal', 'project', 'task', 'appointment', 'template'])
    .optional(),
  entityId: IdentifierSchema.optional(),
}).strict();

export const ApprovalActivityInputSchema = BaseAdapterInputSchema.extend({
  approvalId: IdentifierSchema,
  runId: IdentifierSchema.optional(),
  phase: z.enum(['requested', 'approved', 'rejected']),
  requestedByAgentId: AgentIdSchema.optional(),
}).strict();

export const OfficeActivityEventSchema: z.ZodType<OfficeActivityEvent> = z
  .object({
    id: IdentifierSchema,
    activityId: IdentifierSchema,
    workspaceId: IdentifierSchema,
    agentId: AgentIdSchema,
    status: z.enum(['queued', 'working', 'completed', 'failed', 'blocked', 'approval_required']),
    source: z.enum(['whatsapp', 'voice', 'manual', 'automation']),
    title: TitleSchema,
    occurredAt: IsoDateSchema,
    runId: IdentifierSchema.optional(),
    entityType: z
      .enum(['contact', 'conversation', 'voice_call', 'deal', 'project', 'task', 'appointment', 'template'])
      .optional(),
    entityId: IdentifierSchema.optional(),
    dedupeKey: IdentifierSchema.optional(),
    payload: PayloadSchema.optional(),
  })
  .strict();

export type OfficeValidationIssue = {
  path: string;
  message: string;
};

export type OfficeEventValidationResult =
  | { success: true; event: OfficeActivityEvent }
  | { success: false; error: 'invalid_payload'; issues: OfficeValidationIssue[] };

function invalidResult(error: z.ZodError): OfficeEventValidationResult {
  return {
    success: false,
    error: 'invalid_payload',
    issues: error.issues.map((issue) => ({
      path: issue.path.length > 0 ? issue.path.join('.') : '$',
      message: issue.message,
    })),
  };
}

export function validateOfficeActivityEvent(input: unknown): OfficeEventValidationResult {
  const parsed = OfficeActivityEventSchema.safeParse(input);
  return parsed.success ? { success: true, event: parsed.data } : invalidResult(parsed.error);
}

function validateAndAdapt<T>(
  schema: z.ZodType<T>,
  input: unknown,
  adapter: (value: T) => OfficeActivityEvent,
): OfficeEventValidationResult {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return invalidResult(parsed.error);
  return validateOfficeActivityEvent(adapter(parsed.data));
}

export function validateWhatsAppActivity(input: unknown): OfficeEventValidationResult {
  return validateAndAdapt(WhatsAppActivityInputSchema, input, adaptWhatsAppActivity);
}

export function validateVoiceActivity(input: unknown): OfficeEventValidationResult {
  return validateAndAdapt(VoiceActivityInputSchema, input, adaptVoiceActivity);
}

export function validateWorkflowActivity(input: unknown): OfficeEventValidationResult {
  return validateAndAdapt(WorkflowActivityInputSchema, input, adaptWorkflowActivity);
}

export function validateApprovalActivity(input: unknown): OfficeEventValidationResult {
  return validateAndAdapt(ApprovalActivityInputSchema, input, adaptApprovalActivity);
}

