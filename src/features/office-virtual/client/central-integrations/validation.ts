import { z } from 'zod';
import type { WorkspaceCapabilitySnapshot } from './types';

const IdentifierSchema = z.string().trim().min(1).max(200);
const IsoDateSchema = z.string().datetime({ offset: true });

const ChannelIntegrationSnapshotSchema = z
  .object({
    configured: z.boolean(),
    enabled: z.boolean(),
    health: z.enum(['unknown', 'healthy', 'degraded', 'error']),
    checkedAt: IsoDateSchema.optional(),
    issueCode: z.string().trim().min(1).max(100).optional(),
  })
  .strict();

export const WorkspaceCapabilitySnapshotSchema: z.ZodType<WorkspaceCapabilitySnapshot> = z
  .object({
    workspaceId: IdentifierSchema,
    capturedAt: IsoDateSchema,
    virtualOfficeEnabled: z.boolean(),
    whatsappAgent: z
      .object({
        enabled: z.boolean(),
        activeAgentId: IdentifierSchema.nullable(),
        activeAgentType: z.enum(['setter', 'soporte', 'agendamiento']).nullable(),
      })
      .strict(),
    ycloud: ChannelIntegrationSnapshotSchema,
    voice: ChannelIntegrationSnapshotSchema.extend({
      assistantId: IdentifierSchema.nullable(),
    }).strict(),
    features: z
      .object({
        advancedMemory: z.boolean(),
        crossChannelMemory: z.boolean(),
        pipelineAi: z.boolean(),
        coldLeadRecovery: z.boolean(),
      })
      .strict(),
  })
  .strict();

export type CapabilityValidationResult =
  | { success: true; snapshot: WorkspaceCapabilitySnapshot }
  | { success: false; issues: { path: string; message: string }[] };

export function validateWorkspaceCapabilitySnapshot(input: unknown): CapabilityValidationResult {
  const parsed = WorkspaceCapabilitySnapshotSchema.safeParse(input);
  if (parsed.success) return { success: true, snapshot: parsed.data };
  return {
    success: false,
    issues: parsed.error.issues.map((issue) => ({
      path: issue.path.length > 0 ? issue.path.join('.') : '$',
      message: issue.message,
    })),
  };
}
