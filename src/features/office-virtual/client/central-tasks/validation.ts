import { z } from 'zod';
import type { TaskCommand } from './types';

const IdentifierSchema = z.string().trim().min(1).max(300);
const TextSchema = z.string().trim().min(1).max(5_000);
const IsoDateSchema = z.string().refine(
  (value) => /T/.test(value) && /(Z|[+-]\d{2}:\d{2})$/.test(value) && Number.isFinite(Date.parse(value)),
  'Expected a valid ISO-8601 timestamp with timezone',
);
const AgentIdSchema = z.enum(['coordinator', 'lead-intake', 'strategy', 'proposal', 'operations', 'content', 'review-qa']);
const PrioritySchema = z.enum(['low', 'normal', 'high', 'urgent']);
const SourceSchema = z.enum(['manual', 'whatsapp', 'voice', 'automation', 'routine']);
const ActorSchema = z.object({
  actorId: IdentifierSchema,
  role: z.enum(['super_admin', 'workspace_admin', 'workspace_member', 'agent', 'system']),
}).strict();

const BaseSchema = z.object({
  commandId: IdentifierSchema,
  workspaceId: IdentifierSchema,
  actor: ActorSchema,
  occurredAt: IsoDateSchema,
});
const ExistingSchema = BaseSchema.extend({
  taskId: IdentifierSchema,
  expectedRevision: z.number().int().positive(),
});
const TaskPatchSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().max(5_000).optional(),
  priority: PrioritySchema.optional(),
  assignedAgentId: AgentIdSchema.nullable().optional(),
  contactId: IdentifierSchema.nullable().optional(),
  dueAt: IsoDateSchema.nullable().optional(),
  source: SourceSchema.optional(),
  requiresApproval: z.boolean().optional(),
}).strict();

export const TaskCommandSchema = z.discriminatedUnion('type', [
  BaseSchema.extend({
    type: z.literal('task.created'),
    taskId: IdentifierSchema,
    title: z.string().trim().min(1).max(200),
    description: z.string().trim().max(5_000).optional(),
    priority: PrioritySchema.optional(),
    source: SourceSchema.optional(),
    assignedAgentId: AgentIdSchema.nullable().optional(),
    contactId: IdentifierSchema.nullable().optional(),
    dueAt: IsoDateSchema.nullable().optional(),
    requiresApproval: z.boolean().optional(),
  }).strict(),
  ExistingSchema.extend({ type: z.literal('task.updated'), patch: TaskPatchSchema }).strict(),
  ExistingSchema.extend({ type: z.literal('task.assigned'), assignedAgentId: AgentIdSchema.nullable() }).strict(),
  ExistingSchema.extend({ type: z.literal('task.started') }).strict(),
  ExistingSchema.extend({ type: z.literal('task.approval_requested'), reason: TextSchema }).strict(),
  ExistingSchema.extend({
    type: z.literal('task.approval_resolved'),
    decision: z.enum(['approved', 'rejected']),
    note: z.string().trim().max(5_000).optional(),
  }).strict(),
  ExistingSchema.extend({ type: z.literal('task.blocked'), reason: TextSchema }).strict(),
  ExistingSchema.extend({ type: z.literal('task.completed') }).strict(),
  ExistingSchema.extend({ type: z.literal('task.failed'), reason: TextSchema }).strict(),
  ExistingSchema.extend({ type: z.literal('task.cancelled'), reason: z.string().trim().max(5_000).optional() }).strict(),
  ExistingSchema.extend({ type: z.literal('task.reopened') }).strict(),
]);

export type TaskValidationIssue = { path: string; message: string };
export type TaskValidationResult =
  | { success: true; command: TaskCommand }
  | { success: false; error: 'invalid_task_command'; issues: TaskValidationIssue[] };

export function validateTaskCommand(input: unknown): TaskValidationResult {
  const parsed = TaskCommandSchema.safeParse(input);
  if (parsed.success) return { success: true, command: parsed.data as TaskCommand };
  return {
    success: false,
    error: 'invalid_task_command',
    issues: parsed.error.issues.map((issue) => ({
      path: issue.path.length > 0 ? issue.path.join('.') : '$',
      message: issue.message,
    })),
  };
}
