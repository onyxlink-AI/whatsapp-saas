import { z } from 'zod';

// estructura/docs/agent-specs/lead-intake-agent.md > "Required outputs"
export const LeadBriefSchema = z.object({
  summary: z.string(),
  company: z.string(),
  niche: z.string(),
  channel: z.string(),
  painPoints: z.array(z.string()),
  urgency: z.enum(['low', 'medium', 'high']),
  confidence: z.number().min(0).max(1),
  missingInfo: z.array(z.string()),
});
export type LeadBrief = z.infer<typeof LeadBriefSchema>;
