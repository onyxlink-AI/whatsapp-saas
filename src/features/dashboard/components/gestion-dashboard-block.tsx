"use client";

// Bloque "Gestión" del dashboard adaptativo (§4.2 — "dirigir el trabajo
// diario, no las conversaciones"). Reutiliza las primitivas del bloque
// WhatsApp (KpiCard/PriorityRow/QuickAction) — mismo lenguaje visual, datos
// distintos.

import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  Clock3,
  FolderKanban,
  ListChecks,
  Lightbulb,
  Plus,
  Workflow,
} from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { KpiCard, PriorityRow, QuickAction } from "./primitives";
import { AddonWidgets } from "./addon-widgets";
import type { GestionMetrics, UpcomingAgendaItem, StalledDeal } from "@/features/dashboard/services/gestion-metrics";

interface Props {
  metrics: GestionMetrics;
  upcomingAgenda: UpcomingAgendaItem[];
  stalledDeals: StalledDeal[];
  hasWhatsappAgent: boolean;
  /** Chat de equipo y Vapi son add-ons independientes del paquete (§2.3) — pueden estar contratados aunque el paquete sea solo Gestión. */
  addons: {
    teamChatUnread: number | null;
    vapiRecentCalls: number | null;
  };
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 }).format(value);
}

function formatDueDate(iso: string): string {
  return new Intl.DateTimeFormat("es-MX", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
}

export function GestionDashboardBlock({ metrics, upcomingAgenda, stalledDeals, hasWhatsappAgent, addons }: Props) {
  const needsAttention = metrics.tasksOverdue > 0;

  return (
    <div className="page-shell space-y-6">
      <PageHeader
        eyebrow="Centro de mando"
        title={needsAttention ? "Tienes tareas vencidas por resolver" : "Tu equipo, de un vistazo"}
        description={
          needsAttention
            ? "Revisa primero lo vencido y continúa con la agenda y las oportunidades del día."
            : "Prioridades del día, avance de proyectos y accesos rápidos a lo habitual."
        }
      />

      <section className="grid gap-4 xl:grid-cols-[1.25fr_0.75fr]">
        <div className="surface-card overflow-hidden">
          <div className="flex items-start justify-between gap-4 border-b border-border/60 px-5 py-4">
            <div>
              <h2 className="font-display text-base font-semibold text-foreground">Prioridades de hoy</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">Lo que necesita tu atención primero.</p>
            </div>
          </div>

          <div className="divide-y divide-border/50 p-2">
            {metrics.tasksOverdue > 0 ? (
              <PriorityRow
                icon={AlertTriangle}
                title={`${metrics.tasksOverdue} tarea${metrics.tasksOverdue === 1 ? "" : "s"} vencida${metrics.tasksOverdue === 1 ? "" : "s"}`}
                description="Ya pasó su fecha límite."
                tone="warning"
                href="/proyectos?view=tasks"
              />
            ) : (
              <PriorityRow icon={CheckCircle2} title="Sin tareas vencidas" description="Todo al día." tone="success" />
            )}

            <PriorityRow
              icon={Clock3}
              title={metrics.tasksToday > 0 ? `${metrics.tasksToday} tarea${metrics.tasksToday === 1 ? "" : "s"} para hoy` : "Nada vence hoy"}
              description="Tareas con fecha límite en el día de hoy."
              tone={metrics.tasksToday > 0 ? "primary" : "muted"}
              href="/proyectos?view=tasks"
            />

            {upcomingAgenda.length > 0 ? (
              upcomingAgenda.map((item) => (
                <PriorityRow
                  key={item.id}
                  icon={CalendarClock}
                  title={item.title}
                  description={`Agenda — ${formatDueDate(item.due_at)}`}
                  tone="primary"
                  href="/proyectos?view=agenda"
                />
              ))
            ) : (
              <PriorityRow icon={CalendarClock} title="Sin próximos eventos" description="Nada agendado en los próximos días." tone="muted" />
            )}

            {stalledDeals.map((deal) => (
              <PriorityRow
                key={deal.id}
                icon={Workflow}
                title={deal.title}
                description="Oportunidad sin movimiento reciente."
                tone="warning"
                href="/pipeline"
              />
            ))}

            {metrics.contentPendingCount > 0 && (
              <PriorityRow
                icon={Lightbulb}
                title={`${metrics.contentPendingCount} contenido${metrics.contentPendingCount === 1 ? "" : "s"} pendiente${metrics.contentPendingCount === 1 ? "" : "s"}`}
                description="Ideas o guiones todavía sin publicar."
                tone="muted"
                href="/contenido"
              />
            )}
          </div>
        </div>

        <div className="surface-subtle p-4 sm:p-5">
          <div>
            <h2 className="font-display text-base font-semibold text-foreground">Acciones rápidas</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">Accede directamente a las tareas más habituales.</p>
          </div>
          <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
            <QuickAction href="/proyectos?view=tasks" icon={Plus} title="Crear tarea" description="Añade un pendiente." />
            <QuickAction href="/proyectos?view=projects" icon={FolderKanban} title="Crear proyecto" description="Organiza una nueva entrega." />
            <QuickAction href="/pipeline" icon={Workflow} title="Crear oportunidad" description="Registra un negocio nuevo." />
            <QuickAction href="/contenido?view=ideas" icon={Lightbulb} title="Añadir idea" description="Anota una idea de contenido." />
            {!hasWhatsappAgent && (
              <QuickAction href="/proyectos?view=agenda" icon={CalendarClock} title="Abrir Agenda" description="Consulta tus próximos días." />
            )}
          </div>
        </div>
      </section>

      <section aria-label="Indicadores principales" className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          index={0}
          label="📁 Proyectos activos"
          value={metrics.projectsActiveCount.toLocaleString("es")}
          helper={`Progreso medio: ${metrics.projectsAvgProgress}%`}
          icon={FolderKanban}
          href="/proyectos?view=projects"
        />
        <KpiCard
          index={1}
          label="✅ Tareas pendientes"
          value={metrics.tasksPending.toLocaleString("es")}
          helper={metrics.tasksOverdue > 0 ? `${metrics.tasksOverdue} vencidas` : "Ninguna vencida"}
          icon={ListChecks}
          tone={metrics.tasksOverdue > 0 ? "warning" : "neutral"}
          href="/proyectos?view=tasks"
        />
        <KpiCard
          index={2}
          label="💼 Oportunidades abiertas"
          value={metrics.dealsOpenCount.toLocaleString("es")}
          helper={formatCurrency(metrics.dealsOpenValue)}
          icon={Workflow}
          tone="primary"
          href="/pipeline"
        />
        <KpiCard
          index={3}
          label="💡 Contenido en marcha"
          value={metrics.contentPendingCount.toLocaleString("es")}
          helper="Ideas, guiones y pendientes de publicar."
          icon={Lightbulb}
          href="/contenido"
        />
      </section>

      <AddonWidgets teamChatUnread={addons.teamChatUnread} vapiRecentCalls={addons.vapiRecentCalls} />
    </div>
  );
}
