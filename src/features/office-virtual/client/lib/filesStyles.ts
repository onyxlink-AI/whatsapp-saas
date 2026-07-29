import type { FileSensitivity, FileStatus } from '../central-files';

// Same pattern as statusStyles.ts / reportStyles.ts — single source for how
// Codex's real central-files enums (FileStatus, FileSensitivity) read across
// the app. See COORDINACION_CLAUDE_CODEX.md.
export const FILE_STATUS_LABEL_ES: Record<FileStatus, string> = {
  uploading: 'Subiendo',
  processing: 'Procesando',
  available: 'Disponible',
  failed: 'Error',
  deleted: 'Eliminado',
};

export const FILE_STATUS_TW: Record<FileStatus, string> = {
  uploading: 'text-sky-300/80 border-sky-500/25 bg-sky-500/[0.06]',
  processing: 'text-amber-300/80 border-amber-500/25 bg-amber-500/[0.06]',
  available: 'text-emerald-300/80 border-emerald-500/25 bg-emerald-500/[0.06]',
  failed: 'text-rose-300/80 border-rose-500/25 bg-rose-500/[0.06]',
  deleted: 'text-white/30 border-white/10 bg-white/[0.02]',
};

export const FILE_SENSITIVITY_LABEL_ES: Record<FileSensitivity, string> = {
  normal: 'Normal',
  sensitive: 'Sensible',
  restricted: 'Restringido',
};

export const FILE_SENSITIVITY_ORDER: FileSensitivity[] = ['normal', 'sensitive', 'restricted'];

export const FILE_SENSITIVITY_TW: Record<FileSensitivity, string> = {
  normal: 'text-white/55 border-white/12 bg-white/[0.03]',
  sensitive: 'text-amber-300/80 border-amber-500/25 bg-amber-500/[0.06]',
  restricted: 'text-rose-300/80 border-rose-500/25 bg-rose-500/[0.06]',
};

export type FileKind = 'image' | 'pdf' | 'document' | 'spreadsheet' | 'presentation' | 'audio' | 'video' | 'archive' | 'other';

const EXTENSION_KIND: Record<string, FileKind> = {
  png: 'image', jpg: 'image', jpeg: 'image', gif: 'image', webp: 'image', svg: 'image',
  pdf: 'pdf',
  doc: 'document', docx: 'document', txt: 'document', rtf: 'document', md: 'document',
  xls: 'spreadsheet', xlsx: 'spreadsheet', csv: 'spreadsheet',
  ppt: 'presentation', pptx: 'presentation',
  mp3: 'audio', wav: 'audio', m4a: 'audio',
  mp4: 'video', mov: 'video', webm: 'video',
  zip: 'archive', rar: 'archive', '7z': 'archive',
};

export const FILE_KIND_TW: Record<FileKind, string> = {
  image: 'text-fuchsia-300/80 border-fuchsia-500/25 bg-fuchsia-500/[0.06]',
  pdf: 'text-rose-300/80 border-rose-500/25 bg-rose-500/[0.06]',
  document: 'text-sky-300/80 border-sky-500/25 bg-sky-500/[0.06]',
  spreadsheet: 'text-emerald-300/80 border-emerald-500/25 bg-emerald-500/[0.06]',
  presentation: 'text-amber-300/80 border-amber-500/25 bg-amber-500/[0.06]',
  audio: 'text-violet-300/80 border-violet-500/25 bg-violet-500/[0.06]',
  video: 'text-indigo-300/80 border-indigo-500/25 bg-indigo-500/[0.06]',
  archive: 'text-orange-300/80 border-orange-500/25 bg-orange-500/[0.06]',
  other: 'text-white/50 border-white/10 bg-white/[0.03]',
};

function fileExtension(name: string): string {
  const parts = name.split('.');
  return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : '';
}

export function fileKind(name: string): FileKind {
  return EXTENSION_KIND[fileExtension(name)] ?? 'other';
}

export function fileExtensionLabel(name: string): string {
  const ext = fileExtension(name);
  return ext ? ext.toUpperCase().slice(0, 4) : '—';
}

export function isPreviewableKind(kind: FileKind): boolean {
  return kind === 'image' || kind === 'pdf';
}

export function formatBytes(bytes: number): string {
  if (bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const exponent = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const value = bytes / 1024 ** exponent;
  return `${exponent === 0 ? value : value.toFixed(1)} ${units[exponent]}`;
}
