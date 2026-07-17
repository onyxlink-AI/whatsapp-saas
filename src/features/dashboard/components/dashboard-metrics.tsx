"use client";

import Link from "next/link";
import {
  MessageCircle,
  Users,
  AlertCircle,
  DollarSign,
  Send,
} from "lucide-react";
import { cn } from "@/lib/utils";
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
}

interface KpiCardProps {
  label: string;
  value: string;
  icon: React.ReactNode;
  accent?: boolean;
  index?: number;
}

function KpiCard({ label, value, icon, accent = false, index = 0 }: KpiCardProps) {
  return (
    <div
      className={cn(
        "rounded-xl p-5 flex items-start gap-4 transition-colors",
        motionClasses.fadeInUp,
        accent ? "glass-accent" : "border border-border/50 bg-card",
      )}
      style={{ animationDelay: `${index * 50}ms` }}
    >
      <div
        className={cn(
          "shrink-0 rounded-lg p-2",
          accent
            ? "bg-primary/10 text-primary"
            : "bg-muted text-muted-foreground",
        )}
      >
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
          {label}
        </p>
        <p className="font-display text-2xl font-semibold text-foreground mt-0.5 tabular-nums">
          {value}
        </p>
      </div>
    </div>
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
        "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium shrink-0",
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
}: DashboardMetricsProps) {
  return (
    <div className="p-6 space-y-8 max-w-5xl mx-auto">
      {/* Page heading */}
      <div>
        <h1 className="font-display text-xl font-semibold text-foreground">
          📊 Resumen
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Esto es lo que pasó hoy en tu negocio
        </p>
      </div>

      {/* KPI grid — 2x2 on mobile, 1x4 on lg */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          index={0}
          label="💬 Mensajes de hoy"
          value={metrics.messagesToday.toLocaleString("es")}
          icon={<MessageCircle className="h-4 w-4" aria-hidden="true" />}
        />
        <KpiCard
          index={1}
          label="🗨️ Chats abiertos ahora"
          value={metrics.activeConversations.toLocaleString("es")}
          icon={<Users className="h-4 w-4" aria-hidden="true" />}
          accent
        />
        <KpiCard
          index={2}
          label="🙋 Esperando que respondas"
          value={metrics.handoffPending.toLocaleString("es")}
          icon={<AlertCircle className="h-4 w-4" aria-hidden="true" />}
        />
        <KpiCard
          index={3}
          label="💰 Gasto de IA esta semana"
          value={formatCost(metrics.llmCostWeekUsd)}
          icon={<DollarSign className="h-4 w-4" aria-hidden="true" />}
        />
        <KpiCard
          index={4}
          label="📨 Mensajes automáticos (semana)"
          value={metrics.templatesSentWeek.toLocaleString("es")}
          icon={<Send className="h-4 w-4" aria-hidden="true" />}
        />
      </div>

      {/* Charts */}
      <div
        className={cn("grid grid-cols-1 lg:grid-cols-2 gap-4", motionClasses.fadeInUp)}
        style={{ animationDelay: "250ms" }}
      >
        <MessageVolumeChart data={messageVolume} />
        <ConversationStateChart data={conversationStates} />
      </div>

      {/* Recent conversations */}
      <div className={cn("space-y-3", motionClasses.fadeInUp)} style={{ animationDelay: "300ms" }}>
        <h2 className="font-display text-sm font-semibold text-foreground">
          🕐 Lo último de hoy
        </h2>

        {recentConversations.length === 0 ? (
          <div className="rounded-xl border border-border/50 bg-card px-5 py-10 text-center">
            <p className="text-sm text-muted-foreground">
              Todavía no ha llegado ningún mensaje hoy
            </p>
          </div>
        ) : (
          <ul
            role="list"
            className="rounded-xl border border-border/50 bg-card divide-y divide-border/30 overflow-hidden"
          >
            {recentConversations.map((c) => (
              <li key={c.id}>
                <Link
                  href={`/inbox/${c.id}`}
                  className="flex items-center gap-3 px-4 py-3 hover:bg-muted/30 transition-colors"
                >
                  {/* Contact name + preview */}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground truncate">
                      {c.contactName ?? c.contactPhone}
                    </p>
                    {c.lastMessagePreview && (
                      <p className="text-xs text-muted-foreground truncate mt-0.5">
                        {c.lastMessagePreview}
                      </p>
                    )}
                  </div>

                  {/* State badge + time */}
                  <div className="flex items-center gap-2 shrink-0">
                    <StateBadge state={c.state} />
                    <span className="font-mono text-[10px] text-muted-foreground/70">
                      {formatRelativeTime(c.lastMessageAt)}
                    </span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
