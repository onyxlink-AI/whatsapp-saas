"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Check, RotateCw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ConfirmationCardMessage } from "@/features/help-assistant/hooks/use-help-assistant-chat";

interface ConfirmationCardProps {
  card: ConfirmationCardMessage;
  onResolve: (decision: "confirm" | "cancel") => void;
}

function secondsLeft(expiresAt: number): number {
  return Math.max(0, Math.round((expiresAt - Date.now()) / 1000));
}

/**
 * Fase 4B: tarjeta compacta de Confirmar/Cancelar para una acción
 * destructiva preparada por el Asistente de Ayuda. Ancho fijo del panel
 * (sm:max-w-sm) — nada aquí usa scroll horizontal, todo se apila en
 * columna para caber en móvil sin desbordar.
 *
 * "retryable" (revisión correctiva): un fallo de TRANSPORTE (nunca hubo
 * respuesta HTTP) conserva el token y ofrece "Reintentar" — repite
 * exactamente la misma decisión (card.lastDecision) — junto a "Cancelar"
 * como alternativa siempre segura. La resolución en el servidor es
 * idempotente, así que reintentar nunca duplica el efecto.
 */
export function ConfirmationCard({ card, onResolve }: ConfirmationCardProps) {
  const [remaining, setRemaining] = useState(() => secondsLeft(card.expiresAt));

  useEffect(() => {
    if (card.status !== "pending") return;
    const interval = setInterval(() => setRemaining(secondsLeft(card.expiresAt)), 1000);
    return () => clearInterval(interval);
  }, [card.expiresAt, card.status]);

  const isPending = card.status === "pending";
  const isRetryable = card.status === "retryable";
  const isResolving = card.status === "resolving";
  const active = isPending || isRetryable;
  const expired = isPending && remaining <= 0;
  const disabled = !active || expired;

  const primaryLabel = isResolving
    ? card.lastDecision === "cancel"
      ? "Cancelando..."
      : "Confirmando..."
    : isRetryable
      ? "Reintentar"
      : "Confirmar";

  function handlePrimary() {
    onResolve(isRetryable ? (card.lastDecision ?? "confirm") : "confirm");
  }

  return (
    <div className="mr-auto max-w-[92%] rounded-lg border border-border/60 bg-background/80 px-3 py-2.5 text-sm space-y-2">
      <div className="flex items-start gap-2">
        <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-amber-500" aria-hidden="true" />
        <p className="min-w-0 break-words">{card.summary}</p>
      </div>

      {isPending && (
        <p className="text-[11px] text-muted-foreground">
          {expired ? "Caducó — ya no se puede confirmar." : `Caduca en ${remaining}s`}
        </p>
      )}

      {card.resultText && !isResolving && (
        <p
          className={cn(
            "text-xs",
            card.status === "error" ? "text-destructive" : isRetryable ? "text-amber-600" : "text-muted-foreground",
          )}
        >
          {card.resultText}
        </p>
      )}

      {card.status !== "resolved" && (
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            className="h-7 text-xs gap-1 flex-1"
            onClick={handlePrimary}
            disabled={disabled}
            aria-label={isRetryable ? "Reintentar acción" : "Confirmar acción"}
          >
            {isRetryable ? <RotateCw className="h-3.5 w-3.5" /> : <Check className="h-3.5 w-3.5" />}
            {primaryLabel}
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs gap-1 flex-1"
            onClick={() => onResolve("cancel")}
            disabled={disabled}
            aria-label="Cancelar acción"
          >
            <X className="h-3.5 w-3.5" />
            Cancelar
          </Button>
        </div>
      )}
    </div>
  );
}
