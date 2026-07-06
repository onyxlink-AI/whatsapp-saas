"use client";

import { useState, useEffect, useCallback } from "react";
import { History, RefreshCw, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";

interface AuditLogEntry {
  id: string;
  actorName: string;
  actorEmail: string;
  action: string;
  targetType: string;
  targetId: string | null;
  summary: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}

interface Props {
  workspaceId: string;
}

const ACTION_LABEL: Record<string, string> = {
  "prompt.publish": "Prompt",
  "agent.activate": "Agente",
  "agent.update": "Agente",
  "tool.enable": "Tool",
  "tool.disable": "Tool",
  "tool.config_update": "Tool",
  "integration.update": "Integración",
};

function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat("es-MX", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Madrid",
  }).format(new Date(iso));
}

export function AuditLogTab({ workspaceId }: Props) {
  const [entries, setEntries] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/workspace/${workspaceId}/audit-log`);
      const json = (await res.json()) as {
        entries?: AuditLogEntry[];
        error?: string;
      };
      if (json.entries) {
        setEntries(json.entries);
        setError(null);
      } else {
        setError(json.error ?? "Error al cargar el registro de actividad");
      }
    } catch {
      setError("Error de red al cargar el registro de actividad");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional: load() sets loading/error/entries on mount and refresh
    void load();
  }, [load]);

  function handleRefresh() {
    setRefreshing(true);
    void load();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display text-base font-medium text-foreground">
            Actividad
          </h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Quién cambió qué en este workspace — prompts, agentes, tools e
            integraciones.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleRefresh}
          disabled={refreshing}
          aria-busy={refreshing}
        >
          {refreshing ? (
            <Loader2 className="h-4 w-4 mr-1.5 animate-spin" aria-hidden />
          ) : (
            <RefreshCw className="h-4 w-4 mr-1.5" aria-hidden />
          )}
          Actualizar
        </Button>
      </div>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full rounded-lg" />
          ))}
        </div>
      ) : error ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : entries.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 py-12 text-muted-foreground">
          <History className="h-7 w-7 opacity-40" strokeWidth={1.5} />
          <p className="text-sm">Todavía no hay actividad registrada.</p>
        </div>
      ) : (
        <ul className="space-y-1.5">
          {entries.map((entry) => (
            <li
              key={entry.id}
              className="flex items-start gap-3 rounded-lg border border-border/60 bg-card px-4 py-3"
            >
              <Badge
                variant="outline"
                className="mt-0.5 shrink-0 border-border text-muted-foreground font-mono text-[0.65rem]"
              >
                {ACTION_LABEL[entry.action] ?? entry.targetType}
              </Badge>
              <div className="min-w-0 flex-1">
                <p className="text-sm text-foreground">{entry.summary}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {entry.actorName} ({entry.actorEmail}) ·{" "}
                  {formatDateTime(entry.createdAt)}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
