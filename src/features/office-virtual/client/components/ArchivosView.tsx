import { useEffect, useMemo, useRef, useState } from 'react';
import { FolderOpen } from 'lucide-react';
import type { AgentId } from '../../schemas';
import { selectFiles } from '../central-files';
import type { FileAccess, FileDocument, FileFolder, FileSensitivity, FileStatus, FileVersion } from '../central-files';
import type { FilesFeed } from '../hooks/useFilesFeed';
import {
  FILE_KIND_TW,
  FILE_SENSITIVITY_LABEL_ES,
  FILE_SENSITIVITY_ORDER,
  FILE_SENSITIVITY_TW,
  FILE_STATUS_LABEL_ES,
  FILE_STATUS_TW,
  fileExtensionLabel,
  fileKind,
  formatBytes,
  isPreviewableKind,
} from '../lib/filesStyles';
import { relativeTime } from '../lib/relativeTime';
import type { Agent } from '../types';
import ViewHeader from './ui/ViewHeader';

// Presentational only — consumes Codex's real src/central-files +
// src/hooks/useFilesFeed.ts (FilesFeed) as-is. No reducer, fixtures or
// provisional contract live here. See COORDINACION_CLAUDE_CODEX.md.
//
// central-files stores document/version *metadata* only — there is no real
// byte storage yet ("contrato para almacenamiento e indexación futura" is
// still pending). So actual content preview only exists for files dropped
// in this browser tab during this session: uploadDroppedFiles() keeps a
// local (View-only) object-URL map keyed by document id, created straight
// from the dropped File before it's reduced to a plain metadata draft for
// the hook. Seeded/fixture files and anything from a previous session
// honestly show "no preview available" instead of a fake one.

type Props = {
  feed: FilesFeed;
  agents: Agent[];
};

const STATUS_FILTERS: FileStatus[] = ['uploading', 'processing', 'available', 'failed'];

function folderChain(folders: Record<string, FileFolder>, folderId: string | null): FileFolder[] {
  const chain: FileFolder[] = [];
  let current = folderId ? folders[folderId] : undefined;
  while (current) {
    chain.unshift(current);
    current = current.parentId ? folders[current.parentId] : undefined;
  }
  return chain;
}

function folderPathLabel(folders: Record<string, FileFolder>, folderId: string | null): string {
  const chain = folderChain(folders, folderId);
  return chain.length > 0 ? chain.map((f) => f.name).join(' / ') : 'Archivos (raíz)';
}

function KindBadge({ name }: { name: string }) {
  const kind = fileKind(name);
  return (
    <span className={`shrink-0 w-9 h-9 rounded-md border flex items-center justify-center text-[9px] font-bold ${FILE_KIND_TW[kind]}`}>
      {fileExtensionLabel(name)}
    </span>
  );
}

function StatusBadge({ status }: { status: FileStatus }) {
  const busy = status === 'uploading' || status === 'processing';
  return (
    <span className={`shrink-0 inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full border ${FILE_STATUS_TW[status]}`}>
      {busy && <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />}
      {FILE_STATUS_LABEL_ES[status]}
    </span>
  );
}

function FileCard({
  file,
  version,
  folderLabel,
  onOpen,
  onRetry,
}: {
  file: FileDocument;
  version: FileVersion | undefined;
  folderLabel?: string;
  onOpen: () => void;
  onRetry: () => void;
}) {
  // eslint-disable-next-line react-hooks/purity -- relative timestamps are meant to reflect wall-clock time at render.
  const now = Date.now();
  // The version's filename carries the real extension (e.g. "catalogo-servicios.pdf");
  // the document's own `name` is a human title (e.g. "Catálogo de servicios") that
  // often has no extension at all, so it can't drive kind/extension detection.
  const displayFilename = version?.filename ?? file.name;
  const accessLabel = file.access.allAgents
    ? 'Todos los agentes'
    : file.access.allowedAgentIds.length > 0
      ? `${file.access.allowedAgentIds.length} agente(s) autorizado(s)`
      : 'Sin agentes autorizados';

  return (
    <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.04] p-3 flex flex-col gap-2 transition-colors">
      <button onClick={onOpen} className="text-left flex items-start gap-2.5">
        <KindBadge name={displayFilename} />
        <div className="min-w-0 flex-1">
          <div className="text-sm text-white/90 truncate">{file.name}</div>
          <div className="text-[11px] text-white/40 truncate mt-0.5">
            {version ? formatBytes(version.sizeBytes) : '—'} · v{file.versionCount}
            {folderLabel ? ` · ${folderLabel}` : ''}
          </div>
        </div>
        <StatusBadge status={file.status} />
      </button>

      {file.status === 'failed' && (
        <div className="flex items-center justify-between gap-2">
          <p className="text-[11px] text-rose-300/70 line-clamp-1 flex-1">{file.failureReason ?? 'No se pudo procesar.'}</p>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onRetry();
            }}
            className="shrink-0 text-[11px] font-medium text-white/70 hover:text-white transition-colors"
          >
            Reintentar
          </button>
        </div>
      )}

      <div className="flex items-center justify-between text-[10px] text-white/30 mt-auto pt-1">
        <span className="truncate">{accessLabel}</span>
        <span className="shrink-0">{relativeTime(file.updatedAt, now)}</span>
      </div>
    </div>
  );
}

function FolderChip({
  folder,
  active,
  onOpen,
  onRename,
  onDelete,
}: {
  folder: FileFolder;
  active: boolean;
  onOpen: () => void;
  onRename: (name: string) => void;
  onDelete: () => void;
}) {
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState(folder.name);

  if (renaming) {
    return (
      <input
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            onRename(draft);
            setRenaming(false);
          }
          if (e.key === 'Escape') {
            setDraft(folder.name);
            setRenaming(false);
          }
        }}
        onBlur={() => {
          onRename(draft);
          setRenaming(false);
        }}
        className="onyx-input rounded-md px-2.5 py-1.5 text-[11px] w-36"
      />
    );
  }

  return (
    <div
      className={`group flex items-center gap-0.5 rounded-md border pl-2.5 pr-1 py-1 text-[11px] transition-colors ${
        active ? 'border-[#8AD3D2]/40 bg-[#83CFCE]/10 text-[#BFE7E6]' : 'border-white/10 text-white/60 hover:text-white/85'
      }`}
    >
      <button onClick={onOpen} className="flex items-center gap-1.5">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} className="w-3.5 h-3.5 shrink-0">
          <path d="M3 7h6l2 2h10v10H3z" />
        </svg>
        {folder.name}
      </button>
      <button
        onClick={() => setRenaming(true)}
        className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-white/10 transition-opacity"
        aria-label="Renombrar carpeta"
        title="Renombrar"
      >
        ✎
      </button>
      <button
        onClick={onDelete}
        className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-rose-500/20 text-rose-300/80 transition-opacity"
        aria-label="Eliminar carpeta"
        title="Eliminar (debe estar vacía)"
      >
        ✕
      </button>
    </div>
  );
}

function FilePreviewPanel({
  file,
  version,
  versions,
  folders,
  previewUrl,
  agents,
  onClose,
  onRetry,
  onDelete,
  onAddVersion,
  onUpdateAccess,
  onMove,
}: {
  file: FileDocument;
  version: FileVersion | undefined;
  versions: FileVersion[];
  folders: Record<string, FileFolder>;
  previewUrl: string | null;
  agents: Agent[];
  onClose: () => void;
  onRetry: () => void;
  onDelete: () => void;
  onAddVersion: (file: File) => void;
  onUpdateAccess: (sensitivity: FileSensitivity, access: FileAccess) => void;
  onMove: (folderId: string | null) => void;
}) {
  // eslint-disable-next-line react-hooks/purity -- relative timestamps are meant to reflect wall-clock time at render.
  const now = Date.now();
  const versionInputRef = useRef<HTMLInputElement | null>(null);
  // See FileCard's note: kind/extension must come from the version's real
  // filename, not the document's human title.
  const displayFilename = version?.filename ?? file.name;
  const kind = fileKind(displayFilename);
  const previewable = isPreviewableKind(kind) && previewUrl !== null;
  const allFolders = useMemo(
    () => Object.values(folders).filter((f) => !f.deletedAt).sort((a, b) => a.name.localeCompare(b.name, 'es')),
    [folders],
  );

  const toggleAllAgents = () => onUpdateAccess(file.sensitivity, { allAgents: !file.access.allAgents, allowedAgentIds: file.access.allowedAgentIds });
  const toggleAgent = (agentId: AgentId) => {
    const next = file.access.allowedAgentIds.includes(agentId)
      ? file.access.allowedAgentIds.filter((id) => id !== agentId)
      : [...file.access.allowedAgentIds, agentId];
    onUpdateAccess(file.sensitivity, { allAgents: false, allowedAgentIds: next });
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-start sm:items-center justify-center bg-black/70 backdrop-blur-sm p-3 sm:p-6 overflow-y-auto" onClick={onClose}>
      <div className="onyx-popover w-full max-w-2xl my-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 px-5 pt-5 pb-4 border-b border-white/[0.07]">
          <div className="min-w-0">
            <div className="text-[9px] uppercase tracking-[0.18em] text-[#A0DCDB]/60 mb-1">Archivo</div>
            <h3 className="text-white font-semibold text-lg leading-snug truncate">{file.name}</h3>
            <div className="flex flex-wrap items-center gap-1.5 mt-2">
              <StatusBadge status={file.status} />
              <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${FILE_SENSITIVITY_TW[file.sensitivity]}`}>
                {FILE_SENSITIVITY_LABEL_ES[file.sensitivity]}
              </span>
              <span className="text-[10px] text-white/35">{version ? formatBytes(version.sizeBytes) : '—'} · v{file.versionCount}</span>
            </div>
          </div>
          <button onClick={onClose} className="onyx-icon-button shrink-0 text-white/45 hover:text-white w-8 h-8 transition-colors" aria-label="Cerrar">
            ✕
          </button>
        </div>

        <div className="px-5 py-4 space-y-4 max-h-[70vh] overflow-y-auto">
          <div className="rounded-lg border border-white/[0.06] bg-black/20 flex items-center justify-center min-h-[150px] overflow-hidden">
            {previewable && kind === 'image' ? (
              // eslint-disable-next-line @next/next/no-img-element -- previewUrl is a client-only blob: object URL (URL.createObjectURL, revoked on cleanup below) from a local file read; next/image cannot fetch or optimize blob: URLs at all, so a plain <img> is the only correct option here.
              <img src={previewUrl ?? undefined} alt={file.name} className="max-h-64 w-full object-contain" />
            ) : previewable && kind === 'pdf' ? (
              <iframe src={previewUrl ?? undefined} title={file.name} className="w-full h-64 border-0" />
            ) : (
              <div className="text-center py-8 px-4">
                <div className={`inline-flex w-12 h-12 rounded-lg border items-center justify-center text-[10px] font-bold mb-2 ${FILE_KIND_TW[kind]}`}>
                  {fileExtensionLabel(displayFilename)}
                </div>
                <p className="text-xs text-white/30 max-w-xs">
                  {file.status === 'uploading' || file.status === 'processing'
                    ? 'La vista previa estará disponible cuando termine de procesarse.'
                    : 'Vista previa no disponible — todavía no hay almacenamiento real de contenido conectado.'}
                </p>
              </div>
            )}
          </div>

          {file.status === 'failed' && (
            <div className="rounded-lg border border-rose-500/25 bg-rose-500/[0.06] p-3">
              <p className="text-xs text-rose-300/85">{file.failureReason ?? 'No se pudo procesar el archivo.'}</p>
              <button onClick={onRetry} className="onyx-control text-[11px] font-medium text-white/80 px-3 py-1.5 mt-2 transition-colors">
                Reintentar
              </button>
            </div>
          )}

          {file.description && <p className="text-xs text-white/50 leading-relaxed">{file.description}</p>}

          <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3">
            <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/45 mb-2">Detalles</div>
            <div className="grid sm:grid-cols-2 gap-3 text-[11px]">
              <div>
                <div className="text-white/30 text-[10px] uppercase tracking-wide mb-0.5">Tipo</div>
                <div className="text-white/80">{version?.mimeType ?? 'Desconocido'}</div>
              </div>
              <div>
                <div className="text-white/30 text-[10px] uppercase tracking-wide mb-0.5">Creado</div>
                <div className="text-white/80">{relativeTime(file.createdAt, now)}</div>
              </div>
              <div>
                <div className="text-white/30 text-[10px] uppercase tracking-wide mb-0.5">Actualizado</div>
                <div className="text-white/80">{relativeTime(file.updatedAt, now)}</div>
              </div>
              <div>
                <div className="text-white/30 text-[10px] uppercase tracking-wide mb-1">Carpeta</div>
                <select
                  value={file.folderId ?? ''}
                  onChange={(e) => onMove(e.target.value || null)}
                  className="onyx-input rounded-md px-2 py-1.5 text-[11px] w-full"
                >
                  <option value="">Archivos (raíz)</option>
                  {allFolders.map((f) => (
                    <option key={f.id} value={f.id}>
                      {folderPathLabel(folders, f.id)}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3">
            <div className="flex items-center justify-between mb-2">
              <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/45">Versiones ({versions.length})</div>
              <button
                onClick={() => versionInputRef.current?.click()}
                className="onyx-control text-[11px] font-medium text-white/75 px-2.5 py-1 transition-colors"
              >
                Subir nueva versión
              </button>
              <input
                ref={versionInputRef}
                type="file"
                className="hidden"
                onChange={(e) => {
                  const picked = e.target.files?.[0];
                  if (picked) onAddVersion(picked);
                  e.target.value = '';
                }}
              />
            </div>
            {versions.length === 0 ? (
              <p className="text-xs text-white/30">Sin versiones todavía.</p>
            ) : (
              <ul className="space-y-1.5">
                {versions.map((v) => (
                  <li key={v.id} className="flex items-center gap-2 text-[11px] text-white/60">
                    <span className="shrink-0 font-medium text-white/75">v{v.version}</span>
                    <span className="truncate flex-1">{v.filename}</span>
                    <span className="shrink-0 text-white/35">{formatBytes(v.sizeBytes)}</span>
                    <span className="shrink-0 text-white/30">{relativeTime(v.createdAt, now)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3">
            <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/45 mb-2">Sensibilidad</div>
            <div className="flex flex-wrap gap-1.5 mb-3">
              {FILE_SENSITIVITY_ORDER.map((s) => (
                <button
                  key={s}
                  onClick={() => onUpdateAccess(s, file.access)}
                  className={`text-[11px] px-2.5 py-1 rounded-full border transition-colors ${
                    file.sensitivity === s ? FILE_SENSITIVITY_TW[s] : 'border-white/10 text-white/40 hover:text-white/70'
                  }`}
                >
                  {FILE_SENSITIVITY_LABEL_ES[s]}
                </button>
              ))}
            </div>

            <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/45 mb-2">Agentes autorizados</div>
            <div className="flex flex-wrap gap-1.5">
              <button
                onClick={toggleAllAgents}
                className={`text-[11px] px-2.5 py-1.5 rounded-md border transition-colors ${
                  file.access.allAgents ? 'border-[#8AD3D2]/40 bg-[#83CFCE]/10 text-[#BFE7E6]' : 'border-white/10 text-white/45 hover:text-white/70'
                }`}
              >
                Todos los agentes
              </button>
              {agents.map((a) => (
                <button
                  key={a.id}
                  disabled={file.access.allAgents}
                  onClick={() => toggleAgent(a.id)}
                  className={`text-[11px] px-2.5 py-1.5 rounded-md border transition-colors disabled:opacity-30 disabled:pointer-events-none ${
                    !file.access.allAgents && file.access.allowedAgentIds.includes(a.id)
                      ? 'border-[#8AD3D2]/40 bg-[#83CFCE]/10 text-[#BFE7E6]'
                      : 'border-white/10 text-white/45 hover:text-white/70'
                  }`}
                >
                  {a.name}
                </button>
              ))}
            </div>
          </div>

          <div className="flex justify-end pt-1">
            <button
              onClick={onDelete}
              className="text-[11px] font-medium px-3 py-1.5 rounded-md border border-rose-500/30 bg-rose-500/[0.08] text-rose-300/85 hover:bg-rose-500/[0.14] transition-colors"
            >
              Eliminar archivo
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ArchivosView({ feed, agents }: Props) {
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<FileStatus | 'all'>('all');
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [folderDraft, setFolderDraft] = useState('');
  const dragCounter = useRef(0);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  // State (not a ref) because the selected file's preview URL is read during
  // render (FilePreviewPanel's `previewUrl` prop) — a ref's `.current` must
  // never be read outside effects/handlers. A mirroring ref exists only for
  // the unmount cleanup below, which itself never runs during render.
  const [previewUrls, setPreviewUrls] = useState<Map<string, string>>(new Map());
  const previewUrlsForCleanupRef = useRef(previewUrls);

  useEffect(() => {
    previewUrlsForCleanupRef.current = previewUrls;
  }, [previewUrls]);

  useEffect(() => {
    return () => {
      for (const url of previewUrlsForCleanupRef.current.values()) URL.revokeObjectURL(url);
    };
  }, []);

  const trimmedQuery = query.trim().toLowerCase();
  const searching = trimmedQuery.length > 0;

  const scopedFiles = useMemo(() => {
    const source = searching ? selectFiles(feed.state, undefined) : feed.files;
    return source.filter((file) => {
      if (searching && !file.name.toLowerCase().includes(trimmedQuery)) return false;
      if (statusFilter !== 'all' && file.status !== statusFilter) return false;
      return true;
    });
  }, [feed.files, feed.state, searching, statusFilter, trimmedQuery]);

  const breadcrumb = useMemo(() => folderChain(feed.state.folders, feed.currentFolderId), [feed.state.folders, feed.currentFolderId]);
  const selectedFile = selectedFileId ? feed.state.documents[selectedFileId] ?? null : null;

  const registerPreview = (documentId: string, source: File) => {
    const kind = fileKind(source.name);
    if (!isPreviewableKind(kind)) return;
    setPreviewUrls((prev) => {
      const existing = prev.get(documentId);
      if (existing) URL.revokeObjectURL(existing);
      const next = new Map(prev);
      next.set(documentId, URL.createObjectURL(source));
      return next;
    });
  };

  const uploadDroppedFiles = (fileList: FileList | File[]) => {
    const incoming = Array.from(fileList).filter((file) => file.size > 0);
    if (incoming.length === 0) return;
    const drafts = incoming.map((file) => ({
      name: file.name,
      filename: file.name,
      mimeType: file.type || 'application/octet-stream',
      sizeBytes: file.size,
      folderId: feed.currentFolderId,
      sensitivity: 'normal' as FileSensitivity,
      allAgents: false,
      allowedAgentIds: [] as AgentId[],
    }));
    // uploadFiles() returns one id per accepted draft in the same order — all
    // drafts here are valid (non-empty name, size >= 0), so ids line up 1:1
    // with `incoming` for wiring the local preview-url map.
    const ids = feed.uploadFiles(drafts);
    ids.forEach((id, index) => {
      const source = incoming[index];
      if (id && source) registerPreview(id, source);
    });
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    dragCounter.current = 0;
    setIsDraggingOver(false);
    if (e.dataTransfer.files.length > 0) uploadDroppedFiles(e.dataTransfer.files);
  };
  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    dragCounter.current += 1;
    setIsDraggingOver(true);
  };
  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    dragCounter.current = Math.max(0, dragCounter.current - 1);
    if (dragCounter.current === 0) setIsDraggingOver(false);
  };
  const handleDragOver = (e: React.DragEvent) => e.preventDefault();

  const submitNewFolder = () => {
    const name = folderDraft.trim();
    if (name) feed.createFolder(name);
    setFolderDraft('');
    setCreatingFolder(false);
  };

  const closePreview = () => setSelectedFileId(null);

  return (
    <div
      className="h-full flex flex-col"
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <ViewHeader
        icon={FolderOpen}
        title="Archivos"
        description="Base de conocimiento consultada por el Orquestador y los especialistas expresamente autorizados."
        meta={<span className="text-[10px] text-white/35">{scopedFiles.length} archivos</span>}
        guide={{
          title: 'Control de conocimiento',
          items: [
            'Comprueba sensibilidad y agentes autorizados antes de publicar un archivo.',
            'Solo los documentos listos deben alimentar respuestas o automatizaciones.',
            'Usa las versiones para actualizar contenido sin perder trazabilidad.',
          ],
        }}
      />

      <div className="px-6 pt-3 pb-3 border-b border-white/[0.06] shrink-0 flex flex-wrap items-center gap-1.5">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar archivos..."
          className="onyx-input rounded-md px-3 py-1.5 text-xs w-full max-w-[220px]"
        />
        <button
          onClick={() => setStatusFilter('all')}
          className={`text-[11px] px-2.5 py-1.5 rounded-md border transition-colors ${
            statusFilter === 'all' ? 'border-[#8AD3D2]/40 bg-[#83CFCE]/10 text-[#BFE7E6]' : 'border-white/10 text-white/45 hover:text-white/70'
          }`}
        >
          Todos los estados
        </button>
        {STATUS_FILTERS.map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`text-[11px] px-2.5 py-1.5 rounded-md border transition-colors ${
              statusFilter === s ? 'border-[#8AD3D2]/40 bg-[#83CFCE]/10 text-[#BFE7E6]' : 'border-white/10 text-white/45 hover:text-white/70'
            }`}
          >
            {FILE_STATUS_LABEL_ES[s]}
          </button>
        ))}

        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files) uploadDroppedFiles(e.target.files);
            e.target.value = '';
          }}
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          className="ml-auto bg-[#79CBCA] hover:bg-[#83CFCE] text-[#102828] rounded-md px-3 py-1.5 text-xs font-semibold transition-colors border border-[#8AD3D2]/25 whitespace-nowrap"
        >
          + Subir archivos
        </button>
      </div>

      {!searching && (
        <div className="px-6 py-3 border-b border-white/[0.06] shrink-0">
          <div className="flex items-center gap-1.5 text-[11px] text-white/40 mb-2 flex-wrap">
            <button
              onClick={() => feed.setCurrentFolderId(null)}
              className={`hover:text-white transition-colors ${feed.currentFolderId === null ? 'text-white font-medium' : ''}`}
            >
              Archivos
            </button>
            {breadcrumb.map((folder) => (
              <span key={folder.id} className="flex items-center gap-1.5">
                <span className="text-white/20">/</span>
                <button
                  onClick={() => feed.setCurrentFolderId(folder.id)}
                  className={`hover:text-white transition-colors ${folder.id === feed.currentFolderId ? 'text-white font-medium' : ''}`}
                >
                  {folder.name}
                </button>
              </span>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {feed.folders.map((folder) => (
              <FolderChip
                key={folder.id}
                folder={folder}
                active={folder.id === feed.currentFolderId}
                onOpen={() => feed.setCurrentFolderId(folder.id)}
                onRename={(name) => feed.renameFolder(folder.id, name)}
                onDelete={() => feed.deleteFolder(folder.id)}
              />
            ))}
            {creatingFolder ? (
              <input
                autoFocus
                value={folderDraft}
                onChange={(e) => setFolderDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') submitNewFolder();
                  if (e.key === 'Escape') {
                    setFolderDraft('');
                    setCreatingFolder(false);
                  }
                }}
                onBlur={submitNewFolder}
                placeholder="Nombre de la carpeta"
                className="onyx-input rounded-md px-2.5 py-1.5 text-[11px] w-40"
              />
            ) : (
              <button
                onClick={() => setCreatingFolder(true)}
                className="text-[11px] px-2.5 py-1.5 rounded-md border border-dashed border-white/15 text-white/45 hover:text-white/75 hover:border-white/30 transition-colors"
              >
                + Nueva carpeta
              </button>
            )}
          </div>
        </div>
      )}

      {feed.error && <div className="px-6 py-2 border-b border-white/[0.06] shrink-0 text-[11px] text-rose-300/70">{feed.error}</div>}

      <div className="flex-1 overflow-y-auto px-6 py-4 relative">
        {isDraggingOver && (
          <div className="absolute inset-3 z-10 rounded-xl border-2 border-dashed border-[#8AD3D2]/60 bg-[#83CFCE]/[0.08] backdrop-blur-sm flex items-center justify-center pointer-events-none">
            <span className="text-sm text-[#BFE7E6] font-medium">Suelta los archivos para subirlos</span>
          </div>
        )}

        {feed.loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-20 rounded-lg border border-white/[0.06] bg-white/[0.02] animate-pulse" />
            ))}
          </div>
        ) : scopedFiles.length === 0 ? (
          <div className="text-sm text-white/30 text-center mt-12 max-w-sm mx-auto">
            {searching
              ? `No se encontraron archivos para "${query}".`
              : 'Esta carpeta está vacía. Arrastra archivos aquí o usa "+ Subir archivos".'}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
            {scopedFiles.map((file) => (
              <FileCard
                key={file.id}
                file={file}
                version={feed.state.versions[file.currentVersionId]}
                folderLabel={searching ? folderPathLabel(feed.state.folders, file.folderId) : undefined}
                onOpen={() => setSelectedFileId(file.id)}
                onRetry={() => feed.retryFile(file.id)}
              />
            ))}
          </div>
        )}
      </div>

      {selectedFile && (
        <FilePreviewPanel
          file={selectedFile}
          version={feed.state.versions[selectedFile.currentVersionId]}
          versions={feed.getVersions(selectedFile.id)}
          folders={feed.state.folders}
          previewUrl={previewUrls.get(selectedFile.id) ?? null}
          agents={agents}
          onClose={closePreview}
          onRetry={() => feed.retryFile(selectedFile.id)}
          onDelete={() => {
            const url = previewUrls.get(selectedFile.id);
            if (url) {
              URL.revokeObjectURL(url);
              setPreviewUrls((prev) => {
                const next = new Map(prev);
                next.delete(selectedFile.id);
                return next;
              });
            }
            feed.deleteFile(selectedFile.id);
            closePreview();
          }}
          onAddVersion={(file) => {
            const currentVersion = feed.state.versions[selectedFile.currentVersionId];
            registerPreview(selectedFile.id, file);
            feed.createVersion(selectedFile.id, file.name, file.type || currentVersion?.mimeType || 'application/octet-stream', file.size);
          }}
          onUpdateAccess={(sensitivity, access) => feed.updateAccess(selectedFile.id, sensitivity, access)}
          onMove={(folderId) => feed.moveFile(selectedFile.id, folderId)}
        />
      )}
    </div>
  );
}
