"use client";

import { useState, useTransition } from "react";
import type { ChatTurn } from "@/features/help-assistant/types";

export interface HelpAssistantMessage extends ChatTurn {
  id: string;
}

export function useHelpAssistantChat(workspaceId: string) {
  const [messages, setMessages] = useState<HelpAssistantMessage[]>([]);
  const [quota, setQuota] = useState<{ used: number; limit: number } | null>(null);
  const [blocked, setBlocked] = useState(false);
  const [isPending, startTransition] = useTransition();

  function sendMessage(text: string) {
    const trimmed = text.trim();
    if (!trimmed || isPending) return;

    const history: ChatTurn[] = messages.map(({ role, content }) => ({ role, content }));
    setMessages((prev) => [...prev, { id: crypto.randomUUID(), role: "user", content: trimmed }]);

    startTransition(async () => {
      try {
        const res = await fetch(`/api/workspace/${workspaceId}/help-assistant`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: trimmed, history }),
        });
        const data = await res.json();

        if (res.status === 429) {
          setBlocked(true);
          setQuota({ used: data.used, limit: data.limit });
          return;
        }
        if (!res.ok) {
          setMessages((prev) => [
            ...prev,
            { id: crypto.randomUUID(), role: "assistant", content: "Hubo un error, intenta de nuevo." },
          ]);
          return;
        }

        setQuota({ used: data.used, limit: data.limit });
        setMessages((prev) => [
          ...prev,
          { id: crypto.randomUUID(), role: "assistant", content: data.text },
        ]);
      } catch {
        setMessages((prev) => [
          ...prev,
          { id: crypto.randomUUID(), role: "assistant", content: "Hubo un error, intenta de nuevo." },
        ]);
      }
    });
  }

  return { messages, quota, blocked, isPending, sendMessage };
}
