"use client";

import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Send, Paperclip, Loader2, X } from "lucide-react";
import { sendMessage } from "@/features/team-chat/services/team-chat-actions";
import { beginAttachmentUpload, finalizeAttachmentUpload, cancelAttachmentUpload } from "@/features/team-chat/services/team-chat-attachments";
import { uploadAttachmentFile } from "@/features/team-chat/services/attachment-upload-client";
import {
  TEAM_MESSAGE_MAX_LENGTH,
  TEAM_CHAT_ALLOWED_MIME_TYPES,
  TEAM_CHAT_ATTACHMENT_MAX_BYTES,
} from "@/features/team-chat/types";
import type { AttachmentScanStatus, TeamMessageRow } from "@/features/team-chat/types";

interface MessageComposerProps {
  channelId: string;
  onSent: (message: TeamMessageRow) => void;
  onAttachmentStatusChange: (messageId: string, attachmentId: string, status: AttachmentScanStatus) => void;
}

function attachmentErrorMessage(error: string): string {
  switch (error) {
    case "UNSUPPORTED_FILE_TYPE":
      return "Ese tipo de archivo no está permitido";
    case "FILE_TOO_LARGE":
      return "El archivo supera el límite de 10 MB";
    case "QUOTA_EXCEEDED":
      return "Se alcanzó la cuota de almacenamiento del workspace este mes";
    default:
      return error || "Error al adjuntar el archivo";
  }
}

export function MessageComposer({ channelId, onSent, onAttachmentStatusChange }: MessageComposerProps) {
  const [value, setValue] = useState("");
  const [sending, startSending] = useTransition();
  // Transición separada de la del texto: subir un archivo puede tardar
  // bastante (TUS de hasta 10 MB) y no debe bloquear el envío de mensajes
  // de texto mientras tanto — startTransition() sigue siendo obligatorio
  // (misma razón que handleSend), pero cada flujo tiene la suya.
  const [, startUploading] = useTransition();
  const [uploadingFileName, setUploadingFileName] = useState<string | null>(null);
  const [uploadPercent, setUploadPercent] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleSend() {
    const trimmed = value.trim();
    if (!trimmed || sending) return;

    // Server Actions llamadas fuera de un <form action> deben ir dentro de
    // startTransition — invocarlas directamente desde un handler async
    // suelto dispara "Cannot update a component (Router) while rendering a
    // different component" (confirmado en la revisión visual de Fase 1:
    // saltaba justo al enviar el primer mensaje), porque Next.js sincroniza
    // el router al resolver la acción y esa actualización choca con el
    // render en curso si no está enmarcada en una transición.
    startSending(async () => {
      const result = await sendMessage(channelId, trimmed);

      if (!result.ok) {
        toast.error(
          result.error === "RATE_LIMITED"
            ? "Estás enviando mensajes muy rápido — espera unos segundos"
            : result.error ?? "Error al enviar el mensaje",
        );
        return;
      }

      setValue("");
      onSent(result.data);
      textareaRef.current?.focus();
    });
  }

  function handleFileSelected(file: File) {
    if (uploadingFileName) return;

    if (!(TEAM_CHAT_ALLOWED_MIME_TYPES as readonly string[]).includes(file.type)) {
      toast.error("Ese tipo de archivo no está permitido");
      return;
    }
    if (file.size > TEAM_CHAT_ATTACHMENT_MAX_BYTES) {
      toast.error("El archivo supera el límite de 10 MB");
      return;
    }

    setUploadingFileName(file.name);
    setUploadPercent(0);

    startUploading(async () => {
      const begin = await beginAttachmentUpload(channelId, file.name, file.type, file.size);
      if (!begin.ok) {
        toast.error(attachmentErrorMessage(begin.error));
        setUploadingFileName(null);
        return;
      }

      onSent(begin.data.message);

      const uploadResult = await uploadAttachmentFile(file, begin.data.objectPath, (progress) => {
        setUploadPercent(progress.bytesTotal > 0 ? Math.round((progress.bytesUploaded / progress.bytesTotal) * 100) : 0);
      });

      if (!uploadResult.ok) {
        toast.error("Error al subir el archivo");
        await cancelAttachmentUpload(begin.data.attachmentId);
        onAttachmentStatusChange(begin.data.message.id, begin.data.attachmentId, "error");
        setUploadingFileName(null);
        return;
      }

      const finalized = await finalizeAttachmentUpload(begin.data.attachmentId);
      if (finalized.ok) {
        onAttachmentStatusChange(begin.data.message.id, begin.data.attachmentId, finalized.data.status);
        if (finalized.data.status !== "clean") {
          toast.error("El archivo fue rechazado tras el análisis de seguridad");
        }
      } else {
        toast.error(finalized.error ?? "Error al finalizar el escaneo del archivo");
      }

      setUploadingFileName(null);
    });
  }

  return (
    <div
      className="flex flex-col gap-1.5 border-t border-border/60 bg-background px-3 py-2"
      style={{ paddingBottom: "max(0.5rem, env(safe-area-inset-bottom))" }}
    >
      {uploadingFileName && (
        <div className="flex items-center gap-2 rounded-md bg-muted/50 px-2.5 py-1.5 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
          <span className="flex-1 truncate">
            Subiendo {uploadingFileName}… {uploadPercent}%
          </span>
        </div>
      )}
      <div className="flex items-end gap-2">
        <input
          ref={fileInputRef}
          type="file"
          hidden
          accept={(TEAM_CHAT_ALLOWED_MIME_TYPES as readonly string[]).join(",")}
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) handleFileSelected(file);
          }}
        />
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="h-10 w-10 shrink-0"
          onClick={() => fileInputRef.current?.click()}
          disabled={Boolean(uploadingFileName)}
          aria-label="Adjuntar archivo"
        >
          {uploadingFileName ? <X className="h-4 w-4 opacity-40" /> : <Paperclip className="h-4 w-4" />}
        </Button>
        <Textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
          placeholder="Escribe un mensaje..."
          maxLength={TEAM_MESSAGE_MAX_LENGTH}
          className="min-h-10 max-h-32 flex-1 resize-none text-sm"
          aria-label="Escribe un mensaje"
        />
        <Button
          size="icon"
          className="h-10 w-10 shrink-0"
          onClick={handleSend}
          disabled={sending || !value.trim()}
          aria-label="Enviar mensaje"
        >
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
