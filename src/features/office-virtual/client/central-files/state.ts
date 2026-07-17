import type {
  CentralFileState, FileCommand, FileDocument, FileFolder, FileHistoryAction, FileHistoryEntry,
  FileMutationResult, FileVersion,
} from './types';

const MAX_HISTORY = 5_000;
const MAX_COMMANDS = 2_000;
const ADMIN_ROLES = new Set(['super_admin', 'workspace_admin']);

export function createCentralFileState(workspaceId: string): CentralFileState {
  return { workspaceId, documents: {}, versions: {}, folders: {}, history: [], processedCommandIds: [] };
}

function success(state: CentralFileState, document: FileDocument | null, folder: FileFolder | null, duplicate = false): FileMutationResult {
  return { success: true, state, document, folder, duplicate };
}

function commandEntity(command: FileCommand) {
  if (command.type === 'folder.created' || command.type === 'folder.renamed' || command.type === 'folder.deleted') {
    return { id: command.folderId, type: 'folder' as const };
  }
  return { id: command.documentId, type: 'file' as const };
}

function commandAction(command: FileCommand): FileHistoryAction {
  return command.type.replace('.', '_') as FileHistoryAction;
}

function append(
  state: CentralFileState,
  command: FileCommand,
  document: FileDocument | null,
  folder: FileFolder | null,
  version?: FileVersion,
): CentralFileState {
  const entity = commandEntity(command);
  const entry: FileHistoryEntry = {
    commandId: command.commandId, workspaceId: state.workspaceId, entityId: entity.id, entityType: entity.type,
    action: commandAction(command), actor: command.actor, occurredAt: command.occurredAt,
    revision: document?.revision ?? folder?.revision ?? 1,
    note: command.type === 'file.failed' ? command.reason.trim() : null,
  };
  return {
    ...state,
    documents: document ? { ...state.documents, [document.id]: document } : state.documents,
    folders: folder ? { ...state.folders, [folder.id]: folder } : state.folders,
    versions: version ? { ...state.versions, [version.id]: version } : state.versions,
    history: [...state.history, entry].slice(-MAX_HISTORY),
    processedCommandIds: [command.commandId, ...state.processedCommandIds].slice(0, MAX_COMMANDS),
  };
}

function folderExists(state: CentralFileState, folderId: string | null): boolean {
  return folderId === null || Boolean(state.folders[folderId] && !state.folders[folderId].deletedAt);
}

export function applyFileCommand(state: CentralFileState, command: FileCommand): FileMutationResult {
  if (command.workspaceId !== state.workspaceId) return { success: false, code: 'workspace_mismatch' };
  if (command.actor.role !== 'super_admin' && command.actor.workspaceId !== state.workspaceId) return { success: false, code: 'unauthorized' };
  if (!ADMIN_ROLES.has(command.actor.role)) return { success: false, code: 'unauthorized' };
  if (state.processedCommandIds.includes(command.commandId)) {
    const entity = commandEntity(command);
    return entity.type === 'file'
      ? state.documents[entity.id] ? success(state, state.documents[entity.id], null, true) : { success: false, code: 'file_not_found' }
      : state.folders[entity.id] ? success(state, null, state.folders[entity.id], true) : { success: false, code: 'folder_not_found' };
  }

  if (command.type === 'folder.created') {
    if (state.folders[command.folderId]) return { success: false, code: 'folder_exists' };
    if (!folderExists(state, command.parentId)) return { success: false, code: 'folder_not_found' };
    const folder: FileFolder = {
      id: command.folderId, workspaceId: state.workspaceId, parentId: command.parentId, name: command.name.trim(),
      revision: 1, createdAt: command.occurredAt, createdBy: command.actor.actorId, updatedAt: command.occurredAt, deletedAt: null,
    };
    return success(append(state, command, null, folder), null, folder);
  }

  if (command.type === 'folder.renamed' || command.type === 'folder.deleted') {
    const current = state.folders[command.folderId];
    if (!current || current.deletedAt) return { success: false, code: 'folder_not_found' };
    if (current.revision !== command.expectedRevision) return { success: false, code: 'stale_revision' };
    if (command.type === 'folder.deleted') {
      const nonEmpty = Object.values(state.documents).some((document) => document.folderId === current.id && document.status !== 'deleted') ||
        Object.values(state.folders).some((folder) => folder.parentId === current.id && !folder.deletedAt);
      if (nonEmpty) return { success: false, code: 'folder_not_empty' };
    }
    const folder: FileFolder = command.type === 'folder.renamed'
      ? { ...current, name: command.name.trim(), revision: current.revision + 1, updatedAt: command.occurredAt }
      : { ...current, deletedAt: command.occurredAt, revision: current.revision + 1, updatedAt: command.occurredAt };
    return success(append(state, command, null, folder), null, folder);
  }

  if (command.type === 'file.created') {
    if (state.documents[command.documentId]) return { success: false, code: 'file_exists' };
    if (state.versions[command.versionId]) return { success: false, code: 'version_exists' };
    if (!folderExists(state, command.folderId)) return { success: false, code: 'folder_not_found' };
    const document: FileDocument = {
      id: command.documentId, workspaceId: state.workspaceId, folderId: command.folderId, name: command.name.trim(),
      description: command.description?.trim() ?? '', source: command.source, sensitivity: command.sensitivity,
      access: { allAgents: command.access.allAgents, allowedAgentIds: [...new Set(command.access.allowedAgentIds)] },
      status: 'uploading', currentVersionId: command.versionId, versionCount: 1, failureReason: null, revision: 1,
      createdAt: command.occurredAt, createdBy: command.actor.actorId, updatedAt: command.occurredAt, deletedAt: null,
    };
    const version: FileVersion = {
      id: command.versionId, documentId: document.id, workspaceId: state.workspaceId, version: 1,
      filename: command.filename, mimeType: command.mimeType, sizeBytes: command.sizeBytes, checksum: null,
      storageKey: null, status: 'uploading', chunkCount: null, createdAt: command.occurredAt, createdBy: command.actor.actorId,
    };
    return success(append(state, command, document, null, version), document, null);
  }

  const current = state.documents[command.documentId];
  if (!current || current.status === 'deleted') return { success: false, code: 'file_not_found' };
  if (current.revision !== command.expectedRevision) return { success: false, code: 'stale_revision' };
  let document: FileDocument | null = null;
  let version: FileVersion | undefined;

  if (command.type === 'file.upload_completed' && current.status === 'uploading' && current.currentVersionId === command.versionId) {
    const existing = state.versions[command.versionId];
    if (!existing) return { success: false, code: 'version_not_found' };
    version = { ...existing, status: 'stored', storageKey: command.storageKey, checksum: command.checksum };
    document = { ...current, status: 'processing', failureReason: null, revision: current.revision + 1, updatedAt: command.occurredAt };
  } else if (command.type === 'file.indexed' && current.status === 'processing' && current.currentVersionId === command.versionId) {
    const existing = state.versions[command.versionId];
    if (!existing || existing.status !== 'stored') return { success: false, code: 'version_not_found' };
    version = { ...existing, status: 'indexed', chunkCount: command.chunkCount };
    document = { ...current, status: 'available', failureReason: null, revision: current.revision + 1, updatedAt: command.occurredAt };
  } else if (command.type === 'file.failed' && ['uploading', 'processing'].includes(current.status) && current.currentVersionId === command.versionId) {
    const existing = state.versions[command.versionId];
    if (!existing) return { success: false, code: 'version_not_found' };
    version = { ...existing, status: 'failed' };
    document = { ...current, status: 'failed', failureReason: command.reason.trim(), revision: current.revision + 1, updatedAt: command.occurredAt };
  } else if (command.type === 'file.version_created' && ['available', 'failed'].includes(current.status)) {
    if (state.versions[command.versionId]) return { success: false, code: 'version_exists' };
    version = {
      id: command.versionId, documentId: current.id, workspaceId: state.workspaceId, version: current.versionCount + 1,
      filename: command.filename, mimeType: command.mimeType, sizeBytes: command.sizeBytes, checksum: null, storageKey: null,
      status: 'uploading', chunkCount: null, createdAt: command.occurredAt, createdBy: command.actor.actorId,
    };
    document = { ...current, status: 'uploading', currentVersionId: version.id, versionCount: version.version, failureReason: null, revision: current.revision + 1, updatedAt: command.occurredAt };
  } else if (command.type === 'file.access_updated') {
    document = { ...current, sensitivity: command.sensitivity, access: { allAgents: command.access.allAgents, allowedAgentIds: [...new Set(command.access.allowedAgentIds)] }, revision: current.revision + 1, updatedAt: command.occurredAt };
  } else if (command.type === 'file.moved' && folderExists(state, command.folderId)) {
    document = { ...current, folderId: command.folderId, revision: current.revision + 1, updatedAt: command.occurredAt };
  } else if (command.type === 'file.deleted') {
    document = { ...current, status: 'deleted', deletedAt: command.occurredAt, revision: current.revision + 1, updatedAt: command.occurredAt };
  }
  if (!document) return { success: false, code: command.type === 'file.moved' ? 'folder_not_found' : 'invalid_transition' };
  return success(append(state, command, document, null, version), document, null);
}
