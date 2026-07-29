import { z } from 'zod';

// Every specialist agent placeholder accepts free text plus whatever the
// workflow already knows (e.g. the lead brief, when re-running strategy).
export const AgentInputSchema = z.object({
  text: z.string(),
  context: z.record(z.string(), z.unknown()).optional(),
});
export type AgentInput = z.infer<typeof AgentInputSchema>;
