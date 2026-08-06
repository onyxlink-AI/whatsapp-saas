"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { ArrowLeft, MessageSquareOff, WifiOff, Loader2 } from "lucide-react";
import {
  getChannelMessages,
  markChannelRead,
  type MessagePage,
} from "@/features/team-chat/services/team-chat-actions";
import { useTeamChatRealtime } from "@/features/team-chat/hooks/use-team-chat-realtime";
import { MessageBubble } from "./message-bubble";
import { MessageComposer } from "./message-composer";
import type { AttachmentScanStatus, TeamChannelSummary } from "@/features/team-chat/types";
import type { WorkspaceMember } from "@/features/projects/services/project-actions";

interface MessageThreadProps {
  channel: TeamChannelSummary;
  currentUserId: string;
  members: WorkspaceMember[];
  onBack?: () => void;
  onRead: (channelId: string) => void;
  onMessageActivity: (channelId: string, preview: string, at: string) => void;
}

export function MessageThread({ channel, currentUserId, members, onBack, onRead, onMessageActivity }: MessageThreadProps) {
  const [page, setPage] = useState<MessagePage | null>(null);
  const [loadingMore, startLoadingMore] = useTransition();
  const scrollRef = useRef<HTMLDivElement>(null);
  const isFirstLoad = useRef(true);

  const senderName = (userId: string) =>
    userId === currentUserId ? "Tú" : members.find((m) => m.user_id === userId)?.full_name ?? "Miembro";

  useEffect(() => {
    isFirstLoad.current = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- clears the previous channel's messages immediately when switching conversations, before the new channel's fetch resolves.
    setPage(null);
    getChannelMessages(channel.id).then((loaded) => {
      setPage(loaded);
    });
    void markChannelRead(channel.id);
    onRead(channel.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channel.id]);

  useEffect(() => {
    if (page && isFirstLoad.current) {
      isFirstLoad.current = false;
      requestAnimationFrame(() => {
        scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
      });
    }
  }, [page]);

  const realtimeStatus = useTeamChatRealtime(
    channel.id,
    (message) => {
      // El updater de setPage debe ser puro — React puede invocarlo durante
      // el render, así que llamar aquí dentro a markChannelRead() (una
      // Server Action, con efectos de red) es lo que disparaba "Cannot
      // update a component (Router) while rendering a different component"
      // (confirmado en la revisión visual de Fase 1, al recibir un mensaje
      // por Realtime). El side effect se calcula y dispara fuera, con el
      // estado de scroll leído antes de tocar setPage.
      const atBottom =
        scrollRef.current &&
        scrollRef.current.scrollHeight - scrollRef.current.scrollTop - scrollRef.current.clientHeight < 80;

      setPage((prev) => {
        if (!prev) return prev;
        if (prev.messages.some((m) => m.id === message.id)) return prev;
        return { ...prev, messages: [...prev.messages, message] };
      });
      onMessageActivity(channel.id, message.body, message.created_at);

      if (atBottom) {
        requestAnimationFrame(() => scrollRef.current?.scrollTo({ top: scrollRef.current!.scrollHeight, behavior: "smooth" }));
        void markChannelRead(channel.id);
      }
    },
    (updated) => {
      setPage((prev) =>
        prev ? { ...prev, messages: prev.messages.map((m) => (m.id === updated.id ? updated : m)) } : prev,
      );
    },
  );

  // Actualización optimista local del propio uploader mientras espera el
  // broadcast "message_updated" (que también le llega a él, ver
  // team-chat-broadcast.ts) — idempotente frente a esa segunda entrega, así
  // que no hace falta desduplicar aquí.
  function handleAttachmentStatusChange(messageId: string, attachmentId: string, status: AttachmentScanStatus) {
    setPage((prev) =>
      prev
        ? {
            ...prev,
            messages: prev.messages.map((m) =>
              m.id === messageId && m.attachment?.id === attachmentId ? { ...m, attachment: { ...m.attachment, scan_status: status } } : m,
            ),
          }
        : prev,
    );
  }

  function handleLoadMore() {
    if (!page?.nextCursor || loadingMore) return;
    startLoadingMore(async () => {
      const older = await getChannelMessages(channel.id, page.nextCursor);
      const el = scrollRef.current;
      const prevHeight = el?.scrollHeight ?? 0;
      setPage((prev) => (prev ? { messages: [...older.messages, ...prev.messages], nextCursor: older.nextCursor } : prev));
      requestAnimationFrame(() => {
        if (el) el.scrollTop = el.scrollHeight - prevHeight;
      });
    });
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-border/60 px-3 py-2.5">
        {onBack && (
          <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={onBack} aria-label="Volver a conversaciones">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{channel.displayName}</p>
          {realtimeStatus !== "connected" && (
            <p className="flex items-center gap-1 text-[10px] text-muted-foreground">
              <WifiOff className="h-3 w-3" />
              {realtimeStatus === "connecting" && "Conectando…"}
              {realtimeStatus === "reconnecting" && "Reconectando…"}
              {realtimeStatus === "disconnected" && "Sin conexión"}
            </p>
          )}
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 space-y-2 overflow-y-auto px-3 py-3">
        {!page ? (
          <div className="flex h-full items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : page.messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
            <MessageSquareOff className="h-6 w-6 text-muted-foreground" />
            <p className="text-xs text-muted-foreground">Todavía no hay mensajes — sé el primero en escribir</p>
          </div>
        ) : (
          <>
            {page.nextCursor && (
              <div className="flex justify-center pb-2">
                <Button variant="ghost" size="sm" className="h-7 text-[11px]" onClick={handleLoadMore} disabled={loadingMore}>
                  {loadingMore ? <Loader2 className="h-3 w-3 animate-spin" /> : "Cargar mensajes anteriores"}
                </Button>
              </div>
            )}
            {page.messages.map((message) => (
              <MessageBubble
                key={message.id}
                message={message}
                isOwn={message.sender_id === currentUserId}
                senderName={senderName(message.sender_id)}
              />
            ))}
          </>
        )}
      </div>

      <MessageComposer
        channelId={channel.id}
        onSent={(message) => {
          setPage((prev) => (prev ? { ...prev, messages: [...prev.messages, message] } : prev));
          onMessageActivity(channel.id, message.body, message.created_at);
        }}
        onAttachmentStatusChange={handleAttachmentStatusChange}
      />
    </div>
  );
}
