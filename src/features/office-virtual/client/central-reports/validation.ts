import { z } from 'zod';
import type { ReportCommand } from './types';

const IdentifierSchema = z.string().trim().min(1).max(300);
const IsoDateSchema = z.string().refine(
  (value) => /T/.test(value) && /(Z|[+-]\d{2}:\d{2})$/.test(value) && Number.isFinite(Date.parse(value)),
  'Expected a valid ISO-8601 timestamp with timezone',
);
const AgentIdSchema = z.enum(['coordinator', 'lead-intake', 'strategy', 'proposal', 'operations', 'content', 'review-qa']);
const ActorSchema = z.object({
  actorId: IdentifierSchema,
  role: z.enum(['super_admin', 'workspace_admin', 'workspace_member', 'system']),
  workspaceId: IdentifierSchema.nullable(),
}).strict();
const MetricSchema = z.object({
  id: IdentifierSchema,
  label: z.string().trim().min(1).max(200),
  value: z.number().finite(),
  unit: z.enum(['count', 'percent', 'milliseconds']),
}).strict();
const SectionSchema = z.object({
  id: IdentifierSchema,
  title: z.string().trim().min(1).max(200),
  columns: z.array(IdentifierSchema).max(50),
  rows: z.array(z.record(z.string(), z.union([z.string(), z.number().finite()]))).max(10_000),
}).strict();
const ContentSchema = z.object({
  analyticsGeneratedAt: IsoDateSchema,
  metrics: z.array(MetricSchema).max(200),
  sections: z.array(SectionSchema).max(100),
}).strict();
const BaseSchema = z.object({
  commandId: IdentifierSchema,
  workspaceId: IdentifierSchema,
  reportId: IdentifierSchema,
  actor: ActorSchema,
  occurredAt: IsoDateSchema,
});
const ExistingSchema = BaseSchema.extend({ expectedRevision: z.number().int().positive() });

export const ReportCommandSchema = z.discriminatedUnion('type', [
  BaseSchema.extend({
    type: z.literal('report.created'),
    title: z.string().trim().min(1).max(200),
    kind: z.enum(['overview', 'agents', 'channels', 'tasks', 'routines', 'approvals', 'incidents']),
    period: z.enum(['today', '24h', '7d', '30d']),
    agentIds: z.array(AgentIdSchema).max(7),
  }).strict(),
  ExistingSchema.extend({ type: z.literal('report.generation_started') }).strict(),
  ExistingSchema.extend({ type: z.literal('report.generated'), content: ContentSchema }).strict(),
  ExistingSchema.extend({ type: z.literal('report.failed'), reason: z.string().trim().min(1).max(5_000) }).strict(),
  ExistingSchema.extend({ type: z.literal('report.deleted') }).strict(),
]);

export type ReportValidationResult =
  | { success: true; command: ReportCommand }
  | { success: false; error: 'invalid_report_command'; issues: { path: string; message: string }[] };

export function validateReportCommand(input: unknown): ReportValidationResult {
  const parsed = ReportCommandSchema.safeParse(input);
  if (parsed.success) return { success: true, command: parsed.data as ReportCommand };
  return {
    success: false,
    error: 'invalid_report_command',
    issues: parsed.error.issues.map((issue) => ({ path: issue.path.length ? issue.path.join('.') : '$', message: issue.message })),
  };
}
