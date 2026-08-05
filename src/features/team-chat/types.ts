export type TeamChannelKind = "general" | "direct";

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
}

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
