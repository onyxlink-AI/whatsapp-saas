"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { TeamMessageRow } from "@/features/team-chat/types";

export type RealtimeStatus = "connecting" | "connected" | "reconnecting" | "disconnected";

/**
 * Una conexión Broadcast privada por canal abierto — el cliente solo
 * recibe (nunca emite): el servidor ya persistió el mensaje y emitió el
 * evento por su cuenta (ver team-chat-actions.ts). Se limpia con
 * removeChannel() al desmontar o cambiar de canal, igual que
 * use-realtime-messages.ts en Inbox.
 */
export function useTeamChatRealtime(
  channelId: string | null,
  onNewMessage: (message: TeamMessageRow) => void,
  onMessageUpdated: (message: TeamMessageRow) => void,
): RealtimeStatus {
  const [status, setStatus] = useState<RealtimeStatus>("connecting");
  const onNewRef = useRef(onNewMessage);
  const onUpdatedRef = useRef(onMessageUpdated);

  useEffect(() => {
    onNewRef.current = onNewMessage;
    onUpdatedRef.current = onMessageUpdated;
  });

  useEffect(() => {
    if (!channelId) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- resets the badge to "connecting" the instant the channel prop changes, before the new subscription's first status callback arrives.
    setStatus("connecting");
    const supabase = createClient();

    const channel = supabase
      .channel(`team:${channelId}`, { config: { private: true } })
      .on("broadcast", { event: "new_message" }, ({ payload }) => {
        onNewRef.current(payload as TeamMessageRow);
      })
      .on("broadcast", { event: "message_updated" }, ({ payload }) => {
        onUpdatedRef.current(payload as TeamMessageRow);
      })
      .subscribe((subStatus) => {
        if (subStatus === "SUBSCRIBED") setStatus("connected");
        else if (subStatus === "CHANNEL_ERROR" || subStatus === "TIMED_OUT") setStatus("reconnecting");
        else if (subStatus === "CLOSED") setStatus("disconnected");
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [channelId]);

  return status;
}
