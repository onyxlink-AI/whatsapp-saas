import { z } from 'zod';

// estructura/docs/agent-specs/content-agent.md > "Required outputs"
export const ContentAssetSchema = z.object({
  targetAudience: z.string(),
  angle: z.string(),
  draftAsset: z.string(),
  cta: z.string(),
  repurposingIdeas: z.array(z.string()),
});
export type ContentAsset = z.infer<typeof ContentAssetSchema>;
