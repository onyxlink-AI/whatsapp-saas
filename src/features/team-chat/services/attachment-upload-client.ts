/**
 * attachment-upload-client.ts — sube los bytes del adjunto directamente a
 * Supabase Storage desde el navegador, con la sesión del propio usuario
 * (nunca pasa por el servidor de la app, nunca service role) — la RLS de
 * storage.objects (member_upload_team_chat_files, ver migración
 * 20260808000006) es la barrera real, igual que ya hace project-covers.
 *
 * < 6 MB: subida simple. 6–10 MB: subida reanudable (TUS) contra el
 * endpoint nativo de Supabase Storage, vía tus-js-client — necesaria para
 * no perder una subida grande a mitad por una desconexión momentánea.
 */

import * as tus from "tus-js-client";
import { createClient } from "@/lib/supabase/client";
import { TEAM_CHAT_ATTACHMENT_TUS_THRESHOLD_BYTES } from "@/features/team-chat/types";

export interface AttachmentUploadProgress {
  bytesUploaded: number;
  bytesTotal: number;
}

export type AttachmentUploadResult = { ok: true } | { ok: false; error: string };

async function uploadSimple(file: File, objectPath: string, onProgress?: (p: AttachmentUploadProgress) => void): Promise<AttachmentUploadResult> {
  const supabase = createClient();
  const { error } = await supabase.storage.from("team-chat-files").upload(objectPath, file, {
    contentType: file.type,
    upsert: false,
  });

  if (error) {
    console.error("[attachment-upload-client] simple upload failed:", error.message);
    return { ok: false, error: "UPLOAD_FAILED" };
  }

  onProgress?.({ bytesUploaded: file.size, bytesTotal: file.size });
  return { ok: true };
}

async function uploadResumable(file: File, objectPath: string, onProgress?: (p: AttachmentUploadProgress) => void): Promise<AttachmentUploadResult> {
  const supabase = createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) return { ok: false, error: "No autorizado" };

  return new Promise((resolve) => {
    const upload = new tus.Upload(file, {
      endpoint: `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/upload/resumable`,
      retryDelays: [0, 3000, 5000, 10000, 20000],
      headers: {
        authorization: `Bearer ${session.access_token}`,
        "x-upsert": "false",
      },
      uploadDataDuringCreation: true,
      removeFingerprintOnSuccess: true,
      metadata: {
        bucketName: "team-chat-files",
        objectName: objectPath,
        contentType: file.type,
      },
      // Fijo por requisito del endpoint resumable de Supabase Storage — no cambiar.
      chunkSize: 6 * 1024 * 1024,
      onError: (error) => {
        console.error("[attachment-upload-client] TUS upload failed:", error);
        resolve({ ok: false, error: "UPLOAD_FAILED" });
      },
      onProgress: (bytesUploaded, bytesTotal) => {
        onProgress?.({ bytesUploaded, bytesTotal });
      },
      onSuccess: () => {
        resolve({ ok: true });
      },
    });

    upload.findPreviousUploads().then((previousUploads) => {
      if (previousUploads.length > 0) {
        upload.resumeFromPreviousUpload(previousUploads[0]);
      }
      upload.start();
    });
  });
}

export async function uploadAttachmentFile(
  file: File,
  objectPath: string,
  onProgress?: (progress: AttachmentUploadProgress) => void,
): Promise<AttachmentUploadResult> {
  if (file.size < TEAM_CHAT_ATTACHMENT_TUS_THRESHOLD_BYTES) {
    return uploadSimple(file, objectPath, onProgress);
  }
  return uploadResumable(file, objectPath, onProgress);
}
