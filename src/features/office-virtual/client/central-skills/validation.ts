import { z } from 'zod';
import type { SkillCommand } from './types';

const Id = z.string().trim().min(1).max(300);
const Iso = z.string().refine((value) => /T/.test(value) && /(Z|[+-]\d{2}:\d{2})$/.test(value) && Number.isFinite(Date.parse(value)));
const AgentId = z.enum(['coordinator', 'lead-intake', 'strategy', 'proposal', 'operations', 'content', 'review-qa']);
const EligibleAgentId = z.enum(['coordinator', 'proposal', 'operations', 'content', 'review-qa']);
const SpecialistAgentId = z.enum(['proposal', 'operations', 'content', 'review-qa']);
const Actor = z.object({ actorId: Id, role: z.enum(['super_admin', 'workspace_admin', 'workspace_member', 'agent', 'system']), workspaceId: Id.nullable(), agentId: AgentId.optional() }).strict();
const Trigger = z.object({ id: Id, type: z.enum(['keyword', 'event', 'schedule', 'manual']), description: z.string().trim().min(1).max(500) }).strict();
const Input = z.object({ id: Id, name: z.string().trim().min(1).max(300), description: z.string().trim().max(1_000), required: z.boolean() }).strict();
const Tool = z.object({ id: Id, name: z.string().trim().min(1).max(200), description: z.string().trim().max(1_000), allowed: z.boolean() }).strict();
const Step = z.object({ id: Id, order: z.number().int().min(1).max(100), title: z.string().trim().min(1).max(500), description: z.string().trim().max(2_000), toolId: Id.nullable() }).strict();
const Output = z.object({ id: Id, name: z.string().trim().min(1).max(300), description: z.string().trim().max(2_000) }).strict();
const Definition = z.object({
  objective: z.string().trim().min(1).max(2_000),
  triggers: z.array(Trigger).min(1).max(30), inputs: z.array(Input).max(30),
  steps: z.array(Step).min(1).max(60), tools: z.array(Tool).max(30), outputs: z.array(Output).min(1).max(30),
  approval: z.object({ policy: z.enum(['always', 'sensitive_only', 'never']), note: z.string().trim().max(2_000) }).strict(),
}).strict();
const Base = z.object({ commandId: Id, workspaceId: Id, actor: Actor, occurredAt: Iso });
const Existing = Base.extend({ skillId: Id, expectedRevision: z.number().int().positive() });
const Trace = z.array(z.object({ stepId: Id, label: z.string().trim().min(1).max(300), status: z.enum(['passed', 'failed', 'skipped']), detail: z.string().trim().max(2_000) }).strict()).min(1).max(100);

export const SkillCommandSchema = z.discriminatedUnion('type', [
  Base.extend({ type: z.literal('skill.candidate_created'), skillId: Id, name: z.string().trim().min(1).max(160), description: z.string().trim().max(2_000).optional(), ownerAgentId: SpecialistAgentId, definition: Definition, evidenceTaskIds: z.array(Id).min(3).max(100), detectedOccurrences: z.number().int().min(3).max(100_000) }).strict(),
  Base.extend({ type: z.literal('skill.created'), skillId: Id, name: z.string().trim().min(1).max(160), description: z.string().trim().max(2_000).optional(), risk: z.enum(['low', 'medium', 'high']), ownerAgentId: EligibleAgentId, assignedAgentIds: z.array(EligibleAgentId).min(1).max(5).optional(), definition: Definition }).strict(),
  Existing.extend({ type: z.literal('skill.updated'), patch: z.object({ name: z.string().trim().min(1).max(160).optional(), description: z.string().trim().max(2_000).optional(), risk: z.enum(['low', 'medium', 'high']).optional(), ownerAgentId: EligibleAgentId.optional(), definition: Definition.optional() }).strict() }).strict(),
  Existing.extend({ type: z.literal('skill.test_recorded'), testRunId: Id, status: z.enum(['passed', 'failed']), trace: Trace, durationMs: z.number().int().min(0).max(86_400_000), estimatedCostUsd: z.number().min(0).max(100_000) }).strict(),
  Existing.extend({ type: z.literal('skill.approved') }).strict(),
  Existing.extend({ type: z.literal('skill.published') }).strict(),
  Existing.extend({ type: z.literal('skill.paused'), reason: z.string().trim().max(2_000).optional() }).strict(),
  Existing.extend({ type: z.literal('skill.rejected'), reason: z.string().trim().min(1).max(2_000) }).strict(),
  Existing.extend({ type: z.literal('skill.archived'), reason: z.string().trim().max(2_000).optional() }).strict(),
  Existing.extend({ type: z.literal('skill.assignments_updated'), assignedAgentIds: z.array(EligibleAgentId).max(5) }).strict(),
  Existing.extend({ type: z.literal('skill.version_restored'), sourceVersion: z.number().int().positive() }).strict(),
  Existing.extend({ type: z.literal('skill.metrics_recorded'), successful: z.boolean(), durationMs: z.number().int().min(0).max(86_400_000), estimatedMinutesSaved: z.number().min(0).max(1_000_000), costUsd: z.number().min(0).max(100_000) }).strict(),
]);

export function validateSkillCommand(input: unknown) {
  const parsed = SkillCommandSchema.safeParse(input);
  if (parsed.success) return { success: true as const, command: parsed.data as SkillCommand };
  return { success: false as const, error: 'invalid_skill_command' as const, issues: parsed.error.issues.map((issue) => ({ path: issue.path.length ? issue.path.join('.') : '$', message: issue.message })) };
}
