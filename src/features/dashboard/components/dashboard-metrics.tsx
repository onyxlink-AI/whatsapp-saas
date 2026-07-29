"use client";

import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  Bot,
  CheckCircle2,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  MessageCircle,
  Send,
  Settings2,
  Users,
  Workflow,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/page-header";
import type {
  WorkspaceMetrics,
  RecentConversation,
  MessageVolumePoint,
  ConversationStateCount,
} from "@/features/dashboard/services/metrics";
import type { ConversationState } from "@/features/inbox/types";
import { MessageVolumeChart } from "./message-volume-chart";
import { ConversationStateChart } from "./conversation-state-chart";
import { motionClasses } from "@/features/ui-kit/motion";

interface DashboardMetricsProps {
  metrics: WorkspaceMetrics;
  recentConversations: RecentConversation[];
  messageVolume: MessageVolumePoint[];
  conversationStates: ConversationStateCount[];
  hasOfficeVirtual: boolean;
}

interface KpiCardProps {
  label: string;
  value: string;
  helper: string;
  icon: LucideIcon;
  tone?: "neutral" | "primary" | "warning";
  index?: number;
}

function KpiCard({
  label,
  value,
  helper,
  icon: Icon,
  tone = "neutral",
  index = 0,
}: KpiCardProps) {
  return (
    <div
      className={cn(
        "surface-card min-h-36 p-5 transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md",
        motionClasses.fadeInUp,
        tone === "primary" &&
          "border-primary/20 bg-gradient-to-br from-primary/[0.1] via-card to-card",
        tone === "warning" &&
          "border-warning/25 bg-gradient-to-br from-warning/[0.12] via-card to-card",
      )}
      style={{ animationDelay: `${index * 50}ms` }}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="max-w-[12rem] text-xs font-medium leading-5 text-muted-foreground">
          {label}
        </p>
        <div
          className={cn(
            "shrink-0 rounded-lg p-2",
            tone === "primary" && "bg-primary text-primary-foreground",
            tone === "warning" && "bg-warning/15 text-warning",
            tone === "neutral" && "bg-muted text-muted-foreground",
          )}
        >
          <Icon className="h-4 w-4" aria-hidden="true" />
        </div>
      </div>
      <p className="mt-5 font-display text-2xl font-semibold tracking-tight text-foreground tabular-nums">
        {value}
      </p>
      <p className="mt-1 text-[11px] leading-4 text-muted-foreground">{helper}</p>
    </div>
  );
}

interface PriorityRowProps {
  icon: LucideIcon;
  title: string;
  description: string;
  tone?: "success" | "primary" | "warning" | "muted";
  href?: string;
}

function PriorityRow({
  icon: Icon,
  title,
  description,
  tone = "muted",
  href,
}: PriorityRowProps) {
  const content = (
    <>
      <div
        className={cn(
          "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
          tone === "success" && "bg-success/10 text-success",
          tone === "primary" && "bg-primary/10 text-primary",
          tone === "warning" && "bg-warning/10 text-warning",
          tone === "muted" && "bg-muted text-muted-foreground",
        )}
      >
        <Icon className="h-4 w-4" aria-hidden="true" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-foreground">{title}</p>
        <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
          {description}
        </p>
      </div>
      {href && (
        <ChevronRight
          className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground"
          aria-hidden="true"
        />
      )}
    </>
  );

  if (href) {
    return (
      <Link
        href={href}
        className="group flex items-center gap-3 rounded-xl px-3 py-3 transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {content}
      </Link>
    );
  }

  return <div className="flex items-center gap-3 px-3 py-3">{content}</div>;
}

interface QuickActionProps {
  href: string;
  icon: LucideIcon;
  title: string;
  description: string;
}

function QuickAction({ href, icon: Icon, title, description }: QuickActionProps) {
  return (
    <Link
      href={href}
      className="group flex min-h-20 items-center gap-3 rounded-xl border border-border/70 bg-card px-3.5 py-3 transition-all hover:-translate-y-0.5 hover:border-primary/25 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
        <Icon className="h-4 w-4" aria-hidden="true" />
      </div>
      <div className="min-w-0">
        <p className="text-xs font-semibold text-foreground">{title}</p>
        <p className="mt-0.5 text-[11px] leading-4 text-muted-foreground">
          {description}
        </p>
      </div>
    </Link>
  );
}

const STATE_LABELS: Record<ConversationState, string> = {
  ai_active: "Responde la IA",
  human_active: "Respondes tú",
  handoff_pending: "Te necesita",
  waiting_reply: "Esperando respuesta",
  paused: "Pausado",
  closed: "Cerrado",
};

const STATE_COLORS: Record<ConversationState, string> = {
  ai_active: "bg-primary/10 text-primary",
  human_active: "bg-info/10 text-info",
  handoff_pending: "bg-warning/10 text-warning",
  waiting_reply: "bg-muted text-muted-foreground",
  paused: "bg-muted text-muted-foreground",
  closed: "bg-muted text-muted-foreground",
};

function StateBadge({ state }: { state: ConversationState }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[10px] font-medium",
        STATE_COLORS[state] ?? "bg-muted text-muted-foreground",
      )}
    >
      {STATE_LABELS[state] ?? state}
    </span>
  );
}

function formatCost(usd: number): string {
  if (usd < 0.01) return "$0.00";
  return `$${usd.toFixed(2)}`;
}

function formatRelativeTime(iso: string | null): string {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "ahora";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return `${Math.floor(hrs / 24)}d`;
}

export function DashboardMetrics({
  metrics,
  recentConversations,
  messageVolume,
  conversationStates,
  hasOfficeVirtual,
}: DashboardMetricsProps) {
  const hasMessageVolume = messageVolume.some(
    (point) => point.inbound > 0 || point.outbound > 0,
  );
  const hasConversationStates = conversationStates.some((row) => row.count > 0);
  const needsAttention = metrics.handoffPending > 0;

  return (
    <div className="page-shell space-y-6">
      <PageHeader
        eyebrow="Centro de mando"
        title={
          needsAttention
            ? "Hay conversaciones que necesitan tu ayuda"
            : "Tu empresa, de un vistazo"
        }
        description={
          needsAttention
            ? "Revisa primero las conversaciones derivadas por la IA y continúa después con el resto de la actividad."
            : "Consulta lo importante, revisa la actividad y accede rápidamente a las tareas habituales."
        }
        actions={
          <Button
            asChild
            size="sm"
            variant={needsAttention ? "default" : "outline"}
            className="min-h-11 sm:min-h-9"
          >
            <Link href="/inbox">
              Abrir conversaciones
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </Button>
        }
      />

      <section className="grid gap-4 xl:grid-cols-[1.25fr_0.75fr]">
        <div className="surface-card overflow-hidden">
          <div className="flex items-start justify-between gap-4 border-b border-border/60 px-5 py-4">
            <div>
              <h2 className="font-display text-base font-semibold text-foreground">
                Prioridades de hoy
              </h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Empieza por lo que necesita una decisión humana.
              </p>
            </div>
            <span
              className={cn(
                "inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-semibold",
                needsAttention
                  ? "bg-warning/10 text-warning"
                  : "bg-success/10 text-success",
              )}
            >
              {needsAttention
                ? `${metrics.handoffPending} pendiente${metrics.handoffPending === 1 ? "" : "s"}`
                : "Sin derivaciones"}
            </span>
          </div>

          <div className="divide-y divide-border/50 p-2">
            {needsAttention ? (
              <PriorityRow
                icon={AlertTriangle}
                title={`${metrics.handoffPending} conversación${metrics.handoffPending === 1 ? "" : "es"} esperando a una persona`}
                description="La IA ha detenido su intervención para que puedas continuar personalmente."
                tone="warning"
                href="/inbox"
              />
            ) : (
              <PriorityRow
                icon={CheckCircle2}
                title="Sin conversaciones esperando a una persona"
                description="Ahora mismo no hay ninguna derivación pendiente de revisión."
                tone="success"
              />
            )}

            <PriorityRow
              icon={MessageCircle}
              title={
                metrics.activeConversations > 0
                  ? `${metrics.activeConversations} conversación${metrics.activeConversations === 1 ? "" : "es"} en marcha`
                  : "No hay conversaciones activas ahora"
              }
              description={
                metrics.activeConversations > 0
                  ? "Puedes seguir su evolución desde la bandeja de conversaciones."
                  : "Cuando llegue un nuevo mensaje, aparecerá aquí automáticamente."
              }
              tone={metrics.activeConversations > 0 ? "primary" : "muted"}
              href="/inbox"
            />

            <PriorityRow
              icon={metrics.messagesToday > 0 ? Send : Clock3}
              title={
                metrics.messagesToday > 0
                  ? `${metrics.messagesToday} mensaje${metrics.messagesToday === 1 ? "" : "s"} gestionado${metrics.messagesToday === 1 ? "" : "s"} hoy`
                  : "Aún no ha entrado actividad hoy"
              }
              description={
                metrics.messagesToday > 0
                  ? "El total incluye mensajes recibidos y respuestas enviadas."
                  : "El panel se actualizará en cuanto empiece la actividad del día."
              }
              tone={metrics.messagesToday > 0 ? "primary" : "muted"}
            />
          </div>
        </div>

        <div className="surface-subtle p-4 sm:p-5">
          <div>
            <h2 className="font-display text-base font-semibold text-foreground">
              Acciones rápidas
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Accede directamente a las tareas más habituales.
            </p>
          </div>
          <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
            <QuickAction
              href="/inbox"
              icon={MessageCircle}
              title="Ver conversaciones"
              description="Revisa mensajes y derivaciones."
            />
            <QuickAction
              href="/settings"
              icon={Settings2}
              title="Configurar agentes"
              description="Ajusta cómo responde tu equipo."
            />
            <QuickAction
              href="/pipeline"
              icon={Workflow}
              title="Revisar ventas"
              description="Continúa las oportunidades abiertas."
            />
            {hasOfficeVirtual && (
              <QuickAction
                href="/oficina-virtual"
                icon={Bot}
                title="Abrir la oficina"
                description="Consulta tu equipo digital."
              />
            )}
          </div>
          <div className="mt-4 flex items-center justify-between gap-3 border-t border-border/60 pt-4 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-2">
              <CircleDollarSign className="h-3.5 w-3.5" aria-hidden="true" />
              Uso de IA · últimos 7 días
            </span>
            <span className="font-semibold tabular-nums text-foreground">
              {formatCost(metrics.llmCostWeekUsd)}
            </span>
          </div>
        </div>
      </section>

      <section aria-label="Indicadores principales" className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          index={0}
          label="💬 Mensajes de hoy"
          value={metrics.messagesToday.toLocaleString("es")}
          helper="Recibidos y enviados durante el día."
          icon={MessageCircle}
        />
        <KpiCard
          index={1}
          label="🗨️ Chats abiertos ahora"
          value={metrics.activeConversations.toLocaleString("es")}
          helper="Conversaciones que siguen abiertas."
          icon={Users}
          tone="primary"
        />
        <KpiCard
          index={2}
          label="🙋 Esperando que respondas"
          value={metrics.handoffPending.toLocaleString("es")}
          helper="La IA ha solicitado intervención humana."
          icon={AlertTriangle}
          tone={needsAttention ? "warning" : "neutral"}
        />
        <KpiCard
          index={3}
          label="📨 Automatizaciones esta semana"
          value={metrics.templatesSentWeek.toLocaleString("es")}
          helper="Mensajes automáticos enviados en 7 días."
          icon={Bot}
        />
      </section>

      {(hasMessageVolume || hasConversationStates) && (
        <section className="space-y-3" aria-labelledby="activity-analysis-title">
          <div>
            <h2 id="activity-analysis-title" className="font-display text-base font-semibold text-foreground">
              Evolución de la actividad
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Datos reales de las conversaciones de tu empresa.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            {hasMessageVolume && <MessageVolumeChart data={messageVolume} />}
            {hasConversationStates && (
              <ConversationStateChart data={conversationStates} />
            )}
          </div>
        </section>
      )}

      <section className="surface-card overflow-hidden" aria-labelledby="recent-activity-title">
        <div className="flex items-center justify-between gap-4 border-b border-border/60 px-5 py-4">
          <div>
            <h2 id="recent-activity-title" className="font-display text-base font-semibold text-foreground">
              Actividad reciente
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Las últimas conversaciones atendidas hoy.
            </p>
          </div>
          <Link
            href="/inbox"
            className="inline-flex min-h-11 items-center text-xs font-semibold text-primary hover:underline sm:min-h-0"
          >
            Ver todas
          </Link>
        </div>

        {recentConversations.length === 0 ? (
          <div className="px-5 py-10 text-center">
            <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <MessageCircle className="h-5 w-5" aria-hidden="true" />
            </div>
            <p className="mt-3 text-sm font-medium text-foreground">
              Todavía no hay conversaciones hoy
            </p>
            <p className="mx-auto mt-1 max-w-sm text-xs leading-5 text-muted-foreground">
              Cuando llegue un mensaje, aparecerá aquí. Mientras tanto puedes revisar la configuración de tus agentes.
            </p>
            <Button
              asChild
              variant="outline"
              size="sm"
              className="mt-4 min-h-11 sm:min-h-9"
            >
              <Link href="/settings">
                Revisar configuración
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </Button>
          </div>
        ) : (
          <ul role="list" className="divide-y divide-border/50">
            {recentConversations.map((conversation) => (
              <li key={conversation.id}>
                <Link
                  href={`/inbox/${conversation.id}`}
                  className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/30"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">
                      {conversation.contactName ?? conversation.contactPhone}
                    </p>
                    {conversation.lastMessagePreview && (
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">
                        {conversation.lastMessagePreview}
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <StateBadge state={conversation.state} />
                    <span className="font-mono text-[10px] text-muted-foreground/70">
                      {formatRelativeTime(conversation.lastMessageAt)}
                    </span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
