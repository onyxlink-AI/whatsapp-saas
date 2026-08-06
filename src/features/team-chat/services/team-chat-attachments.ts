"use server";

/**
 * team-chat-attachments.ts — Server actions para documentos privados del
 * Chat de equipo (Fase 2). beginAttachmentUpload()/getAttachmentDownloadUrl()
 * usan el cliente que respeta RLS (sesión del propio usuario) — la
 * subida real de bytes a Storage la hace el cliente directamente, con su
 * propia sesión (nunca desde aquí, ver attachment-upload-client.ts).
 * finalizeAttachmentUpload() sí usa service role: necesita descargar los
 * bytes recién subidos para verificarlos (MIME real + hash + escaneo) y
 * escribir el resultado del escaneo, algo que ningún cliente debe poder
 * hacer directamente.
 */

import { createHash } from "node:crypto";
import { fileTypeFromBuffer } from "file-type";
import { after } from "next/server";
import { createClient as createSbClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { broadcastTeamMessage, broadcastTeamMessageUpdate } from "@/features/team-chat/services/team-chat-broadcast";
import { scanFileForMalware } from "@/lib/malware-scan/cloudmersive";
import { logAudit } from "@/features/audit/services/audit-log";
import { TEAM_CHAT_ALLOWED_MIME_TYPES } from "@/features/team-chat/types";
import type { AttachmentScanStatus, TeamMessageAttachment, TeamMessageRow } from "@/features/team-chat/types";
import type { ActionResult } from "@/features/team-chat/services/team-chat-actions";

const BUCKET = "team-chat-files";

function svc() {
  return createSbClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

interface MessageRowSelect {
  id: string;
  workspace_id: string;
  channel_id: string;
  sender_id: string;
  body: string;
  created_at: string;
  edited_at: string | null;
  deleted_at: string | null;
}

const MESSAGE_COLUMNS = "id, workspace_id, channel_id, sender_id, body, created_at, edited_at, deleted_at";

// ──────────────────────────────────────────────────────────────────────────────
// beginAttachmentUpload — reserva el mensaje/adjunto vía
// begin_team_attachment_upload() (SECURITY DEFINER, valida membership +
// cuota + allowlist con la fila de workspaces bloqueada FOR UPDATE — ver
// migración) y notifica de inmediato al resto de participantes del canal
// (con scan_status='pending', nunca con los bytes) para que vean "Analizando
// archivo…" mientras el cliente sube y esta acción termina de escanear.
// ──────────────────────────────────────────────────────────────────────────────
export interface BeginAttachmentUploadResult {
  attachmentId: string;
  objectPath: string;
  message: TeamMessageRow;
}

export async function beginAttachmentUpload(
  channelId: string,
  fileName: string,
  declaredMime: string,
  byteSize: number,
): Promise<ActionResult<BeginAttachmentUploadResult>> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) return { ok: false, error: "No autorizado" };

  const trimmedName = fileName.trim().slice(0, 255);
  if (!trimmedName) return { ok: false, error: "Nombre de archivo inválido" };

  const { data, error } = await supabase.rpc("begin_team_attachment_upload", {
    p_channel_id: channelId,
    p_file_name: trimmedName,
    p_declared_mime: declaredMime,
    p_byte_size: byteSize,
  });

  if (error || !data) {
    const msg = error?.message ?? "";
    if (msg.includes("UNSUPPORTED_FILE_TYPE")) return { ok: false, error: "UNSUPPORTED_FILE_TYPE" };
    if (msg.includes("FILE_TOO_LARGE")) return { ok: false, error: "FILE_TOO_LARGE" };
    if (msg.includes("QUOTA_EXCEEDED")) return { ok: false, error: "QUOTA_EXCEEDED" };
    console.error("[beginAttachmentUpload] Supabase error:", error?.message);
    return { ok: false, error: "Error al iniciar la subida" };
  }

  const reserved = data as { messageId: string; attachmentId: string; objectPath: string };

  const { data: messageRow, error: messageError } = await supabase
    .from("team_messages")
    .select(MESSAGE_COLUMNS)
    .eq("id", reserved.messageId)
    .single();

  if (messageError || !messageRow) {
    console.error("[beginAttachmentUpload] failed to re-read message:", messageError?.message);
    return { ok: false, error: "Error al iniciar la subida" };
  }

  const attachment: TeamMessageAttachment = {
    id: reserved.attachmentId,
    message_id: reserved.messageId,
    file_name: trimmedName,
    declared_mime: declaredMime,
    byte_size: byteSize,
    scan_status: "pending",
    created_at: (messageRow as MessageRowSelect).created_at,
  };

  const message: TeamMessageRow = { ...(messageRow as MessageRowSelect), attachment };

  after(() => broadcastTeamMessage(message));

  return { ok: true, data: { attachmentId: reserved.attachmentId, objectPath: reserved.objectPath, message } };
}

// ──────────────────────────────────────────────────────────────────────────────
// finalizeAttachmentUpload — con service role: descarga los bytes recién
// subidos por el cliente, verifica el MIME real por magic bytes (nunca
// confía en el declarado — trivialmente falsificable), calcula el hash y
// llama al escáner antimalware. Solo puede finalizar el propio uploader.
// Cualquier resultado no-'clean' borra el objeto de Storage — un archivo
// rechazado/infectado no debe quedar recuperable ni un instante más de lo
// necesario. Notifica al resto de participantes en todos los estados
// terminales (no solo 'clean'): si solo se avisara del éxito, un adjunto
// rechazado dejaría el bubble de los demás participantes clavado en
// "Analizando…" para siempre.
// ──────────────────────────────────────────────────────────────────────────────
export async function finalizeAttachmentUpload(attachmentId: string): Promise<ActionResult<{ status: AttachmentScanStatus }>> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) return { ok: false, error: "No autorizado" };

  const { data: attachmentRow, error: fetchError } = await supabase
    .from("team_message_attachments")
    .select("id, workspace_id, channel_id, message_id, uploader_id, object_path, file_name, declared_mime, byte_size, scan_status")
    .eq("id", attachmentId)
    .maybeSingle();

  if (fetchError || !attachmentRow) return { ok: false, error: "Adjunto no encontrado" };
  if (attachmentRow.uploader_id !== user.id) return { ok: false, error: "No autorizado" };
  if (attachmentRow.scan_status !== "pending") {
    return { ok: true, data: { status: attachmentRow.scan_status as AttachmentScanStatus } };
  }

  const service = svc();
  const { data: fileBlob, error: downloadError } = await service.storage.from(BUCKET).download(attachmentRow.object_path);

  if (downloadError || !fileBlob) {
    console.error("[finalizeAttachmentUpload] download failed:", downloadError?.message);
    return { ok: false, error: "Error al verificar el archivo" };
  }

  const buffer = Buffer.from(await fileBlob.arrayBuffer());
  const detected = await fileTypeFromBuffer(buffer);
  const detectedMime = detected?.mime ?? null;
  const mimeAllowed = detectedMime !== null && (TEAM_CHAT_ALLOWED_MIME_TYPES as readonly string[]).includes(detectedMime);
  // La cuota se contabilizó en begin_team_attachment_upload() sobre el
  // byte_size DECLARADO — si los bytes reales no coinciden, alguien pudo
  // subir un archivo distinto (y más grande) del que se contó contra la
  // cuota. Se trata igual que un MIME falso: rechazado, sin escanear.
  const sizeMatches = buffer.length === (attachmentRow.byte_size as number);

  let finalStatus: AttachmentScanStatus;
  let scanProvider: string | null = null;
  let sha256Hash: string | null = null;

  if (!sizeMatches || !mimeAllowed) {
    finalStatus = "rejected";
  } else {
    sha256Hash = createHash("sha256").update(buffer).digest("hex");
    scanProvider = "cloudmersive";
    const scanResult = await scanFileForMalware(buffer, attachmentRow.file_name as string);
    finalStatus = scanResult.clean
      ? "clean"
      : scanResult.reason === "SCANNER_NOT_CONFIGURED" ||
          scanResult.reason === "SCAN_REQUEST_FAILED" ||
          scanResult.reason === "SCAN_RESPONSE_INVALID"
        ? "error"
        : "infected";
  }

  const { error: rpcError } = await service.rpc("finalize_team_attachment_scan", {
    p_attachment_id: attachmentId,
    p_detected_mime: detectedMime,
    p_sha256_hash: sha256Hash,
    p_scan_status: finalStatus,
    p_scan_provider: scanProvider,
  });

  if (rpcError) {
    console.error("[finalizeAttachmentUpload] finalize_team_attachment_scan error:", rpcError.message);
    return { ok: false, error: "Error al finalizar el escaneo" };
  }

  if (finalStatus !== "clean") {
    await service.storage.from(BUCKET).remove([attachmentRow.object_path as string]);
  }

  void logAudit({
    workspaceId: attachmentRow.workspace_id as string,
    actorUserId: user.id,
    action: finalStatus === "clean" ? "team_chat.attachment_clean" : "team_chat.attachment_rejected",
    targetType: "team_message_attachment",
    targetId: attachmentId,
    summary:
      finalStatus === "clean"
        ? `Adjunto "${attachmentRow.file_name}" escaneado y limpio`
        : `Adjunto "${attachmentRow.file_name}" rechazado (${finalStatus})`,
    metadata: { declaredMime: attachmentRow.declared_mime, detectedMime, finalStatus },
  });

  const { data: messageRow } = await service.from("team_messages").select(MESSAGE_COLUMNS).eq("id", attachmentRow.message_id).single();

  if (messageRow) {
    const attachment: TeamMessageAttachment = {
      id: attachmentId,
      message_id: attachmentRow.message_id as string,
      file_name: attachmentRow.file_name as string,
      declared_mime: attachmentRow.declared_mime as string,
      byte_size: attachmentRow.byte_size as number,
      scan_status: finalStatus,
      created_at: (messageRow as MessageRowSelect).created_at,
    };
    const message: TeamMessageRow = { ...(messageRow as MessageRowSelect), attachment };
    after(() => broadcastTeamMessageUpdate(message));
  }

  return { ok: true, data: { status: finalStatus } };
}

// ──────────────────────────────────────────────────────────────────────────────
// cancelAttachmentUpload — la subida de bytes va directo del navegador a
// Storage (attachment-upload-client.ts); si esa subida falla (red
// inestable), el servidor nunca se entera por su cuenta y el adjunto se
// quedaría en 'pending' para siempre. El propio composer llama a esto
// cuando uploadAttachmentFile() devuelve un error, para que el bubble deje
// de mostrar "Analizando…" y pase a "Archivo rechazado" — mismo criterio de
// notificar en todos los estados terminales que finalizeAttachmentUpload().
// ──────────────────────────────────────────────────────────────────────────────
export async function cancelAttachmentUpload(attachmentId: string): Promise<ActionResult<null>> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) return { ok: false, error: "No autorizado" };

  const { error } = await supabase.rpc("cancel_team_attachment_upload", { p_attachment_id: attachmentId });
  if (error) {
    console.error("[cancelAttachmentUpload] Supabase error:", error.message);
    return { ok: false, error: "Error al cancelar la subida" };
  }

  const { data: attachmentRow } = await supabase
    .from("team_message_attachments")
    .select("message_id, file_name, declared_mime, byte_size")
    .eq("id", attachmentId)
    .maybeSingle();

  if (attachmentRow) {
    const { data: messageRow } = await supabase.from("team_messages").select(MESSAGE_COLUMNS).eq("id", attachmentRow.message_id).single();
    if (messageRow) {
      const attachment: TeamMessageAttachment = {
        id: attachmentId,
        message_id: attachmentRow.message_id as string,
        file_name: attachmentRow.file_name as string,
        declared_mime: attachmentRow.declared_mime as string,
        byte_size: attachmentRow.byte_size as number,
        scan_status: "error",
        created_at: (messageRow as MessageRowSelect).created_at,
      };
      const message: TeamMessageRow = { ...(messageRow as MessageRowSelect), attachment };
      after(() => broadcastTeamMessageUpdate(message));
    }
  }

  return { ok: true, data: null };
}

// ──────────────────────────────────────────────────────────────────────────────
// getAttachmentDownloadUrl — URL firmada de vida muy corta (2 minutos, no
// se persiste nunca). RLS de team_message_attachments ya garantiza que solo
// se puede leer la fila si se participa del canal; scan_status='clean' se
// exige aquí explícitamente porque un adjunto pending/rejected/infected/
// error es legítimamente visible (para mostrar su estado) pero nunca
// descargable — la misma cuarentena la vuelve a exigir, en paralelo, la RLS
// de storage.objects (defensa en profundidad, no redundancia inútil).
// ──────────────────────────────────────────────────────────────────────────────
const DOWNLOAD_URL_TTL_SECONDS = 120;

export async function getAttachmentDownloadUrl(attachmentId: string): Promise<ActionResult<{ url: string }>> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) return { ok: false, error: "No autorizado" };

  const { data: attachmentRow, error: fetchError } = await supabase
    .from("team_message_attachments")
    .select("id, object_path, scan_status, file_name")
    .eq("id", attachmentId)
    .maybeSingle();

  if (fetchError || !attachmentRow) return { ok: false, error: "Adjunto no encontrado" };
  if (attachmentRow.scan_status !== "clean") return { ok: false, error: "ATTACHMENT_NOT_READY" };

  const service = svc();
  const { data, error } = await service.storage
    .from(BUCKET)
    .createSignedUrl(attachmentRow.object_path as string, DOWNLOAD_URL_TTL_SECONDS, {
      download: attachmentRow.file_name as string,
    });

  if (error || !data) {
    console.error("[getAttachmentDownloadUrl] createSignedUrl failed:", error?.message);
    return { ok: false, error: "Error al generar el enlace de descarga" };
  }

  return { ok: true, data: { url: data.signedUrl } };
}
