import { z } from 'zod';

// The 7 roles from estructura/docs/agent-specs/*.md. Ids are kebab-case and
// match each spec file's slug so the office, the runners and the docs all
// point at the same vocabulary.
export const AgentIdSchema = z.enum([
  'coordinator',
  'lead-intake',
  'strategy',
  'proposal',
  'operations',
  'content',
  'review-qa',
]);
export type AgentId = z.infer<typeof AgentIdSchema>;

// estructura/docs/architecture.md > "Suggested stages"
export const StageSchema = z.enum([
  'new_lead',
  'qualified',
  'strategy_drafted',
  'proposal_ready',
  'awaiting_approval',
  'ops_ready',
  'in_execution',
  'qa_review',
  'completed',
  'blocked',
]);
export type Stage = z.infer<typeof StageSchema>;

// estructura/CLAUDE.md > "Approval policy", plus our own workflow gate for
// the proposal -> ops transition (estructura/docs/workflows/lead-to-proposal.md,
// step 6: "Human approves before sending").
export const GatedActionSchema = z.enum([
  'send_email',
  'send_whatsapp',
  'crm_mutation',
  'destructive_delete',
  'external_publish',
  'billing',
  'advance_to_ops',
]);
export type GatedAction = z.infer<typeof GatedActionSchema>;

export const TraceEventSchema = z.object({
  id: z.string(),
  runId: z.string(),
  timestamp: z.number(),
  agentId: AgentIdSchema,
  promptVersion: z.string(),
  input: z.unknown(),
  output: z.unknown(),
  elapsedMs: z.number(),
  result: z.enum(['ok', 'error']),
  reason: z.string().optional(),
});
export type TraceEvent = z.infer<typeof TraceEventSchema>;

export const ApprovalRequestSchema = z.object({
  id: z.string(),
  runId: z.string(),
  action: GatedActionSchema,
  description: z.string(),
  status: z.enum(['pending', 'approved', 'rejected']),
  requestedAt: z.number(),
  decidedAt: z.number().optional(),
});
export type ApprovalRequest = z.infer<typeof ApprovalRequestSchema>;

export const WorkflowRunSchema = z.object({
  id: z.string(),
  stage: StageSchema,
  createdAt: z.number(),
  updatedAt: z.number(),
  // artifacts accumulate as agents complete their step; kept loose (unknown)
  // here because each one is validated against its own schema when written.
  artifacts: z.object({
    lead: z.unknown().optional(),
    strategy: z.unknown().optional(),
    proposal: z.unknown().optional(),
    operations: z.unknown().optional(),
    content: z.unknown().optional(),
    qa: z.unknown().optional(),
  }),
  history: z.array(TraceEventSchema),
  pendingApproval: ApprovalRequestSchema.optional(),
});
export type WorkflowRun = z.infer<typeof WorkflowRunSchema>;
