"use client";

// Revisión correctiva de Fase 2 (bloqueo #3): Chat de equipo y Vapi son
// add-ons independientes del paquete (§2.3) — su widget debe poder
// aparecer en CUALQUIER variante del dashboard (Gestión o combinado), no
// solo en el combinado. Extraído tal cual del bloque combinado para que
// ambas variantes monten exactamente el mismo componente.

import Link from "next/link";

interface Props {
  teamChatUnread: number | null;
  vapiRecentCalls: number | null;
}

export function AddonWidgets({ teamChatUnread, vapiRecentCalls }: Props) {
  if (teamChatUnread === null && vapiRecentCalls === null) return null;

  return (
    <section className="grid gap-3 sm:grid-cols-2">
      {teamChatUnread !== null && (
        <Link href="/chat" className="surface-card flex items-center justify-between gap-3 p-4 transition-colors hover:bg-muted/40">
          <span className="text-sm text-foreground">Chat de equipo</span>
          <span className="text-xs text-muted-foreground">{teamChatUnread > 0 ? `${teamChatUnread} sin leer` : "Sin pendientes"}</span>
        </Link>
      )}
      {vapiRecentCalls !== null && (
        <Link href="/asistente-ai" className="surface-card flex items-center justify-between gap-3 p-4 transition-colors hover:bg-muted/40">
          <span className="text-sm text-foreground">Agente de voz</span>
          <span className="text-xs text-muted-foreground">{vapiRecentCalls} llamada{vapiRecentCalls === 1 ? "" : "s"} reciente{vapiRecentCalls === 1 ? "" : "s"}</span>
        </Link>
      )}
    </section>
  );
}
