"use client";

import { useState, useTransition } from "react";
import { Phone, PhoneCall, Clock, DollarSign, ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/page-header";
import { listVoiceCalls } from "@/features/voice-agent/services/voice-calls";
import type { VoiceCallRow, VoiceCallMetrics } from "@/features/voice-agent/services/voice-calls";

interface Props {
  workspaceId: string;
  metrics: VoiceCallMetrics;
  initialCalls: VoiceCallRow[];
  initialTotal: number;
}

const PAGE_SIZE = 20;

const STATUS_LABELS: Record<string, string> = {
  new_lead: "Lead nuevo",
  existing_client_support: "Soporte cliente",
  needs_human: "Necesita humano",
  incomplete: "Incompleta",
  not_relevant: "No relevante",
  sin_estado: "Sin estado",
};

const STATUS_COLORS: Record<string, string> = {
  new_lead: "bg-primary/10 text-primary",
  existing_client_support: "bg-info/10 text-info",
  needs_human: "bg-warning/10 text-warning",
  incomplete: "bg-muted text-muted-foreground",
  not_relevant: "bg-muted text-muted-foreground",
  sin_estado: "bg-muted text-muted-foreground",
};

function KpiCard({
  label,
  value,
  icon,
  accent = false,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  accent?: boolean;
}) {
  return (
    <div
      className={cn(
        "surface-card min-h-32 p-5 transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md",
        accent && "border-primary/20 bg-gradient-to-br from-primary/[0.12] via-card to-card",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-medium leading-5 text-muted-foreground">{label}</p>
        <div className={cn("shrink-0 rounded-lg p-2", accent ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}>
          {icon}
        </div>
      </div>
      <p className="mt-5 font-display text-2xl font-semibold tracking-tight text-foreground tabular-nums">{value}</p>
    </div>
  );
}

function formatCost(usd: number): string {
  return `$${usd.toFixed(2)}`;
}

function formatDuration(seconds: number | null): string {
  if (seconds === null) return "—";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("es", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function CallsByDayChart({ data }: { data: { date: string; count: number }[] }) {
  const max = Math.max(1, ...data.map((d) => d.count));
  return (
    <div className="surface-card p-5">
      <h2 className="font-display text-sm font-semibold text-foreground mb-4">
        Llamadas por día (últimos 14 días)
      </h2>
      <div className="flex items-end gap-1.5 h-32">
        {data.map((d) => (
          <div key={d.date} className="flex-1 flex flex-col items-center justify-end gap-1 group">
            <span className="text-[10px] text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity tabular-nums">
              {d.count}
            </span>
            <div
              className={cn(
                "w-full rounded-t-sm min-h-[2px] transition-colors",
                d.count > 0 ? "bg-primary/60 group-hover:bg-primary" : "bg-muted",
              )}
              style={{ height: `${Math.max(2, (d.count / max) * 100)}%` }}
            />
            <span className="text-[9px] text-muted-foreground/70">
              {new Date(d.date).toLocaleDateString("es", { day: "2-digit" })}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function OutcomeBreakdown({ data }: { data: { status: string; count: number }[] }) {
  const total = data.reduce((sum, d) => sum + d.count, 0) || 1;
  return (
    <div className="surface-card p-5">
      <h2 className="font-display text-sm font-semibold text-foreground mb-4">Resultados de llamada</h2>
      {data.length === 0 ? (
        <p className="text-xs text-muted-foreground">Sin datos todavía</p>
      ) : (
        <div className="space-y-2.5">
          {data.map((d) => (
            <div key={d.status} className="flex items-center gap-3">
              <span
                className={cn(
                  "shrink-0 w-28 truncate rounded-full px-2 py-0.5 text-[10px] font-medium text-center",
                  STATUS_COLORS[d.status] ?? "bg-muted text-muted-foreground",
                )}
              >
                {STATUS_LABELS[d.status] ?? d.status}
              </span>
              <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full bg-primary/60 rounded-full"
                  style={{ width: `${(d.count / total) * 100}%` }}
                />
              </div>
              <span className="w-6 text-right text-xs text-muted-foreground tabular-nums">{d.count}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function CallRow({ call }: { call: VoiceCallRow }) {
  const [open, setOpen] = useState(false);
  const status = call.leadStatus ?? "sin_estado";

  return (
    <li className="border-b border-border/30 last:border-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted/30 transition-colors text-left"
      >
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-foreground truncate">
            {call.customerNumber ?? "Número desconocido"}
          </p>
          {call.summary && (
            <p className="text-xs text-muted-foreground truncate mt-0.5">{call.summary}</p>
          )}
        </div>
        <span className="font-mono text-[10px] text-muted-foreground/70 shrink-0">
          {formatDuration(call.durationSeconds)}
        </span>
        <span className="font-mono text-[10px] text-muted-foreground/70 shrink-0">
          {call.cost !== null ? formatCost(call.cost) : "—"}
        </span>
        <span
          className={cn(
            "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium shrink-0",
            STATUS_COLORS[status] ?? "bg-muted text-muted-foreground",
          )}
        >
          {STATUS_LABELS[status] ?? status}
        </span>
        <span className="text-[10px] text-muted-foreground/70 shrink-0 w-24 text-right">
          {formatDate(call.createdAt)}
        </span>
        {open ? (
          <ChevronUp className="h-3.5 w-3.5 text-muted-foreground shrink-0" aria-hidden="true" />
        ) : (
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" aria-hidden="true" />
        )}
      </button>
      {open && (
        <div className="px-4 pb-4 space-y-2">
          {call.summary && (
            <div>
              <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Resumen</p>
              <p className="text-xs text-foreground mt-0.5">{call.summary}</p>
            </div>
          )}
          <div>
            <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Transcripción</p>
            <pre className="text-xs text-foreground mt-0.5 whitespace-pre-wrap font-sans bg-muted/30 rounded-md p-3 max-h-64 overflow-y-auto">
              {call.transcript ?? "Sin transcripción disponible"}
            </pre>
          </div>
          {call.endedReason && (
            <p className="text-[10px] text-muted-foreground">Motivo de fin: {call.endedReason}</p>
          )}
        </div>
      )}
    </li>
  );
}

export function VoiceAgentDashboard({ workspaceId, metrics, initialCalls, initialTotal }: Props) {
  const [calls, setCalls] = useState(initialCalls);
  const [total, setTotal] = useState(initialTotal);
  const [loadingMore, startLoadMore] = useTransition();

  const hasMore = calls.length < total;

  function loadMore() {
    startLoadMore(async () => {
      const { rows, total: newTotal } = await listVoiceCalls(workspaceId, {
        limit: PAGE_SIZE,
        offset: calls.length,
      });
      setCalls((prev) => [...prev, ...rows]);
      setTotal(newTotal);
    });
  }

  return (
    <div className="page-shell space-y-7">
      <PageHeader
        eyebrow="Atención telefónica"
        title="Agente de voz"
        description="Consulta las llamadas, sus resultados y las conversaciones que necesitan seguimiento."
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          label="Gastado (90 días)"
          value={formatCost(metrics.totalCost)}
          icon={<DollarSign className="h-4 w-4" aria-hidden="true" />}
          accent
        />
        <KpiCard
          label="Llamadas totales"
          value={metrics.totalCalls.toLocaleString("es")}
          icon={<Phone className="h-4 w-4" aria-hidden="true" />}
        />
        <KpiCard
          label="Con lead / seguimiento"
          value={metrics.callsWithLead.toLocaleString("es")}
          icon={<PhoneCall className="h-4 w-4" aria-hidden="true" />}
        />
        <KpiCard
          label="Duración media"
          value={formatDuration(metrics.avgDurationSeconds)}
          icon={<Clock className="h-4 w-4" aria-hidden="true" />}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <CallsByDayChart data={metrics.callsByDay} />
        <OutcomeBreakdown data={metrics.outcomeBreakdown} />
      </div>

      <div className="space-y-3">
        <h2 className="font-display text-sm font-semibold text-foreground">
          Transcripciones ({total})
        </h2>

        {calls.length === 0 ? (
          <div className="rounded-xl border border-border/50 bg-card px-5 py-10 text-center">
            <p className="text-sm text-muted-foreground">Todavía no hay llamadas registradas</p>
          </div>
        ) : (
          <>
            <ul role="list" className="surface-card overflow-hidden">
              {calls.map((call) => (
                <CallRow key={call.id} call={call} />
              ))}
            </ul>
            {hasMore && (
              <button
                type="button"
                onClick={loadMore}
                disabled={loadingMore}
                className="w-full text-xs text-muted-foreground hover:text-foreground py-2 transition-colors disabled:opacity-50"
              >
                {loadingMore ? "Cargando..." : "Cargar más"}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
