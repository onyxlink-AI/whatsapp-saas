"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { MoreVertical, Pencil, Trash2, FileText, FileSpreadsheet, Image as ImageIcon, Download, Loader2, ShieldAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { editMessage, deleteMessageLogical } from "@/features/team-chat/services/team-chat-actions";
import { getAttachmentDownloadUrl } from "@/features/team-chat/services/team-chat-attachments";
import type { TeamMessageAttachment, TeamMessageRow } from "@/features/team-chat/types";

interface MessageBubbleProps {
  message: TeamMessageRow;
  isOwn: boolean;
  senderName: string;
}

function formatTime(iso: string) {
  return new Intl.DateTimeFormat("es-MX", { hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function AttachmentBlock({ attachment, isOwn }: { attachment: TeamMessageAttachment; isOwn: boolean }) {
  const [downloading, setDownloading] = useState(false);
  const mime = attachment.declared_mime;
  const Icon = mime.startsWith("image/") ? ImageIcon : mime.includes("sheet") || mime.includes("excel") ? FileSpreadsheet : FileText;

  async function handleDownload() {
    if (downloading) return;
    setDownloading(true);
    try {
      const result = await getAttachmentDownloadUrl(attachment.id);
      if (!result.ok) {
        toast.error(result.error === "ATTACHMENT_NOT_READY" ? "El archivo todavía no está disponible" : result.error);
        return;
      }
      window.open(result.data.url, "_blank", "noopener,noreferrer");
    } finally {
      setDownloading(false);
    }
  }

  if (attachment.scan_status === "pending") {
    return (
      <div className={cn("flex items-center gap-2 rounded-lg px-3 py-2 max-w-[280px]", isOwn ? "bg-primary-foreground/10" : "bg-background/60")}>
        <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
        <span className="min-w-0 flex-1 truncate text-xs">Analizando archivo…</span>
      </div>
    );
  }

  if (attachment.scan_status !== "clean") {
    return (
      <div className={cn("flex items-center gap-2 rounded-lg px-3 py-2 max-w-[280px]", isOwn ? "bg-primary-foreground/10" : "bg-background/60")}>
        <ShieldAlert className="h-4 w-4 shrink-0 text-destructive" />
        <span className="min-w-0 flex-1 truncate text-xs">Archivo rechazado</span>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={handleDownload}
      disabled={downloading}
      className={cn(
        "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left transition-colors max-w-[280px]",
        isOwn ? "bg-primary-foreground/10 hover:bg-primary-foreground/20" : "bg-background/60 hover:bg-background",
      )}
    >
      <Icon className="h-4 w-4 shrink-0" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-xs font-medium">{attachment.file_name}</span>
        <span className="block text-[10px] opacity-70">{formatBytes(attachment.byte_size)}</span>
      </span>
      {downloading ? <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" /> : <Download className="h-3.5 w-3.5 shrink-0" />}
    </button>
  );
}

export function MessageBubble({ message, isOwn, senderName }: MessageBubbleProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(message.body);
  const [confirmDelete, setConfirmDelete] = useState(false);
  // Server Actions invocadas fuera de un <form action> deben ir dentro de
  // startTransition (mismo motivo que message-composer.tsx): llamarlas
  // directamente desde un handler async suelto puede disparar "Cannot
  // update a component (Router) while rendering a different component".
  const [busy, startBusy] = useTransition();

  const isDeleted = Boolean(message.deleted_at);

  function handleSaveEdit() {
    const trimmed = draft.trim();
    if (!trimmed) {
      toast.error("El mensaje no puede estar vacío");
      return;
    }
    startBusy(async () => {
      const result = await editMessage(message.id, trimmed);
      if (!result.ok) {
        toast.error(result.error === "RATE_LIMITED" ? "Estás enviando mensajes muy rápido" : result.error ?? "Error al editar");
        return;
      }
      setEditing(false);
    });
  }

  function handleDelete() {
    startBusy(async () => {
      const result = await deleteMessageLogical(message.id);
      setConfirmDelete(false);
      if (!result.ok) {
        toast.error(result.error ?? "Error al eliminar");
      }
    });
  }

  return (
    <div className={cn("flex flex-col gap-0.5", isOwn ? "items-end" : "items-start")}>
      {!isOwn && <span className="text-[10px] text-muted-foreground px-1">{senderName}</span>}
      <div
        className={cn(
          "group relative max-w-[75%] rounded-lg px-3 py-2 text-sm",
          isOwn ? "bg-primary text-primary-foreground" : "surface-subtle text-foreground",
          isDeleted && "italic opacity-60",
        )}
      >
        {isDeleted ? (
          <span>Mensaje eliminado</span>
        ) : editing ? (
          <div className="space-y-2">
            <Textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              className="min-h-16 text-sm text-foreground"
              autoFocus
            />
            <div className="flex justify-end gap-1.5">
              <Button size="sm" variant="ghost" className="h-6 text-[11px]" onClick={() => setEditing(false)} disabled={busy}>
                Cancelar
              </Button>
              <Button size="sm" className="h-6 text-[11px]" onClick={handleSaveEdit} disabled={busy}>
                Guardar
              </Button>
            </div>
          </div>
        ) : (
          <>
            {message.attachment ? (
              <AttachmentBlock attachment={message.attachment} isOwn={isOwn} />
            ) : (
              <p className="whitespace-pre-wrap break-words">{message.body}</p>
            )}
            <span
              className={cn(
                "mt-1 block text-[10px]",
                isOwn ? "text-primary-foreground/70" : "text-muted-foreground",
              )}
            >
              {formatTime(message.created_at)}
              {message.edited_at && " · editado"}
            </span>
          </>
        )}

        {isOwn && !isDeleted && !editing && (
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="absolute -left-8 top-1 h-6 w-6 opacity-0 group-hover:opacity-100"
                aria-label="Más opciones del mensaje"
              >
                <MoreVertical className="h-3.5 w-3.5" />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-40 p-1">
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs hover:bg-muted"
              >
                <Pencil className="h-3.5 w-3.5" /> Editar
              </button>
              {confirmDelete ? (
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={busy}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs text-destructive hover:bg-destructive/10"
                >
                  <Trash2 className="h-3.5 w-3.5" /> Confirmar eliminar
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmDelete(true)}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs text-destructive hover:bg-destructive/10"
                >
                  <Trash2 className="h-3.5 w-3.5" /> Eliminar
                </button>
              )}
            </PopoverContent>
          </Popover>
        )}
      </div>
    </div>
  );
}
