import { z } from 'zod';

// estructura/docs/agent-specs/proposal-agent.md > "Required outputs"
// Rule: "maintenance must be explicit" -> recurringMaintenancePrice is required, not optional.
export const ProposalDraftSchema = z.object({
  offerSummary: z.string(),
  scope: z.array(z.string()),
  exclusions: z.array(z.string()),
  timeline: z.string(),
  oneOffPrice: z.number().nonnegative(),
  recurringMaintenancePrice: z.number().nonnegative(),
  nextSteps: z.array(z.string()),
});
export type ProposalDraft = z.infer<typeof ProposalDraftSchema>;
