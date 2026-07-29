import type { AgentId } from '../../schemas';

export type FileStatus = 'uploading' | 'processing' | 'available' | 'failed' | 'deleted';
export type FileSensitivity = 'normal' | 'sensitive' | 'restricted';
export type FileSource = 'upload' | 'generated' | 'manual';
export type FileVersionStatus = 'uploading' | 'stored' | 'indexed' | 'failed';

export type FileActor = {
  actorId: string;
  role: 'super_admin' | 'workspace_admin' | 'workspace_member' | 'agent' | 'system';
  workspaceId: string | null;
};

export type FileAccess = {
  allAgents: boolean;
  allowedAgentIds: AgentId[];
};

export type FileVersion = {
  id: string;
  documentId: string;
  workspaceId: string;
  version: number;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  checksum: string | null;
  storageKey: string | null;
  status: FileVersionStatus;
  chunkCount: number | null;
  createdAt: string;
  createdBy: string;
};

export type FileDocument = {
  id: string;
  workspaceId: string;
  folderId: string | null;
  name: string;
  description: string;
  source: FileSource;
  sensitivity: FileSensitivity;
  access: FileAccess;
  status: FileStatus;
  currentVersionId: string;
  versionCount: number;
  failureReason: string | null;
  revision: number;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  deletedAt: string | null;
};

export type FileFolder = {
  id: string;
  workspaceId: string;
  parentId: string | null;
  name: string;
  revision: number;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  deletedAt: string | null;
};

export type FileHistoryAction =
  | 'folder_created' | 'folder_renamed' | 'folder_deleted'
  | 'file_created' | 'upload_completed' | 'indexed' | 'failed'
  | 'version_created' | 'access_updated' | 'moved' | 'deleted';

export type FileHistoryEntry = {
  commandId: string;
  workspaceId: string;
  entityId: string;
  entityType: 'file' | 'folder';
  action: FileHistoryAction;
  actor: FileActor;
  occurredAt: string;
  revision: number;
  note: string | null;
};

export type CentralFileState = {
  workspaceId: string;
  documents: Record<string, FileDocument>;
  versions: Record<string, FileVersion>;
  folders: Record<string, FileFolder>;
  history: FileHistoryEntry[];
  processedCommandIds: string[];
};

type CommandBase = { commandId: string; workspaceId: string; actor: FileActor; occurredAt: string };

export type FileCommand =
  | (CommandBase & { type: 'folder.created'; folderId: string; parentId: string | null; name: string })
  | (CommandBase & { type: 'folder.renamed'; folderId: string; expectedRevision: number; name: string })
  | (CommandBase & { type: 'folder.deleted'; folderId: string; expectedRevision: number })
  | (CommandBase & {
      type: 'file.created'; documentId: string; versionId: string; folderId: string | null; name: string;
      description?: string; source: FileSource; sensitivity: FileSensitivity; access: FileAccess;
      filename: string; mimeType: string; sizeBytes: number;
    })
  | (CommandBase & {
      type: 'file.upload_completed'; documentId: string; expectedRevision: number; versionId: string;
      storageKey: string; checksum: string;
    })
  | (CommandBase & {
      type: 'file.indexed'; documentId: string; expectedRevision: number; versionId: string; chunkCount: number;
    })
  | (CommandBase & { type: 'file.failed'; documentId: string; expectedRevision: number; versionId: string; reason: string })
  | (CommandBase & {
      type: 'file.version_created'; documentId: string; expectedRevision: number; versionId: string;
      filename: string; mimeType: string; sizeBytes: number;
    })
  | (CommandBase & { type: 'file.access_updated'; documentId: string; expectedRevision: number; sensitivity: FileSensitivity; access: FileAccess })
  | (CommandBase & { type: 'file.moved'; documentId: string; expectedRevision: number; folderId: string | null })
  | (CommandBase & { type: 'file.deleted'; documentId: string; expectedRevision: number });

export type FileMutationResult =
  | { success: true; state: CentralFileState; document: FileDocument | null; folder: FileFolder | null; duplicate: boolean }
  | {
      success: false;
      code: 'workspace_mismatch' | 'file_not_found' | 'file_exists' | 'folder_not_found' | 'folder_exists'
        | 'version_not_found' | 'version_exists' | 'stale_revision' | 'invalid_transition' | 'unauthorized' | 'folder_not_empty';
    };

export type FileUploadRequest = {
  workspaceId: string;
  documentId: string;
  versionId: string;
  objectKey: string;
  mimeType: string;
  sizeBytes: number;
};

export type FileIndexRequest = {
  workspaceId: string;
  documentId: string;
  versionId: string;
  storageKey: string;
  checksum: string;
  sensitivity: FileSensitivity;
  access: FileAccess;
};
