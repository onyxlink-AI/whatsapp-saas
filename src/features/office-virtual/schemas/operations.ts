import { z } from 'zod';

// estructura/docs/agent-specs/operations-agent.md > "Required outputs"
export const OpsPhaseSchema = z.object({
  name: z.string(),
  description: z.string(),
});

export const OpsPlanSchema = z.object({
  phases: z.array(OpsPhaseSchema),
  milestones: z.array(z.string()),
  ownerSuggestions: z.array(z.string()),
  dependencies: z.array(z.string()),
  blockers: z.array(z.string()),
  deliveryChecklist: z.array(z.string()),
});
export type OpsPlan = z.infer<typeof OpsPlanSchema>;
