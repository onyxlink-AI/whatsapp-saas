import { z } from 'zod';

// estructura/docs/agent-specs/strategy-agent.md > "Required outputs"
export const StrategyBriefSchema = z.object({
  recommendedSolution: z.string(),
  rationale: z.string(),
  stack: z.array(z.string()),
  risks: z.array(z.string()),
  prerequisites: z.array(z.string()),
  successCriteria: z.array(z.string()),
});
export type StrategyBrief = z.infer<typeof StrategyBriefSchema>;
