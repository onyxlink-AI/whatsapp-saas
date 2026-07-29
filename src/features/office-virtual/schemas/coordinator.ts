import { z } from 'zod';
import { AgentIdSchema } from './workflow';

// estructura/docs/agent-specs/coordinator.md > "Output"
// nextAgent is 'human' when a gated action is awaiting approval, or 'done'
// once the run has reached a terminal stage.
export const CoordinatorDecisionSchema = z.object({
  nextAgent: z.union([AgentIdSchema, z.literal('human'), z.literal('done')]),
  reason: z.string(),
  expectedSchema: z.string(),
  requiresApproval: z.boolean(),
});
export type CoordinatorDecision = z.infer<typeof CoordinatorDecisionSchema>;
