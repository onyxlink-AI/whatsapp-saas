"use server";

/**
 * team-chat-actions.ts — Server actions for Chat de equipo (Fase 1). Todas
 * usan el cliente que respeta RLS (sesión del propio usuario) — nunca
 * service role — porque RLS con auth.uid() real es la frontera de
 * aislamiento aquí, no una comprobación en la Route Handler. Persistir
 * primero, emitir el evento Broadcast después (nunca al revés).
 */

import { after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { TeamChannelKind, TeamChannelSummary, TeamMessageAttachment, TeamMessageRow } from "@/features/team-chat/types";
import { TEAM_MESSAGE_MAX_LENGTH } from "@/features/team-chat/types";
// Se programa con after() (next/server), no con un `void fn()` suelto: una
// Server Action puede terminar de ejecutarse en cuanto se envía la
// respuesta al cliente, y un fire-and-forget sin after() puede quedar
// cortado a mitad del fetch HTTP hacia Realtime — confirmado en la revisión
// visual de Fase 1 (Empresa A y superadmin en el mismo canal: el mensaje de
// A nunca llegaba en vivo a la sesión del superadmin, solo tras recargar).
// after() garantiza que esta llamada corra hasta el final aunque la
// respuesta ya se haya enviado, sin retrasarla. broadcastTeamMessage/Update
// viven en team-chat-broadcast.ts (sin "use server") para poder
// reutilizarlas también desde team-chat-attachments.ts sin exponerlas como
// endpoints públicos invocables por el cliente.
import { broadcastTeamMessage, broadcastTeamMessageUpdate } from "@/features/team-chat/services/team-chat-broadcast";

export type ActionResult<T> =
  | { ok: true; data: T; error?: never }
  | { ok: false; data?: never; error: string };

const RATE_LIMIT_WINDOW_MS = 10_000;
const RATE_LIMIT_MAX = 20;

// ──────────────────────────────────────────────────────────────────────────────
// listMyChannels — General primero, luego DMs por actividad reciente.
// ──────────────────────────────────────────────────────────────────────────────
export async function listMyChannels(workspaceId: string): Promise<TeamChannelSummary[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data: memberRows, error } = await supabase
    .from("team_channel_members")
    .select("channel_id, last_read_at, team_channels(id, kind, name, direct_key, workspace_id)")
    .eq("workspace_id", workspaceId)
    .eq("user_id", user.id);

  if (error || !memberRows) {
    console.error("[listMyChannels] Supabase error:", error?.message);
    return [];
  }

  const rows = memberRows as unknown as Array<{
    channel_id: string;
    last_read_at: string;
    team_channels: {
      id: string;
      kind: TeamChannelKind;
      name: string;
      direct_key: string | null;
      workspace_id: string;
    } | null;
  }>;

  const summaries: TeamChannelSummary[] = [];

  for (const row of rows) {
    if (!row.team_channels) continue;
    const channelId = row.channel_id;

    let displayName = row.team_channels.name;
    let otherUserId: string | null = null;

    if (row.team_channels.kind === "direct") {
      const { data: others } = await supabase
        .from("team_channel_members")
        .select("user_id, users(full_name, email)")
        .eq("channel_id", channelId)
        .neq("user_id", user.id)
        .limit(1);
      const other = (
        others as unknown as Array<{
          user_id: string;
          users: { full_name: string | null; email: string } | null;
        }>
      )?.[0];
      otherUserId = other?.user_id ?? null;
      displayName = other?.users?.full_name || other?.users?.email || "Miembro";
    }

    const { data: lastMsg } = await supabase
      .from("team_messages")
      .select("body, created_at, deleted_at")
      .eq("channel_id", channelId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const { count: unreadCount } = await supabase
      .from("team_messages")
      .select("id", { count: "exact", head: true })
      .eq("channel_id", channelId)
      .gt("created_at", row.last_read_at)
      .neq("sender_id", user.id);

    summaries.push({
      id: channelId,
      kind: row.team_channels.kind,
      displayName,
      otherUserId,
      lastMessagePreview: lastMsg?.deleted_at ? "Mensaje eliminado" : (lastMsg?.body ?? null),
      lastMessageAt: lastMsg?.created_at ?? null,
      unreadCount: unreadCount ?? 0,
    });
  }

  // Orden: General primero, luego los canales personalizados (alfabético,
  // como cualquier lista de canales tipo Slack), luego los DM por actividad
  // reciente.
  const kindRank: Record<TeamChannelKind, number> = { general: 0, custom: 1, direct: 2 };
  summaries.sort((a, b) => {
    if (a.kind !== b.kind) return kindRank[a.kind] - kindRank[b.kind];
    if (a.kind === "custom") return a.displayName.localeCompare(b.displayName);
    return (b.lastMessageAt ?? "").localeCompare(a.lastMessageAt ?? "");
  });

  return summaries;
}

// ──────────────────────────────────────────────────────────────────────────────
// getChannelMessages — paginación por cursor (channel_id, created_at desc, id
// desc). El cursor debe llevar AMBOS campos: dos mensajes con el mismo
// created_at (perfectamente posible con timestamps de microsegundos bajo
// carga, o con inserts en la misma transacción) rompían la paginación si
// solo se filtraba por created_at — la segunda página podía saltarse (o
// duplicar) filas que comparten el mismo instante que el último elemento de
// la página anterior. El filtro reproduce el orden total exacto de la
// consulta: created_at estrictamente menor, O igual con id estrictamente
// menor (comparación lexicográfica de la tupla (created_at, id) DESC).
// ──────────────────────────────────────────────────────────────────────────────
export interface MessageCursor {
  createdAt: string;
  id: string;
}

export interface MessagePage {
  messages: TeamMessageRow[];
  nextCursor: MessageCursor | null;
}

export async function getChannelMessages(
  channelId: string,
  cursor?: MessageCursor | null,
  limit = 50,
): Promise<MessagePage> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { messages: [], nextCursor: null };

  let query = supabase
    .from("team_messages")
    .select("id, workspace_id, channel_id, sender_id, body, created_at, edited_at, deleted_at")
    .eq("channel_id", channelId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit);

  if (cursor) {
    query = query.or(`created_at.lt.${cursor.createdAt},and(created_at.eq.${cursor.createdAt},id.lt.${cursor.id})`);
  }

  const { data, error } = await query;
  if (error || !data) {
    console.error("[getChannelMessages] Supabase error:", error?.message);
    return { messages: [], nextCursor: null };
  }

  const rows = data as TeamMessageRow[];
  const last = rows[rows.length - 1];
  const nextCursor = rows.length === limit && last ? { createdAt: last.created_at, id: last.id } : null;

  // Los mensajes con adjunto no traen esa relación en el SELECT de arriba
  // (team_message_attachments es una tabla aparte, un mensaje "contenedor"
  // por adjunto) — sin este segundo query, un mensaje con adjunto solo se
  // ve completo durante la propia sesión de subida (donde el composer ya
  // conoce el adjunto de memoria); al recargar el canal o reabrirlo,
  // getChannelMessages() lo devolvía como texto plano con el body
  // placeholder ("📎 nombre.pdf") en vez del bloque de adjunto real.
  const messageIds = rows.map((r) => r.id);
  if (messageIds.length > 0) {
    const { data: attachmentRows } = await supabase
      .from("team_message_attachments")
      .select("id, message_id, file_name, declared_mime, byte_size, scan_status, created_at")
      .in("message_id", messageIds);

    const attachmentByMessageId = new Map(
      ((attachmentRows ?? []) as unknown as TeamMessageAttachment[]).map((a) => [a.message_id, a]),
    );

    for (const row of rows) {
      const attachment = attachmentByMessageId.get(row.id);
      if (attachment) row.attachment = attachment;
    }
  }

  return { messages: [...rows].reverse(), nextCursor };
}

// ──────────────────────────────────────────────────────────────────────────────
// sendMessage
// ──────────────────────────────────────────────────────────────────────────────
export async function sendMessage(channelId: string, body: string): Promise<ActionResult<TeamMessageRow>> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) return { ok: false, error: "No autorizado" };

  const trimmed = body.trim();
  if (!trimmed) return { ok: false, error: "El mensaje no puede estar vacío" };
  if (trimmed.length > TEAM_MESSAGE_MAX_LENGTH) {
    return { ok: false, error: "Mensaje demasiado largo" };
  }

  const sinceIso = new Date(Date.now() - RATE_LIMIT_WINDOW_MS).toISOString();
  const { count } = await supabase
    .from("team_messages")
    .select("id", { count: "exact", head: true })
    .eq("sender_id", user.id)
    .gte("created_at", sinceIso);

  if ((count ?? 0) >= RATE_LIMIT_MAX) {
    return { ok: false, error: "RATE_LIMITED" };
  }

  const { data: channelRow } = await supabase
    .from("team_channels")
    .select("workspace_id")
    .eq("id", channelId)
    .maybeSingle();

  if (!channelRow) return { ok: false, error: "Canal no encontrado" };

  const { data: inserted, error } = await supabase
    .from("team_messages")
    .insert({
      workspace_id: channelRow.workspace_id,
      channel_id: channelId,
      sender_id: user.id,
      body: trimmed,
    })
    .select("id, workspace_id, channel_id, sender_id, body, created_at, edited_at, deleted_at")
    .single();

  if (error || !inserted) {
    console.error("[sendMessage] Supabase error:", error?.message);
    return { ok: false, error: "Error al enviar el mensaje" };
  }

  const message = inserted as TeamMessageRow;
  after(() => broadcastTeamMessage(message));

  return { ok: true, data: message };
}

// ──────────────────────────────────────────────────────────────────────────────
// editMessage / deleteMessageLogical — solo el autor (RLS + WHERE redundante).
// ──────────────────────────────────────────────────────────────────────────────
export async function editMessage(messageId: string, body: string): Promise<ActionResult<null>> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) return { ok: false, error: "No autorizado" };

  const trimmed = body.trim();
  if (!trimmed) return { ok: false, error: "El mensaje no puede estar vacío" };
  if (trimmed.length > TEAM_MESSAGE_MAX_LENGTH) {
    return { ok: false, error: "Mensaje demasiado largo" };
  }

  const { data: updated, error } = await supabase
    .from("team_messages")
    .update({ body: trimmed, edited_at: new Date().toISOString() })
    .eq("id", messageId)
    .eq("sender_id", user.id)
    .select("id, workspace_id, channel_id, sender_id, body, created_at, edited_at, deleted_at")
    .maybeSingle();

  if (error || !updated) {
    console.error("[editMessage] Supabase error:", error?.message);
    return { ok: false, error: "Error al editar el mensaje" };
  }

  after(() => broadcastTeamMessageUpdate(updated as TeamMessageRow));
  return { ok: true, data: null };
}

export async function deleteMessageLogical(messageId: string): Promise<ActionResult<null>> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) return { ok: false, error: "No autorizado" };

  const { data: updated, error } = await supabase
    .from("team_messages")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", messageId)
    .eq("sender_id", user.id)
    .select("id, workspace_id, channel_id, sender_id, body, created_at, edited_at, deleted_at")
    .maybeSingle();

  if (error || !updated) {
    console.error("[deleteMessageLogical] Supabase error:", error?.message);
    return { ok: false, error: "Error al eliminar el mensaje" };
  }

  after(() => broadcastTeamMessageUpdate(updated as TeamMessageRow));
  return { ok: true, data: null };
}

// ──────────────────────────────────────────────────────────────────────────────
// markChannelRead
// ──────────────────────────────────────────────────────────────────────────────
export async function markChannelRead(channelId: string): Promise<ActionResult<null>> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) return { ok: false, error: "No autorizado" };

  const { error } = await supabase
    .from("team_channel_members")
    .update({ last_read_at: new Date().toISOString() })
    .eq("channel_id", channelId)
    .eq("user_id", user.id);

  if (error) {
    console.error("[markChannelRead] Supabase error:", error.message);
    return { ok: false, error: "Error al marcar como leído" };
  }

  return { ok: true, data: null };
}

// ──────────────────────────────────────────────────────────────────────────────
// openDirectMessage — abre/crea el DM vía get_or_create_dm_channel(), que
// deriva "quién soy yo" de auth.uid() dentro de la función (no de un
// parámetro del cliente) — ver comentario en la migración.
// ──────────────────────────────────────────────────────────────────────────────
export async function openDirectMessage(
  workspaceId: string,
  otherUserId: string,
): Promise<ActionResult<{ channelId: string }>> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) return { ok: false, error: "No autorizado" };

  const { data, error } = await supabase.rpc("get_or_create_dm_channel", {
    p_workspace_id: workspaceId,
    p_other_user_id: otherUserId,
  });

  if (error || !data) {
    console.error("[openDirectMessage] Supabase error:", error?.message);
    return { ok: false, error: "Error al abrir el mensaje directo" };
  }

  return { ok: true, data: { channelId: data as string } };
}

// ──────────────────────────────────────────────────────────────────────────────
// createTeamChannel — crea un canal abierto a todo el workspace vía
// create_team_channel(), que deriva "quién crea" de auth.uid() dentro de la
// función (no de un parámetro del cliente) — mismo motivo anti-IDOR que
// get_or_create_dm_channel. El backfill de todos los miembros activos
// actuales lo hace la propia función SQL.
// ──────────────────────────────────────────────────────────────────────────────
export async function createTeamChannel(
  workspaceId: string,
  name: string,
): Promise<ActionResult<{ channelId: string }>> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) return { ok: false, error: "No autorizado" };

  const trimmed = name.trim();
  if (!trimmed) return { ok: false, error: "El nombre del canal no puede estar vacío" };

  const { data, error } = await supabase.rpc("create_team_channel", {
    p_workspace_id: workspaceId,
    p_name: trimmed,
  });

  if (error || !data) {
    if (error?.message?.includes("CHANNEL_NAME_TAKEN")) {
      return { ok: false, error: "CHANNEL_NAME_TAKEN" };
    }
    console.error("[createTeamChannel] Supabase error:", error?.message);
    return { ok: false, error: "Error al crear el canal" };
  }

  return { ok: true, data: { channelId: data as string } };
}

// ──────────────────────────────────────────────────────────────────────────────
// listTeammates — miembros activos con quien se puede abrir un DM.
// ──────────────────────────────────────────────────────────────────────────────
export interface TeammateOption {
  user_id: string;
  full_name: string;
}

export async function listTeammates(workspaceId: string): Promise<TeammateOption[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from("memberships")
    .select("user_id, users(full_name, email)")
    .eq("workspace_id", workspaceId)
    .eq("is_active", true)
    .neq("user_id", user.id);

  if (error || !data) {
    console.error("[listTeammates] Supabase error:", error?.message);
    return [];
  }

  return (
    data as unknown as Array<{
      user_id: string;
      users: { full_name: string | null; email: string } | null;
    }>
  ).map((row) => ({
    user_id: row.user_id,
    full_name: row.users?.full_name || row.users?.email || "Miembro",
  }));
}
