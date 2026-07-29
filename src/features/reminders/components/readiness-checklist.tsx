"use client";

import Link from "next/link";
import { CheckCircle2, Circle } from "lucide-react";
import type { ReminderReadiness } from "@/features/reminders/services/readiness";

export function ReadinessChecklist({
  workspaceId,
  readiness,
}: {
  workspaceId: string;
  readiness: ReminderReadiness;
}) {
  const items: { label: string; ok: boolean; hint?: string }[] = [
    { label: "Agente configurado", ok: readiness.agentConfigured, hint: "Activa un agente en la pestaña 🤖 Agentes." },
    { label: "OpenRouter disponible", ok: readiness.openRouterAvailable, hint: "Conecta OpenRouter en Ajustes → Integraciones." },
    { label: "WhatsApp conectado", ok: readiness.whatsappConnected, hint: "Conecta WhatsApp (YCloud) en Ajustes → Integraciones." },
    { label: "Agenda conectada", ok: readiness.agendaConnected, hint: "Conecta Google Calendar o HighLevel y elígela como origen de citas." },
  ];

  return (
    <div className="space-y-2 rounded-lg border border-border/60 p-4">
      <p className="text-sm font-medium text-foreground">Requisitos para activar</p>
      <ul className="space-y-1.5">
        {items.map((item) => (
          <li key={item.label} className="flex items-start gap-2 text-xs">
            {item.ok ? (
              <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" aria-hidden="true" />
            ) : (
              <Circle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
            )}
            <span className={item.ok ? "text-foreground" : "text-muted-foreground"}>
              {item.label}
              {!item.ok && item.hint && (
                <>
                  {" — "}
                  {item.hint}{" "}
                  <Link
                    href={`/settings?tab=integraciones`}
                    className="underline underline-offset-2 hover:text-foreground"
                  >
                    Ir a Ajustes → Integraciones
                  </Link>
                </>
              )}
            </span>
          </li>
        ))}
      </ul>
      {!readiness.ready && (
        <p className="pt-1 text-xs text-amber-600 dark:text-amber-400">
          ⚠️ Mientras falte algún requisito, no se enviará ningún mensaje real — la
          simulación sí funciona.
        </p>
      )}
    </div>
  );
}
