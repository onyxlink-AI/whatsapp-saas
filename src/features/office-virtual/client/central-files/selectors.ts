import type { AgentId } from '../../schemas';
import type { CentralFileState, FileDocument, FileIndexRequest, FileUploadRequest } from './types';

export function selectFiles(state: CentralFileState, folderId?: string | null): FileDocument[] {
  return Object.values(state.documents)
    .filter((document) => document.status !== 'deleted' && (folderId === undefined || document.folderId === folderId))
    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
}

export function selectFolders(state: CentralFileState, parentId?: string | null) {
  return Object.values(state.folders)
    .filter((folder) => !folder.deletedAt && (parentId === undefined || folder.parentId === parentId))
    .sort((a, b) => a.name.localeCompare(b.name, 'es'));
}

export function selectFileVersions(state: CentralFileState, documentId: string) {
  return Object.values(state.versions)
    .filter((version) => version.documentId === documentId)
    .sort((a, b) => b.version - a.version);
}

export function canAgentReadFile(document: FileDocument, agentId: AgentId): boolean {
  return document.status === 'available' && (document.access.allAgents || document.access.allowedAgentIds.includes(agentId));
}

export function createFileUploadRequest(state: CentralFileState, documentId: string): FileUploadRequest | null {
  const document = state.documents[documentId];
  if (!document || document.status !== 'uploading') return null;
  const version = state.versions[document.currentVersionId];
  if (!version || version.status !== 'uploading') return null;
  return {
    workspaceId: state.workspaceId, documentId, versionId: version.id,
    objectKey: `${state.workspaceId}/${documentId}/v${version.version}/${encodeURIComponent(version.filename)}`,
    mimeType: version.mimeType, sizeBytes: version.sizeBytes,
  };
}

export function createFileIndexRequest(state: CentralFileState, documentId: string): FileIndexRequest | null {
  const document = state.documents[documentId];
  if (!document || document.status !== 'processing') return null;
  const version = state.versions[document.currentVersionId];
  if (!version?.storageKey || !version.checksum || version.status !== 'stored') return null;
  return {
    workspaceId: state.workspaceId, documentId, versionId: version.id, storageKey: version.storageKey,
    checksum: version.checksum, sensitivity: document.sensitivity,
    access: { allAgents: document.access.allAgents, allowedAgentIds: [...document.access.allowedAgentIds] },
  };
}
