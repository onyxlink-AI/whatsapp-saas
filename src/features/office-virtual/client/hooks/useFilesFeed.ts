import { useMemo, useState } from 'react';
import type { AgentId } from '../../schemas';
import {
  applyFileCommand,
  createCentralFileState,
  selectFileVersions,
  selectFiles,
  selectFolders,
} from '../central-files';
import type {
  CentralFileState,
  FileAccess,
  FileActor,
  FileCommand,
  FileDocument,
  FileFolder,
  FileSensitivity,
  FileVersion,
} from '../central-files';

export type FileUploadDraft = {
  name: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  folderId: string | null;
  sensitivity: FileSensitivity;
  allAgents: boolean;
  allowedAgentIds: AgentId[];
};

export type FilesFeed = {
  state: CentralFileState;
  files: FileDocument[];
  folders: FileFolder[];
  currentFolderId: string | null;
  setCurrentFolderId: (folderId: string | null) => void;
  loading: boolean;
  error: string | null;
  uploadFiles: (drafts: FileUploadDraft[]) => string[];
  createFolder: (name: string, parentId?: string | null) => string | null;
  renameFolder: (folderId: string, name: string) => void;
  deleteFolder: (folderId: string) => void;
  moveFile: (documentId: string, folderId: string | null) => void;
  updateAccess: (documentId: string, sensitivity: FileSensitivity, access: FileAccess) => void;
  createVersion: (documentId: string, filename: string, mimeType: string, sizeBytes: number) => void;
  retryFile: (documentId: string) => void;
  deleteFile: (documentId: string) => void;
  getVersions: (documentId: string) => FileVersion[];
};

function applyOrKeep(state: CentralFileState, command: FileCommand): CentralFileState {
  const result = applyFileCommand(state, command);
  return result.success ? result.state : state;
}

function createFileCommands(
  state: CentralFileState,
  actor: FileActor,
  input: FileUploadDraft,
  documentId: string,
  versionId: string,
  finish: 'available' | 'processing' | 'failed' | 'uploading',
): CentralFileState {
  const now = new Date().toISOString();
  let next = applyOrKeep(state, {
    type: 'file.created', commandId: `create:${documentId}`, documentId, versionId, workspaceId: state.workspaceId,
    actor, occurredAt: now, folderId: input.folderId, name: input.name, source: 'upload',
    sensitivity: input.sensitivity, access: { allAgents: input.allAgents, allowedAgentIds: input.allowedAgentIds },
    filename: input.filename, mimeType: input.mimeType, sizeBytes: input.sizeBytes,
  });
  if (finish === 'uploading') return next;
  if (finish === 'failed') return applyOrKeep(next, {
    type: 'file.failed', commandId: `fail:${documentId}`, documentId, versionId, workspaceId: state.workspaceId,
    expectedRevision: 1, actor, occurredAt: now, reason: 'No se pudo procesar el documento.',
  });
  next = applyOrKeep(next, {
    type: 'file.upload_completed', commandId: `stored:${documentId}`, documentId, versionId, workspaceId: state.workspaceId,
    expectedRevision: 1, actor, occurredAt: now, storageKey: `${state.workspaceId}/${documentId}/${input.filename}`,
    checksum: `demo-${documentId}`,
  });
  if (finish === 'processing') return next;
  return applyOrKeep(next, {
    type: 'file.indexed', commandId: `indexed:${documentId}`, documentId, versionId, workspaceId: state.workspaceId,
    expectedRevision: 2, actor, occurredAt: now, chunkCount: Math.max(1, Math.ceil(input.sizeBytes / 4_000)),
  });
}

/** Exported for isolation tests — verifies fixtures come back scoped to the given workspace/actor, not a shared demo constant. */
export function seedFilesState(workspaceId: string, actor: FileActor): CentralFileState {
  let state = createCentralFileState(workspaceId);
  state = applyOrKeep(state, {
    type: 'folder.created', commandId: 'folder-create-commercial', folderId: 'folder-commercial', parentId: null,
    workspaceId, actor, occurredAt: '2026-07-16T08:00:00.000Z', name: 'Comercial',
  });
  state = applyOrKeep(state, {
    type: 'folder.created', commandId: 'folder-create-operations', folderId: 'folder-operations', parentId: null,
    workspaceId, actor, occurredAt: '2026-07-16T08:01:00.000Z', name: 'Operaciones',
  });
  state = createFileCommands(state, actor, {
    name: 'Catálogo de servicios', filename: 'catalogo-servicios.pdf', mimeType: 'application/pdf', sizeBytes: 820_000,
    folderId: 'folder-commercial', sensitivity: 'normal', allAgents: true, allowedAgentIds: [],
  }, 'file-catalog', 'version-catalog-1', 'available');
  state = createFileCommands(state, actor, {
    name: 'Política de descuentos', filename: 'politica-descuentos.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', sizeBytes: 145_000,
    folderId: 'folder-commercial', sensitivity: 'sensitive', allAgents: false, allowedAgentIds: ['coordinator', 'proposal'],
  }, 'file-discounts', 'version-discounts-1', 'processing');
  return createFileCommands(state, actor, {
    name: 'Procedimiento interno', filename: 'procedimiento-interno.pdf', mimeType: 'application/pdf', sizeBytes: 310_000,
    folderId: 'folder-operations', sensitivity: 'restricted', allAgents: false, allowedAgentIds: ['coordinator', 'operations'],
  }, 'file-procedure', 'version-procedure-1', 'failed');
}

export function useFilesFeed(workspaceId: string, actor: FileActor): FilesFeed {
  const [state, setState] = useState<CentralFileState>(() => seedFilesState(workspaceId, actor));
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const uploadFiles = (drafts: FileUploadDraft[]): string[] => {
    const validDrafts = drafts.filter((draft) => draft.name.trim() && draft.sizeBytes >= 0);
    const ids = validDrafts.map(() => crypto.randomUUID());
    setState((previous) => validDrafts.reduce((next, draft, index) => {
      return createFileCommands(next, actor, draft, ids[index], crypto.randomUUID(), 'available');
    }, previous));
    return ids;
  };

  const createFolder = (name: string, parentId = currentFolderId): string | null => {
    if (!name.trim()) return null;
    const folderId = crypto.randomUUID();
    setState((previous) => applyOrKeep(previous, {
      type: 'folder.created', commandId: crypto.randomUUID(), folderId, parentId, workspaceId: previous.workspaceId,
      actor, occurredAt: new Date().toISOString(), name,
    }));
    return folderId;
  };

  const renameFolder = (folderId: string, name: string) => setState((previous) => {
    const folder = previous.folders[folderId];
    if (!folder || !name.trim()) return previous;
    return applyOrKeep(previous, {
      type: 'folder.renamed', commandId: crypto.randomUUID(), folderId, workspaceId: previous.workspaceId,
      expectedRevision: folder.revision, actor, occurredAt: new Date().toISOString(), name,
    });
  });

  const deleteFolder = (folderId: string) => setState((previous) => {
    const folder = previous.folders[folderId];
    if (!folder) return previous;
    const result = applyFileCommand(previous, {
      type: 'folder.deleted', commandId: crypto.randomUUID(), folderId, workspaceId: previous.workspaceId,
      expectedRevision: folder.revision, actor, occurredAt: new Date().toISOString(),
    });
    if (!result.success) {
      setError(result.code === 'folder_not_empty' ? 'La carpeta debe estar vacía antes de eliminarla.' : result.code);
      return previous;
    }
    setError(null);
    return result.state;
  });

  const moveFile = (documentId: string, folderId: string | null) => setState((previous) => {
    const document = previous.documents[documentId];
    if (!document) return previous;
    return applyOrKeep(previous, {
      type: 'file.moved', commandId: crypto.randomUUID(), documentId, folderId, workspaceId: previous.workspaceId,
      expectedRevision: document.revision, actor, occurredAt: new Date().toISOString(),
    });
  });

  const updateAccess = (documentId: string, sensitivity: FileSensitivity, access: FileAccess) => setState((previous) => {
    const document = previous.documents[documentId];
    if (!document) return previous;
    return applyOrKeep(previous, {
      type: 'file.access_updated', commandId: crypto.randomUUID(), documentId, sensitivity, access,
      workspaceId: previous.workspaceId, expectedRevision: document.revision, actor, occurredAt: new Date().toISOString(),
    });
  });

  const createVersion = (documentId: string, filename: string, mimeType: string, sizeBytes: number) => setState((previous) => {
    const document = previous.documents[documentId];
    if (!document) return previous;
    const versionId = crypto.randomUUID();
    let next = applyOrKeep(previous, {
      type: 'file.version_created', commandId: crypto.randomUUID(), documentId, versionId, filename, mimeType, sizeBytes,
      workspaceId: previous.workspaceId, expectedRevision: document.revision, actor, occurredAt: new Date().toISOString(),
    });
    const uploading = next.documents[documentId];
    next = applyOrKeep(next, {
      type: 'file.upload_completed', commandId: crypto.randomUUID(), documentId, versionId, workspaceId: previous.workspaceId,
      expectedRevision: uploading.revision, actor, occurredAt: new Date().toISOString(),
      storageKey: `${previous.workspaceId}/${documentId}/${filename}`, checksum: `demo-${versionId}`,
    });
    return applyOrKeep(next, {
      type: 'file.indexed', commandId: crypto.randomUUID(), documentId, versionId, workspaceId: previous.workspaceId,
      expectedRevision: next.documents[documentId].revision, actor, occurredAt: new Date().toISOString(), chunkCount: Math.max(1, Math.ceil(sizeBytes / 4_000)),
    });
  });

  const retryFile = (documentId: string) => {
    const document = state.documents[documentId];
    const version = document ? state.versions[document.currentVersionId] : null;
    if (document && version) createVersion(documentId, version.filename, version.mimeType, version.sizeBytes);
  };

  const deleteFile = (documentId: string) => setState((previous) => {
    const document = previous.documents[documentId];
    if (!document) return previous;
    return applyOrKeep(previous, {
      type: 'file.deleted', commandId: crypto.randomUUID(), documentId, workspaceId: previous.workspaceId,
      expectedRevision: document.revision, actor, occurredAt: new Date().toISOString(),
    });
  });

  const files = useMemo(() => selectFiles(state, currentFolderId), [currentFolderId, state]);
  const folders = useMemo(() => selectFolders(state, currentFolderId), [currentFolderId, state]);
  return {
    state, files, folders, currentFolderId, setCurrentFolderId, loading: false, error,
    uploadFiles, createFolder, renameFolder, deleteFolder, moveFile, updateAccess, createVersion,
    retryFile, deleteFile, getVersions: (documentId) => selectFileVersions(state, documentId),
  };
}
