"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Hash, MessageSquarePlus, Plus, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  createTeamChannel,
  openDirectMessage,
  type TeammateOption,
} from "@/features/team-chat/services/team-chat-actions";
import { TEAM_CHANNEL_NAME_MAX_LENGTH, type TeamChannelSummary } from "@/features/team-chat/types";

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
}

interface ConversationListProps {
  workspaceId: string;
  channels: TeamChannelSummary[];
  teammates: TeammateOption[];
  selectedChannelId: string | null;
  onSelect: (channel: TeamChannelSummary) => void;
  onChannelOpened: (channelId: string, otherUserId: string) => void;
  onChannelCreated: (channelId: string, name: string) => void;
}

export function ConversationList({
  workspaceId,
  channels,
  teammates,
  selectedChannelId,
  onSelect,
  onChannelOpened,
  onChannelCreated,
}: ConversationListProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [channelDialogOpen, setChannelDialogOpen] = useState(false);
  const [channelName, setChannelName] = useState("");
  const [, startTransition] = useTransition();
  const [creatingChannel, startCreatingChannel] = useTransition();

  function handleStartDm(userId: string) {
    startTransition(async () => {
      const result = await openDirectMessage(workspaceId, userId);
      if (!result.ok) {
        toast.error(result.error ?? "Error al abrir el mensaje directo");
        return;
      }
      setPickerOpen(false);
      onChannelOpened(result.data.channelId, userId);
    });
  }

  function handleCreateChannel() {
    const trimmed = channelName.trim();
    if (!trimmed) return;
    startCreatingChannel(async () => {
      const result = await createTeamChannel(workspaceId, trimmed);
      if (!result.ok) {
        toast.error(
          result.error === "CHANNEL_NAME_TAKEN"
            ? "Ya existe un canal con ese nombre"
            : (result.error ?? "Error al crear el canal"),
        );
        return;
      }
      setChannelDialogOpen(false);
      setChannelName("");
      onChannelCreated(result.data.channelId, trimmed);
    });
  }

  const channelGroup = channels.filter((c) => c.kind === "general" || c.kind === "custom");
  const dmGroup = channels.filter((c) => c.kind === "direct");

  function renderChannel(channel: TeamChannelSummary) {
    return (
      <button
        key={channel.id}
        type="button"
        onClick={() => onSelect(channel)}
        className={cn(
          "flex w-full items-center gap-2.5 border-b border-border/30 px-3 py-2.5 text-left transition-colors hover:bg-muted/40",
          selectedChannelId === channel.id && "bg-muted/60",
        )}
      >
        {channel.kind === "direct" ? (
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[11px] font-semibold text-primary">
            {getInitials(channel.displayName)}
          </span>
        ) : (
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
            <Hash className="h-4 w-4" />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{channel.displayName}</p>
          <p className="truncate text-[11px] text-muted-foreground">
            {channel.lastMessagePreview ?? "Sin mensajes todavía"}
          </p>
        </div>
        {channel.unreadCount > 0 && (
          <Badge className="h-5 shrink-0 rounded-full px-1.5 text-[10px]">{channel.unreadCount}</Badge>
        )}
      </button>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border/60 px-3 py-2.5">
        <p className="text-sm font-semibold">Chat de equipo</p>
        <Popover open={menuOpen} onOpenChange={setMenuOpen}>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Nueva conversación">
              <Plus className="h-4 w-4" />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-48 p-1">
            <button
              type="button"
              onClick={() => {
                setMenuOpen(false);
                setChannelDialogOpen(true);
              }}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs hover:bg-muted"
            >
              <Hash className="h-3.5 w-3.5" /> Canal nuevo
            </button>
            <button
              type="button"
              onClick={() => {
                setMenuOpen(false);
                setPickerOpen(true);
              }}
              disabled={teammates.length === 0}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
            >
              <MessageSquarePlus className="h-3.5 w-3.5" /> Mensaje directo
            </button>
          </PopoverContent>
        </Popover>
      </div>

      {channels.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 px-4 text-center">
          <Users className="h-6 w-6 text-muted-foreground" />
          <p className="text-xs text-muted-foreground">Todavía no hay conversaciones</p>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto">
          {channelGroup.length > 0 && (
            <>
              <p className="px-3 pt-2.5 pb-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                Canales
              </p>
              {channelGroup.map(renderChannel)}
            </>
          )}
          {dmGroup.length > 0 && (
            <>
              <p className="px-3 pt-2.5 pb-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                Mensajes directos
              </p>
              {dmGroup.map(renderChannel)}
            </>
          )}
        </div>
      )}

      <Dialog open={channelDialogOpen} onOpenChange={setChannelDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Canal nuevo</DialogTitle>
            <DialogDescription>
              Abierto a todo el equipo desde que se crea — cualquiera lo verá en su lista.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              value={channelName}
              onChange={(e) => setChannelName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleCreateChannel();
              }}
              placeholder="Ej. Marketing"
              maxLength={TEAM_CHANNEL_NAME_MAX_LENGTH}
              autoFocus
            />
            <Button
              className="w-full"
              onClick={handleCreateChannel}
              disabled={creatingChannel || !channelName.trim()}
            >
              Crear canal
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Nuevo mensaje directo</DialogTitle>
            <DialogDescription>Elige a un compañero de equipo para empezar una conversación privada.</DialogDescription>
          </DialogHeader>
          <div className="max-h-72 space-y-1 overflow-y-auto">
            {teammates.map((mate) => (
              <button
                key={mate.user_id}
                type="button"
                onClick={() => handleStartDm(mate.user_id)}
                className="flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-left text-sm hover:bg-muted"
              >
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[10px] font-semibold text-primary">
                  {getInitials(mate.full_name)}
                </span>
                {mate.full_name}
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
