import { z } from 'zod';
import type { RoutineCommand, RoutineSchedule, RoutineTaskTemplate } from './types';

const IdentifierSchema = z.string().trim().min(1).max(300);
const IsoDateSchema = z.string().refine(
  (value) => /T/.test(value) && /(Z|[+-]\d{2}:\d{2})$/.test(value) && Number.isFinite(Date.parse(value)),
  'Expected a valid ISO-8601 timestamp with timezone',
);
const AgentIdSchema = z.enum(['coordinator', 'lead-intake', 'strategy', 'proposal', 'operations', 'content', 'review-qa']);
const ScheduleSchema: z.ZodType<RoutineSchedule> = z.object({
  kind: z.enum(['once', 'daily', 'weekly', 'monthly']),
  timezone: z.string().trim().min(1).max(100),
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  daysOfWeek: z.array(z.number().int().min(0).max(6)).max(7),
  dayOfMonth: z.number().int().min(1).max(31).nullable(),
  scheduledAt: IsoDateSchema.nullable(),
}).strict().superRefine((schedule, context) => {
  if (schedule.kind === 'once' && schedule.scheduledAt === null) {
    context.addIssue({ code: 'custom', path: ['scheduledAt'], message: 'One-time schedules need a timestamp.' });
  }
  if (schedule.kind === 'weekly' && schedule.daysOfWeek.length === 0) {
    context.addIssue({ code: 'custom', path: ['daysOfWeek'], message: 'Weekly schedules need at least one day.' });
  }
  if (schedule.kind === 'monthly' && schedule.dayOfMonth === null) {
    context.addIssue({ code: 'custom', path: ['dayOfMonth'], message: 'Monthly schedules need a day of month.' });
  }
});
const TaskTemplateSchema: z.ZodType<RoutineTaskTemplate> = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(5_000),
  priority: z.enum(['low', 'normal', 'high', 'urgent']),
  source: z.enum(['automation', 'routine']),
  requiresApproval: z.boolean(),
}).strict();
const ActorSchema = z.object({
  actorId: IdentifierSchema,
  role: z.enum(['super_admin', 'workspace_admin', 'workspace_member', 'agent', 'system']),
}).strict();
const BaseSchema = z.object({ commandId: IdentifierSchema, workspaceId: IdentifierSchema, actor: ActorSchema, occurredAt: IsoDateSchema });
const RoutineBaseSchema = BaseSchema.extend({ routineId: IdentifierSchema, expectedRevision: z.number().int().positive() });
const RunBaseSchema = BaseSchema.extend({ routineId: IdentifierSchema, runId: IdentifierSchema, expectedRunRevision: z.number().int().positive() });

export const RoutineCommandSchema = z.discriminatedUnion('type', [
  BaseSchema.extend({
    type: z.literal('routine.created'), routineId: IdentifierSchema, name: z.string().trim().min(1).max(160),
    description: z.string().trim().max(5_000).optional(), assignedAgentId: AgentIdSchema.nullable(),
    schedule: ScheduleSchema, taskTemplate: TaskTemplateSchema,
  }).strict(),
  RoutineBaseSchema.extend({
    type: z.literal('routine.updated'),
    patch: z.object({
      name: z.string().trim().min(1).max(160).optional(), description: z.string().trim().max(5_000).optional(),
      assignedAgentId: AgentIdSchema.nullable().optional(), schedule: ScheduleSchema.optional(), taskTemplate: TaskTemplateSchema.optional(),
    }).strict(),
    nextRunAt: IsoDateSchema.nullable().optional(),
  }).strict(),
  RoutineBaseSchema.extend({ type: z.literal('routine.activated'), nextRunAt: IsoDateSchema }).strict(),
  RoutineBaseSchema.extend({ type: z.literal('routine.paused') }).strict(),
  RoutineBaseSchema.extend({ type: z.literal('routine.archived') }).strict(),
  RoutineBaseSchema.extend({
    type: z.literal('routine.run_queued'), runId: IdentifierSchema, scheduledFor: IsoDateSchema, nextRunAt: IsoDateSchema.nullable(),
  }).strict(),
  RunBaseSchema.extend({ type: z.literal('routine.run_started') }).strict(),
  RunBaseSchema.extend({ type: z.literal('routine.run_completed'), taskId: IdentifierSchema.nullable() }).strict(),
  RunBaseSchema.extend({ type: z.literal('routine.run_failed'), error: z.string().trim().min(1).max(5_000) }).strict(),
  RunBaseSchema.extend({ type: z.literal('routine.run_cancelled'), reason: z.string().trim().max(5_000).optional() }).strict(),
]);

export type RoutineValidationResult =
  | { success: true; command: RoutineCommand }
  | { success: false; error: 'invalid_routine_command'; issues: { path: string; message: string }[] };

export function validateRoutineCommand(input: unknown): RoutineValidationResult {
  const parsed = RoutineCommandSchema.safeParse(input);
  if (parsed.success) return { success: true, command: parsed.data as RoutineCommand };
  return {
    success: false,
    error: 'invalid_routine_command',
    issues: parsed.error.issues.map((issue) => ({ path: issue.path.length ? issue.path.join('.') : '$', message: issue.message })),
  };
}
