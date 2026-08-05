"use client";

import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Send } from "lucide-react";
import { sendMessage } from "@/features/team-chat/services/team-chat-actions";
import { TEAM_MESSAGE_MAX_LENGTH } from "@/features/team-chat/types";
import type { TeamMessageRow } from "@/features/team-chat/types";

interface MessageComposerProps {
  channelId: string;
  onSent: (message: TeamMessageRow) => void;
}

export function MessageComposer({ channelId, onSent }: MessageComposerProps) {
  const [value, setValue] = useState("");
  const [sending, startSending] = useTransition();
  const textareaRef = useRef<HTMLTextAreaElement>(null);

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

  return (
    <div
      className="flex items-end gap-2 border-t border-border/60 bg-background px-3 py-2"
      style={{ paddingBottom: "max(0.5rem, env(safe-area-inset-bottom))" }}
    >
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
  );
}
