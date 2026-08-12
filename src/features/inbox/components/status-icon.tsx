import { AlertCircle, Check, CheckCheck, Clock } from "lucide-react";
import type { MessageStatus } from "@/features/inbox/types";
import { cn } from "@/lib/utils";

interface StatusIconProps {
  status: MessageStatus | null;
  meta?: Record<string, unknown> | null;
}

function failureLabel(meta: Record<string, unknown> | null | undefined): string {
  const code =
    typeof meta?.ycloud_error_code === "string"
      ? meta.ycloud_error_code.trim()
      : "";
  const detail =
    typeof meta?.ycloud_error_message === "string"
      ? meta.ycloud_error_message.trim()
      : typeof meta?.error === "string"
        ? meta.error.trim()
        : "";

  if (code && detail) return `Fallido (${code}): ${detail}`;
  if (detail) return `Fallido: ${detail}`;
  if (code) return `Fallido (${code})`;
  return "Fallido. Consulta el estado del mensaje en YCloud.";
}

export function StatusIcon({ status, meta }: StatusIconProps) {
  if (!status) return null;

  switch (status) {
    case "queued":
      return (
        <Clock
          className={cn("h-3 w-3 shrink-0 opacity-50")}
          aria-label="En cola"
        />
      );
    case "sent":
      return (
        <Check
          className={cn("h-3 w-3 shrink-0 opacity-60")}
          aria-label="Enviado"
        />
      );
    case "delivered":
      return (
        <CheckCheck
          className={cn("h-3 w-3 shrink-0 opacity-60")}
          aria-label="Entregado"
        />
      );
    case "read":
      return (
        <CheckCheck
          className={cn("h-3 w-3 shrink-0 text-primary")}
          aria-label="Leído"
        />
      );
    case "failed":
      const label = failureLabel(meta);
      return (
        <span
          className="inline-flex cursor-help"
          title={label}
          aria-label={label}
        >
          <AlertCircle
            className={cn("h-3 w-3 shrink-0 text-destructive")}
            aria-hidden="true"
          />
        </span>
      );
    default:
      return null;
  }
}
