"use client";

// Dashboard combinado — cualquier paquete con Agente de WhatsApp
// (whatsapp_gestion, whatsapp_oficina o suite). `gestion` es nullable: solo
// whatsapp_gestion y suite la traen, whatsapp_oficina (WhatsApp + Oficina
// Virtual SIN Gestión) no — cada uso de `gestion` de aquí en adelante debe
// tratarla como opcional, igual que ya se trata `office` (solo presente en
// suite/whatsapp_oficina).

import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  Bot,
  CalendarClock,
  CheckCircle2,
  CircleDollarSign,
  Lightbulb,
  ListChecks,
  MessageCircle,
  Network,
  Plug,
  Plus,
  Settings2,
  Users,
  Workflow,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/page-header";
import { KpiCard, PriorityRow, QuickAction } from "./primitives";
import { AddonWidgets } from "./addon-widgets";
import { MessageVolumeChart } from "./message-volume-chart";
import { ConversationStateChart } from "./conversation-state-chart";
import type { WorkspaceMetrics, RecentConversation, MessageVolumePoint, ConversationStateCount } from "@/features/dashboard/services/metrics";
import type { GestionMetrics, UpcomingAgendaItem, StalledDeal } from "@/features/dashboard/services/gestion-metrics";
import type { WhatsappDashboardState } from "@/features/dashboard/services/whatsapp-status";
import type { ConversationState } from "@/features/inbox/types";

interface Props {
  whatsapp: {
    metrics: WorkspaceMetrics;
    recentConversations: RecentConversation[];
    messageVolume: MessageVolumePoint[];
    conversationStates: ConversationStateCount[];
  };
  /** Estado real (§4.8, revisión correctiva #4) — nunca se asume "listo" solo por tener el paquete. */
  whatsappStatus: WhatsappDashboardState;
  /** Solo usuarios con rol manager/admin ven el onboarding accionable de pending_setup; el resto ve una nota neutra. */
  canConfigureWhatsapp: boolean;
  /** Null en whatsapp_oficina (WhatsApp + Oficina Virtual, sin Gestión). */
  gestion: {
    metrics: GestionMetrics;
    upcomingAgenda: UpcomingAgendaItem[];
    stalledDeals: StalledDeal[];
  } | null;
  /** Solo presente en Suite. */
  office: { configuredCount: number } | null;
  addons: {
    teamChatUnread: number | null;
    vapiRecentCalls: number | null;
  };
}

const STATE_LABELS: Record<ConversationState, string> = {
  ai_active: "Responde la IA",
  human_active: "Respondes tú",
  handoff_pending: "Te necesita",
  waiting_reply: "Esperando respuesta",
  paused: "Pausado",
  closed: "Cerrado",
};

function formatCost(usd: number): string {
  if (usd < 0.01) return "$0.00";
  return `$${usd.toFixed(2)}`;
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 }).format(value);
}

function formatDueDate(iso: string): string {
  return new Intl.DateTimeFormat("es-MX", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
}

export function CombinedDashboardBlock({ whatsapp, whatsappStatus, canConfigureWhatsapp, gestion, office, addons }: Props) {
  const whatsappReady = whatsappStatus.status !== "pending_setup";
  const needsHandoff = whatsappReady && whatsapp.metrics.handoffPending > 0;
  const needsAttention = needsHandoff || (gestion?.metrics.tasksOverdue ?? 0) > 0;
  const hasMessageVolume = whatsappReady && whatsapp.messageVolume.some((p) => p.inbound > 0 || p.outbound > 0);
  const hasConversationStates = whatsappReady && whatsapp.conversationStates.some((r) => r.count > 0);

  return (
    <div className="page-shell space-y-6">
      <PageHeader
        eyebrow="Centro de mando"
        title={needsHandoff ? "Hay conversaciones que necesitan tu ayuda" : "Tu empresa, de un vistazo"}
        description={
          needsHandoff
            ? "Revisa primero las conversaciones derivadas y continúa con el resto de la actividad."
            : "Conversaciones, tareas y oportunidades — todo en un solo lugar."
        }
        actions={
          <Button asChild size="sm" variant={needsHandoff ? "default" : "outline"} className="min-h-11 sm:min-h-9">
            <Link href="/inbox">
              Abrir conversaciones
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </Button>
        }
      />

      {whatsappStatus.status === "pending_setup" && (
        <section className="surface-card flex items-start gap-3 border-primary/25 bg-primary/[0.04] p-4">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Plug className="h-4 w-4" aria-hidden="true" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-foreground">Termina de configurar tu Agente de WhatsApp</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {canConfigureWhatsapp
                ? whatsappStatus.detail
                : "Tu equipo está terminando de configurarlo."}
            </p>
          </div>
          {canConfigureWhatsapp && (
            <Button asChild size="sm" variant="outline" className="min-h-11 shrink-0 sm:min-h-9">
              <Link href="/settings?tab=agentes">Continuar configuración</Link>
            </Button>
          )}
        </section>
      )}

      {whatsappStatus.status === "operational_error" && (
        <section className="surface-card flex items-start gap-3 border-warning/30 bg-warning/10 p-4">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-warning/15 text-warning">
            <AlertTriangle className="h-4 w-4" aria-hidden="true" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-foreground">Hay mensajes de WhatsApp sin entregar</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{whatsappStatus.detail}</p>
          </div>
          {canConfigureWhatsapp && (
            <Button asChild size="sm" variant="outline" className="min-h-11 shrink-0 sm:min-h-9">
              <Link href="/settings?tab=integraciones">Revisar integración</Link>
            </Button>
          )}
        </section>
      )}

      <section className="grid gap-4 xl:grid-cols-[1.25fr_0.75fr]">
        <div className="surface-card overflow-hidden">
          <div className="flex items-start justify-between gap-4 border-b border-border/60 px-5 py-4">
            <div>
              <h2 className="font-display text-base font-semibold text-foreground">Prioridades de hoy</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">Conversaciones primero, después el resto del trabajo.</p>
            </div>
            <span
              className={cn(
                "inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-semibold",
                needsAttention ? "bg-warning/10 text-warning" : "bg-success/10 text-success",
              )}
            >
              {needsAttention ? "Pendientes" : "Al día"}
            </span>
          </div>

          <div className="divide-y divide-border/50 p-2">
            {whatsappReady && (needsHandoff ? (
              <PriorityRow
                icon={AlertTriangle}
                title={`${whatsapp.metrics.handoffPending} conversación${whatsapp.metrics.handoffPending === 1 ? "" : "es"} esperando a una persona`}
                description="La IA ha detenido su intervención para que puedas continuar personalmente."
                tone="warning"
                href="/inbox"
              />
            ) : (
              <PriorityRow icon={CheckCircle2} title="Sin conversaciones esperando a una persona" description="No hay ninguna derivación pendiente." tone="success" />
            ))}

            {gestion && gestion.metrics.tasksOverdue > 0 && (
              <PriorityRow
                icon={AlertTriangle}
                title={`${gestion.metrics.tasksOverdue} tarea${gestion.metrics.tasksOverdue === 1 ? "" : "s"} vencida${gestion.metrics.tasksOverdue === 1 ? "" : "s"}`}
                description="Ya pasó su fecha límite."
                tone="warning"
                href="/proyectos?view=tasks"
              />
            )}

            {whatsappReady && (
              <PriorityRow
                icon={MessageCircle}
                title={whatsapp.metrics.activeConversations > 0 ? `${whatsapp.metrics.activeConversations} conversación${whatsapp.metrics.activeConversations === 1 ? "" : "es"} en marcha` : "No hay conversaciones activas ahora"}
                description="Bandeja de conversaciones."
                tone={whatsapp.metrics.activeConversations > 0 ? "primary" : "muted"}
                href="/inbox"
              />
            )}

            {gestion?.stalledDeals.map((deal) => (
              <PriorityRow key={deal.id} icon={Workflow} title={deal.title} description="Oportunidad sin movimiento reciente." tone="warning" href="/pipeline" />
            ))}

            {gestion?.upcomingAgenda.slice(0, 2).map((item) => (
              <PriorityRow key={item.id} icon={CalendarClock} title={item.title} description={`Agenda — ${formatDueDate(item.due_at)}`} tone="primary" href="/proyectos?view=agenda" />
            ))}

            {gestion && gestion.metrics.contentPendingCount > 0 && (
              <PriorityRow
                icon={Lightbulb}
                title={`${gestion.metrics.contentPendingCount} contenido${gestion.metrics.contentPendingCount === 1 ? "" : "s"} pendiente${gestion.metrics.contentPendingCount === 1 ? "" : "s"}`}
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
            {whatsappReady && <QuickAction href="/inbox" icon={MessageCircle} title="Ver conversaciones" description="Revisa mensajes y derivaciones." />}
            {gestion && <QuickAction href="/proyectos?view=tasks" icon={Plus} title="Crear tarea" description="Añade un pendiente." />}
            {gestion && <QuickAction href="/pipeline" icon={Workflow} title="Revisar ventas" description="Continúa las oportunidades abiertas." />}
            {office && <QuickAction href="/oficina-virtual" icon={Bot} title="Abrir la oficina" description="Consulta tu equipo digital." />}
            {!office && <QuickAction href="/settings" icon={Settings2} title="Configurar agentes" description="Ajusta cómo responde tu equipo." />}
          </div>
          <div className="mt-4 flex items-center justify-between gap-3 border-t border-border/60 pt-4 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-2">
              <CircleDollarSign className="h-3.5 w-3.5" aria-hidden="true" />
              Uso de IA · últimos 7 días
            </span>
            <span className="font-semibold tabular-nums text-foreground">{formatCost(whatsapp.metrics.llmCostWeekUsd)}</span>
          </div>
        </div>
      </section>

      <section aria-label="Indicadores principales" className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {whatsappReady && (
          <>
            <KpiCard index={0} label="💬 Mensajes de hoy" value={whatsapp.metrics.messagesToday.toLocaleString("es")} helper="Recibidos y enviados." icon={MessageCircle} href="/inbox" />
            <KpiCard index={1} label="🗨️ Chats abiertos" value={whatsapp.metrics.activeConversations.toLocaleString("es")} helper="Conversaciones abiertas." icon={Users} tone="primary" href="/inbox" />
          </>
        )}
        {gestion && (
          <>
            <KpiCard
              index={2}
              label="✅ Tareas pendientes"
              value={gestion.metrics.tasksPending.toLocaleString("es")}
              helper={gestion.metrics.tasksOverdue > 0 ? `${gestion.metrics.tasksOverdue} vencidas` : "Ninguna vencida"}
              icon={ListChecks}
              tone={gestion.metrics.tasksOverdue > 0 ? "warning" : "neutral"}
              href="/proyectos?view=tasks"
            />
            <KpiCard index={3} label="💼 Oportunidades abiertas" value={gestion.metrics.dealsOpenCount.toLocaleString("es")} helper={formatCurrency(gestion.metrics.dealsOpenValue)} icon={Workflow} href="/pipeline" />
          </>
        )}
      </section>

      {(hasMessageVolume || hasConversationStates) && (
        <section className="space-y-3" aria-labelledby="activity-analysis-title">
          <div>
            <h2 id="activity-analysis-title" className="font-display text-base font-semibold text-foreground">
              Evolución de la actividad
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground">Datos reales de las conversaciones de tu empresa.</p>
          </div>
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            {hasMessageVolume && <MessageVolumeChart data={whatsapp.messageVolume} />}
            {hasConversationStates && <ConversationStateChart data={whatsapp.conversationStates} />}
          </div>
        </section>
      )}

      {office && (
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
      )}

      <AddonWidgets teamChatUnread={addons.teamChatUnread} vapiRecentCalls={addons.vapiRecentCalls} />

      {whatsappReady && (
        <section className="surface-card overflow-hidden" aria-labelledby="recent-activity-title">
          <div className="flex items-center justify-between gap-4 border-b border-border/60 px-5 py-4">
            <div>
              <h2 id="recent-activity-title" className="font-display text-base font-semibold text-foreground">
                Actividad reciente
              </h2>
              <p className="mt-0.5 text-xs text-muted-foreground">Las últimas conversaciones atendidas hoy.</p>
            </div>
            <Link href="/inbox" className="inline-flex min-h-11 items-center text-xs font-semibold text-primary hover:underline sm:min-h-0">
              Ver todas
            </Link>
          </div>

          {whatsapp.recentConversations.length === 0 ? (
            <div className="px-5 py-10 text-center">
              <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
                <MessageCircle className="h-5 w-5" aria-hidden="true" />
              </div>
              <p className="mt-3 text-sm font-medium text-foreground">Todavía no hay conversaciones hoy</p>
            </div>
          ) : (
            <ul role="list" className="divide-y divide-border/50">
              {whatsapp.recentConversations.map((conversation) => (
                <li key={conversation.id}>
                  <Link href={`/inbox/${conversation.id}`} className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/30">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">{conversation.contactName ?? conversation.contactPhone}</p>
                      {conversation.lastMessagePreview && <p className="mt-0.5 truncate text-xs text-muted-foreground">{conversation.lastMessagePreview}</p>}
                    </div>
                    <span className="shrink-0 text-[10px] font-medium text-muted-foreground">{STATE_LABELS[conversation.state] ?? conversation.state}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
