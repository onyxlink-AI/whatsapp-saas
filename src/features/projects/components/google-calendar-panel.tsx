"use client";

import { useEffect, useState } from "react";
import { addDays, format, parseISO, startOfWeek } from "date-fns";
import { es } from "date-fns/locale";
import { CalendarCheck2, ExternalLink } from "lucide-react";
import { listGoogleEventsForRange } from "@/features/projects/services/google-calendar-view";
import type { AgendaScheduleMode, GoogleCalendarEventView } from "@/features/projects/types";

interface GoogleCalendarPanelProps {
  workspaceId: string;
  viewMode: AgendaScheduleMode;
  date: string;
}

function formatEventTime(event: GoogleCalendarEventView) {
  if (event.allDay) return "Todo el día";
  try {
    return new Intl.DateTimeFormat("es-MX", {
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(event.start));
  } catch {
    return "";
  }
}

export function GoogleCalendarPanel({ workspaceId, viewMode, date }: GoogleCalendarPanelProps) {
  const [state, setState] = useState<{
    loading: boolean;
    connected: boolean;
    events: GoogleCalendarEventView[];
    error?: string;
  }>({ loading: true, connected: false, events: [] });

  useEffect(() => {
    let cancelled = false;
    setState((s) => ({ ...s, loading: true }));

    const anchor = parseISO(date);
    const rangeStart =
      viewMode === "day" ? anchor : startOfWeek(anchor, { weekStartsOn: 1 });
    const rangeEnd = viewMode === "day" ? addDays(anchor, 1) : addDays(rangeStart, 7);

    listGoogleEventsForRange(
      workspaceId,
      rangeStart.toISOString(),
      rangeEnd.toISOString(),
    ).then((result) => {
      if (cancelled) return;
      setState({
        loading: false,
        connected: result.connected,
        events: result.events,
        error: result.error,
      });
    });

    return () => {
      cancelled = true;
    };
  }, [workspaceId, viewMode, date]);

  return (
    <div className="border-t border-border/50 pt-3 mt-2">
      <div className="flex items-center gap-2 mb-2">
        <CalendarCheck2 className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Sincronizado desde Google Calendar
        </span>
      </div>

      {state.loading && (
        <p className="text-xs text-muted-foreground">Sincronizando...</p>
      )}

      {!state.loading && !state.connected && (
        <p className="text-xs text-muted-foreground">
          Google Calendar no está conectado para este workspace.
        </p>
      )}

      {!state.loading && state.connected && state.error && (
        <p className="text-xs text-destructive">{state.error}</p>
      )}

      {!state.loading && state.connected && !state.error && state.events.length === 0 && (
        <p className="text-xs text-muted-foreground">
          Sin eventos sincronizados en este rango.
        </p>
      )}

      {!state.loading && state.connected && state.events.length > 0 && (
        <div className="space-y-1.5 max-h-40 overflow-y-auto">
          {state.events.map((event) => (
            <a
              key={event.id}
              href={event.htmlLink}
              target="_blank"
              rel="noreferrer"
              className="flex items-center justify-between gap-2 rounded-md border border-border/30 bg-muted/20 px-3 py-1.5 text-xs hover:border-border/60 transition-colors"
            >
              <span className="truncate flex-1 min-w-0">{event.summary}</span>
              <span className="flex items-center gap-1 shrink-0 text-muted-foreground font-mono">
                {event.allDay
                  ? format(new Date(event.start), "dd/MM", { locale: es })
                  : formatEventTime(event)}
                <ExternalLink className="h-2.5 w-2.5" />
              </span>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
