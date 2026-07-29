import { z } from 'zod';
import { AgentIdSchema } from '../../schemas';
import type { OrchestratorCommand } from './types';

const Id = z.string().trim().min(1).max(300);
const Iso = z.string().refine((value) => /T/.test(value) && /(Z|[+-]\d{2}:\d{2})$/.test(value) && Number.isFinite(Date.parse(value)));
const Actor = z
  .object({
    actorId: Id,
    role: z.enum(['super_admin', 'workspace_admin', 'workspace_member', 'system']),
    workspaceId: Id.nullable(),
  })
  .strict();
const Base = z.object({ commandId: Id, workspaceId: Id, actor: Actor, occurredAt: Iso, expectedRevision: z.number().int().positive() });
const Model = z.string().trim().max(200).nullable();
const CostProfile = z.enum(['economy', 'balanced', 'premium']);
const Limit = z.number().int().positive().nullable();

// `.strict()` on every variant below means a payload carrying `apiKey`,
// `token`, `secret`, or any other unknown field is rejected outright — this
// contract cannot structurally carry a real credential, by construction.
export const OrchestratorCommandSchema = z.discriminatedUnion('type', [
  Base.extend({ type: z.literal('orchestrator.mode_selected'), mode: z.enum(['openrouter', 'hermes_telegram']) }).strict(),
  Base.extend({ type: z.literal('orchestrator.openrouter_config_updated'), model: Model }).strict(),
  Base.extend({
    type: z.literal('orchestrator.openrouter_model_policy_updated'),
    model: Model.optional(),
    fallbackModel: Model.optional(),
    costProfile: CostProfile.optional(),
    dailyRequestLimit: Limit.optional(),
    monthlyRequestLimit: Limit.optional(),
    allowPremiumModels: z.boolean().optional(),
  }).strict(),
  Base.extend({
    type: z.literal('orchestrator.openrouter_agent_override_updated'),
    agentId: AgentIdSchema,
    override: z
      .object({
        model: Model.optional(),
        fallbackModel: Model.optional(),
        costProfile: CostProfile.nullable().optional(),
        dailyRequestLimit: Limit.optional(),
        monthlyRequestLimit: Limit.optional(),
        allowPremiumModels: z.boolean().nullable().optional(),
      })
      .strict()
      .nullable(),
  }).strict(),
  Base.extend({
    type: z.literal('orchestrator.hermes_bot_updated'),
    botId: z.string().trim().max(200).nullable(),
  }).strict(),
  Base.extend({
    type: z.literal('orchestrator.backend_status_reported'),
    mode: z.enum(['openrouter', 'hermes_telegram']),
    status: z.enum(['not_configured', 'pending', 'connected', 'error']),
    statusDetail: z.string().trim().max(500).nullable(),
    hasSecret: z.boolean(),
    endpoint: z.string().trim().max(500).nullable().optional(),
    connectionId: z.string().trim().max(300).nullable().optional(),
  }).strict(),
]);

export function validateOrchestratorCommand(input: unknown) {
  const parsed = OrchestratorCommandSchema.safeParse(input);
  if (parsed.success) return { success: true as const, command: parsed.data as OrchestratorCommand };
  return {
    success: false as const,
    error: 'invalid_orchestrator_command' as const,
    issues: parsed.error.issues.map((issue) => ({ path: issue.path.length ? issue.path.join('.') : '$', message: issue.message })),
  };
}
