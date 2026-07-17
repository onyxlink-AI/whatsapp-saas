import { z } from 'zod';

// estructura/docs/agent-specs/review-qa-agent.md > "Required outputs"
export const QAIssueSchema = z.object({
  description: z.string(),
  severity: z.enum(['low', 'medium', 'high']),
});

export const QAResultSchema = z.object({
  pass: z.boolean(),
  issues: z.array(QAIssueSchema),
  recommendedFixes: z.array(z.string()),
  releaseRecommendation: z.string(),
});
export type QAResult = z.infer<typeof QAResultSchema>;
