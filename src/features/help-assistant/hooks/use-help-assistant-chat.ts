"use client";

import { useState, useTransition } from "react";
import type { ChatTurn } from "@/features/help-assistant/types";

/**
 * Fase 4B: dos tipos de mensaje en el mismo hilo visual.
 *
 * - "text": turno real de la conversación — el único que se reenvía como
 *   `history` al servidor/LLM.
 * - "confirmation": tarjeta de Confirmar/Cancelar y su resultado. Es
 *   puramente local — nunca se serializa como ChatTurn ni se envía de
 *   vuelta al modelo. Esto es intencional: el modelo nunca ve el token
 *   (nunca lo tuvo — ver pending-actions.ts) ni necesita "recordar" nada
 *   sobre la confirmación entre mensajes; toda la decisión vive en el
 *   servidor, identificada por el token, resuelta por un endpoint que no
 *   pasa por el LLM (POST .../help-assistant/confirm).
 *
 * "retryable" (revisión correctiva): un error de TRANSPORTE (nunca llegó
 * a haber respuesta HTTP — red caída, timeout, JSON roto) nunca debe
 * vaciar el token ni dejar la tarjeta muerta — la resolución en el
 * servidor es idempotente (ver resolve_assistant_pending_action, que
 * reconcilia un reintento contra una fila ya resuelta), así que reintentar
 * con el MISMO token es siempre seguro. Solo se pasa a "error" (terminal,
 * token descartado) cuando SÍ hubo una respuesta HTTP completa — esa sí es
 * una respuesta real y determinista del servidor, reintentar no cambiaría
 * nada.
 */
export type ConfirmationCardStatus = "pending" | "resolving" | "resolved" | "error" | "retryable";

export interface TextMessage extends ChatTurn {
  id: string;
  kind: "text";
}

export interface ConfirmationCardMessage {
  id: string;
  kind: "confirmation";
  role: "assistant";
  token: string;
  summary: string;
  expiresAt: number; // epoch ms
  status: ConfirmationCardStatus;
  /** Necesaria para que el botón "Reintentar" repita EXACTAMENTE la misma decisión tras un fallo de transporte. */
  lastDecision?: "confirm" | "cancel";
  /** Solo tras resolver o fallar el transporte — nunca antes. */
  resultText?: string;
}

export type HelpAssistantMessage = TextMessage | ConfirmationCardMessage;

export function useHelpAssistantChat(workspaceId: string) {
  const [messages, setMessages] = useState<HelpAssistantMessage[]>([]);
  const [quota, setQuota] = useState<{ used: number; limit: number } | null>(null);
  const [blocked, setBlocked] = useState(false);
  const [isPending, startTransition] = useTransition();

  function sendMessage(text: string) {
    const trimmed = text.trim();
    if (!trimmed || isPending) return;

    // Solo los turnos "text" cuentan como historial real — las tarjetas de
    // confirmación (y su resultado) son locales y nunca se reenvían como si
    // el usuario las hubiera escrito.
    const history: ChatTurn[] = messages
      .filter((m): m is TextMessage => m.kind === "text")
      .map(({ role, content }) => ({ role, content }));
    setMessages((prev) => [...prev, { id: crypto.randomUUID(), kind: "text", role: "user", content: trimmed }]);

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
            { id: crypto.randomUUID(), kind: "text", role: "assistant", content: "Hubo un error, intenta de nuevo." },
          ]);
          return;
        }

        setQuota({ used: data.used, limit: data.limit });
        setMessages((prev) => {
          const next: HelpAssistantMessage[] = [
            ...prev,
            { id: crypto.randomUUID(), kind: "text", role: "assistant", content: data.text },
          ];
          if (data.pendingConfirmation) {
            next.push({
              id: crypto.randomUUID(),
              kind: "confirmation",
              role: "assistant",
              token: data.pendingConfirmation.token,
              summary: data.pendingConfirmation.summary,
              expiresAt: Date.now() + data.pendingConfirmation.expiresInSeconds * 1000,
              status: "pending",
            });
          }
          return next;
        });
      } catch {
        setMessages((prev) => [
          ...prev,
          { id: crypto.randomUUID(), kind: "text", role: "assistant", content: "Hubo un error, intenta de nuevo." },
        ]);
      }
    });
  }

  function resolveConfirmation(cardId: string, decision: "confirm" | "cancel") {
    const card = messages.find((m): m is ConfirmationCardMessage => m.kind === "confirmation" && m.id === cardId);
    // "retryable" también puede reintentarse — es la única otra vía de
    // entrada válida además de "pending" (ver comentario de arriba).
    if (!card || (card.status !== "pending" && card.status !== "retryable")) return;

    setMessages((prev) =>
      prev.map((m) => (m.id === cardId && m.kind === "confirmation" ? { ...m, status: "resolving", lastDecision: decision } : m)),
    );

    void (async () => {
      let res: Response;
      try {
        res = await fetch(`/api/workspace/${workspaceId}/help-assistant/confirm`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token: card.token, decision }),
        });
      } catch {
        // Nunca hubo respuesta HTTP — no se sabe si el servidor llegó a
        // resolver el token o no. Conserva el token y deja la tarjeta
        // reintentable: la resolución en el servidor es idempotente, así
        // que reintentar con el mismo token es siempre seguro (si ya se
        // ejecutó, el servidor lo reconcilia como éxito la próxima vez).
        setMessages((prev) =>
          prev.map((m) =>
            m.id === cardId && m.kind === "confirmation"
              ? { ...m, status: "retryable", resultText: "No se pudo conectar. Puedes reintentar." }
              : m,
          ),
        );
        return;
      }

      let data: { ok?: boolean; error?: string };
      try {
        data = await res.json();
      } catch {
        // Hubo conexión pero la respuesta llegó rota — mismo tratamiento
        // que un fallo de transporte: no se sabe qué pasó, se conserva el
        // token.
        setMessages((prev) =>
          prev.map((m) =>
            m.id === cardId && m.kind === "confirmation"
              ? { ...m, status: "retryable", resultText: "No se pudo conectar. Puedes reintentar." }
              : m,
          ),
        );
        return;
      }

      // A partir de aquí SÍ hubo una respuesta HTTP completa y determinista
      // del servidor (incluida la reconciliación de un "already_resolved"
      // como éxito, que la ruta ya traduce a res.ok=true) — nunca es un
      // caso reintentable, el token deja de servir.
      const resultText = res.ok
        ? decision === "confirm"
          ? "Confirmado — la acción se realizó."
          : "Cancelado — no se hizo ningún cambio."
        : (data.error ?? "No se pudo procesar tu respuesta.");

      setMessages((prev) =>
        prev.map((m) =>
          m.id === cardId && m.kind === "confirmation"
            ? { ...m, status: res.ok ? "resolved" : "error", resultText, token: "" }
            : m,
        ),
      );
    })();
  }

  return { messages, quota, blocked, isPending, sendMessage, resolveConfirmation };
}
