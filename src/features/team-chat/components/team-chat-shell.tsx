"use client";

import { useState } from "react";
import { MessagesSquare } from "lucide-react";
import { cn } from "@/lib/utils";
import { ConversationList } from "./conversation-list";
import { MessageThread } from "./message-thread";
import type { TeamChannelSummary } from "@/features/team-chat/types";
import type { TeammateOption } from "@/features/team-chat/services/team-chat-actions";
import type { WorkspaceMember } from "@/features/projects/services/project-actions";

interface TeamChatShellProps {
  workspaceId: string;
  currentUserId: string;
  initialChannels: TeamChannelSummary[];
  teammates: TeammateOption[];
  members: WorkspaceMember[];
}

export function TeamChatShell({
  workspaceId,
  currentUserId,
  initialChannels,
  teammates,
  members,
}: TeamChatShellProps) {
  const [channels, setChannels] = useState(initialChannels);
  const [selectedChannelId, setSelectedChannelId] = useState<string | null>(null);

  const selectedChannel = channels.find((c) => c.id === selectedChannelId) ?? null;

  function handleRead(channelId: string) {
    setChannels((prev) => prev.map((c) => (c.id === channelId ? { ...c, unreadCount: 0 } : c)));
  }

  function handleMessageActivity(channelId: string, preview: string, at: string) {
    setChannels((prev) =>
      prev.map((c) => (c.id === channelId ? { ...c, lastMessagePreview: preview, lastMessageAt: at } : c)),
    );
  }

  function handleChannelOpened(channelId: string, otherUserId: string) {
    setSelectedChannelId(channelId);
    if (!channels.some((c) => c.id === channelId)) {
      // DM recién creado — todavía no está en la lista local; se completa
      // en el próximo refresh del servidor, mientras tanto entra con el
      // nombre real (ya lo conocemos por la lista de compañeros) para no
      // dejar la pantalla con un nombre genérico.
      setChannels((prev) => [
        ...prev,
        {
          id: channelId,
          kind: "direct",
          displayName: teammates.find((t) => t.user_id === otherUserId)?.full_name ?? "Conversación",
          otherUserId,
          lastMessagePreview: null,
          lastMessageAt: null,
          unreadCount: 0,
        },
      ]);
    }
  }

  return (
    <div className="flex h-[calc(100vh-4rem)] overflow-hidden rounded-lg border border-border/60">
      <div className={cn("w-full shrink-0 border-r border-border/60 md:w-80", selectedChannelId ? "hidden md:block" : "block")}>
        <ConversationList
          workspaceId={workspaceId}
          channels={channels}
          teammates={teammates}
          selectedChannelId={selectedChannelId}
          onSelect={(channel) => setSelectedChannelId(channel.id)}
          onChannelOpened={handleChannelOpened}
        />
      </div>

      <div className={cn("min-w-0 flex-1", selectedChannelId ? "block" : "hidden md:block")}>
        {selectedChannel ? (
          <MessageThread
            key={selectedChannel.id}
            channel={selectedChannel}
            currentUserId={currentUserId}
            members={members}
            onBack={() => setSelectedChannelId(null)}
            onRead={handleRead}
            onMessageActivity={handleMessageActivity}
          />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-muted-foreground">
            <MessagesSquare className="h-8 w-8" />
            <p className="text-sm">Elige una conversación para empezar</p>
          </div>
        )}
      </div>
    </div>
  );
}
