import { z } from 'zod';
import type { FileCommand } from './types';

const Id = z.string().trim().min(1).max(300);
const Iso = z.string().refine((value) => /T/.test(value) && /(Z|[+-]\d{2}:\d{2})$/.test(value) && Number.isFinite(Date.parse(value)));
const AgentId = z.enum(['coordinator', 'lead-intake', 'strategy', 'proposal', 'operations', 'content', 'review-qa']);
const Actor = z.object({ actorId: Id, role: z.enum(['super_admin', 'workspace_admin', 'workspace_member', 'agent', 'system']), workspaceId: Id.nullable() }).strict();
const Access = z.object({ allAgents: z.boolean(), allowedAgentIds: z.array(AgentId).max(7) }).strict();
const Base = z.object({ commandId: Id, workspaceId: Id, actor: Actor, occurredAt: Iso });
const FileExisting = Base.extend({ documentId: Id, expectedRevision: z.number().int().positive() });
const FolderExisting = Base.extend({ folderId: Id, expectedRevision: z.number().int().positive() });

export const FileCommandSchema = z.discriminatedUnion('type', [
  Base.extend({ type: z.literal('folder.created'), folderId: Id, parentId: Id.nullable(), name: z.string().trim().min(1).max(160) }).strict(),
  FolderExisting.extend({ type: z.literal('folder.renamed'), name: z.string().trim().min(1).max(160) }).strict(),
  FolderExisting.extend({ type: z.literal('folder.deleted') }).strict(),
  Base.extend({
    type: z.literal('file.created'), documentId: Id, versionId: Id, folderId: Id.nullable(),
    name: z.string().trim().min(1).max(240), description: z.string().trim().max(5_000).optional(),
    source: z.enum(['upload', 'generated', 'manual']), sensitivity: z.enum(['normal', 'sensitive', 'restricted']), access: Access,
    filename: z.string().trim().min(1).max(255), mimeType: z.string().trim().min(1).max(200), sizeBytes: z.number().int().min(0).max(100 * 1024 * 1024),
  }).strict(),
  FileExisting.extend({ type: z.literal('file.upload_completed'), versionId: Id, storageKey: Id, checksum: Id }).strict(),
  FileExisting.extend({ type: z.literal('file.indexed'), versionId: Id, chunkCount: z.number().int().min(0).max(1_000_000) }).strict(),
  FileExisting.extend({ type: z.literal('file.failed'), versionId: Id, reason: z.string().trim().min(1).max(5_000) }).strict(),
  FileExisting.extend({ type: z.literal('file.version_created'), versionId: Id, filename: z.string().trim().min(1).max(255), mimeType: z.string().trim().min(1).max(200), sizeBytes: z.number().int().min(0).max(100 * 1024 * 1024) }).strict(),
  FileExisting.extend({ type: z.literal('file.access_updated'), sensitivity: z.enum(['normal', 'sensitive', 'restricted']), access: Access }).strict(),
  FileExisting.extend({ type: z.literal('file.moved'), folderId: Id.nullable() }).strict(),
  FileExisting.extend({ type: z.literal('file.deleted') }).strict(),
]);

export function validateFileCommand(input: unknown) {
  const parsed = FileCommandSchema.safeParse(input);
  if (parsed.success) return { success: true as const, command: parsed.data as FileCommand };
  return {
    success: false as const, error: 'invalid_file_command' as const,
    issues: parsed.error.issues.map((issue) => ({ path: issue.path.length ? issue.path.join('.') : '$', message: issue.message })),
  };
}
