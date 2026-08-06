export type TeamChannelKind = "general" | "direct" | "custom";

export const TEAM_CHANNEL_NAME_MAX_LENGTH = 60;

export interface TeamChannelRow {
  id: string;
  workspace_id: string;
  name: string;
  kind: TeamChannelKind;
  created_by: string | null;
  direct_key: string | null;
  created_at: string;
  updated_at: string;
}

export interface TeamMessageRow {
  id: string;
  workspace_id: string;
  channel_id: string;
  sender_id: string;
  body: string;
  created_at: string;
  edited_at: string | null;
  deleted_at: string | null;
  attachment?: TeamMessageAttachment | null;
}

export type AttachmentScanStatus = "pending" | "clean" | "infected" | "rejected" | "error";

/** Nunca lleva object_path — la descarga se resuelve siempre vía
 * getAttachmentDownloadUrl(), nunca con una ruta expuesta al cliente. */
export interface TeamMessageAttachment {
  id: string;
  message_id: string;
  file_name: string;
  declared_mime: string;
  byte_size: number;
  scan_status: AttachmentScanStatus;
  created_at: string;
}

export const TEAM_CHAT_ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024;
/** Por encima de este tamaño se usa subida reanudable (TUS) en vez de una
 * subida simple — el mismo umbral que documenta el plan de Fase 2. */
export const TEAM_CHAT_ATTACHMENT_TUS_THRESHOLD_BYTES = 6 * 1024 * 1024;

export const TEAM_CHAT_ALLOWED_MIME_TYPES = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
] as const;

/** Canal listo para la lista de conversaciones: ya trae lo que la UI necesita. */
export interface TeamChannelSummary {
  id: string;
  kind: TeamChannelKind;
  /** Para DM, el nombre del OTRO participante — nunca el propio. */
  displayName: string;
  otherUserId: string | null;
  lastMessagePreview: string | null;
  lastMessageAt: string | null;
  unreadCount: number;
}

export const TEAM_MESSAGE_MAX_LENGTH = 4000;
