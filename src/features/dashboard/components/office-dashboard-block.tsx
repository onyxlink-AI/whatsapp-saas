"use client";

// Bloque "solo Oficina Virtual" del dashboard (Paquete 6: hasGestion=false,
// hasWhatsappAgent=false, hasOfficeVirtual=true). Sin WhatsApp ni Gestión no
// hay conversaciones, tareas ni oportunidades que mostrar — el dashboard de
// este paquete es deliberadamente mínimo: el resumen de Oficina Virtual y
// los add-ons que tenga contratados, nada más.

import Link from "next/link";
import { ArrowRight, Bot, Network } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/page-header";
import { QuickAction } from "./primitives";
import { AddonWidgets } from "./addon-widgets";

interface Props {
  office: { configuredCount: number };
  addons: {
    teamChatUnread: number | null;
    vapiRecentCalls: number | null;
  };
}

export function OfficeDashboardBlock({ office, addons }: Props) {
  return (
    <div className="page-shell space-y-6">
      <PageHeader
        eyebrow="Centro de mando"
        title="Tu oficina virtual, de un vistazo"
        description="Consulta tu equipo de especialistas de IA y lo que tienen en marcha."
      />

      <section className="surface-card flex items-center justify-between gap-4 p-5">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Network className="h-5 w-5" aria-hidden="true" />
          </div>
          <div>
            <h2 className="font-display text-sm font-semibold text-foreground">Oficina Virtual</h2>
            <p className="text-xs text-muted-foreground">
              {office.configuredCount > 0
                ? `${office.configuredCount} especialista${office.configuredCount === 1 ? "" : "s"} configurado${office.configuredCount === 1 ? "" : "s"}.`
                : "Todavía no hay especialistas publicados."}
            </p>
          </div>
        </div>
        <Button asChild size="sm" variant="outline" className="min-h-11 sm:min-h-9">
          <Link href="/oficina-virtual">
            Abrir oficina
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </Button>
      </section>

      <section className="grid gap-3 sm:grid-cols-2">
        <QuickAction href="/oficina-virtual" icon={Bot} title="Abrir la oficina" description="Consulta tu equipo digital." />
      </section>

      <AddonWidgets teamChatUnread={addons.teamChatUnread} vapiRecentCalls={addons.vapiRecentCalls} />
    </div>
  );
}
