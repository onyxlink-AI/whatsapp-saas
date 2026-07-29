"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";

interface JobRow {
  id: string;
  step_key: string;
  status: string;
  scheduled_for: string;
  attempts: number;
  cancel_reason: string | null;
  error_detail: string | null;
  sent_at: string | null;
  contact_name: string | null;
  contact_phone: string | null;
}

const STATUS_LABEL: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  scheduled: { label: "Programado", variant: "secondary" },
  processing: { label: "Enviando…", variant: "secondary" },
  sent: { label: "Enviado", variant: "default" },
  responded: { label: "Respondido", variant: "default" },
  cancelled: { label: "Cancelado", variant: "outline" },
  error: { label: "Error", variant: "destructive" },
  needs_attention: { label: "⚠️ Requiere atención", variant: "destructive" },
};

// Never show raw technical reason codes in the UI — translate every value
// this feature can persist into plain Spanish. Falls back to the raw text
// only for anything unrecognized (defensive, should not normally happen).
const REASON_TEXT_LABELS: Record<string, string> = {
  rescheduled: "La cita se reprogramó",
  cita_cancelada: "La cita se canceló",
  opt_out: "El cliente pidió no recibir más mensajes",
  paused_by_team: "Pausado manualmente por el equipo",
  workspace_paused: "Detenido por seguridad (toda la empresa)",
  contact_paused: "Seguimiento pausado para este cliente",
  consent_withdrawn: "El cliente retiró su consentimiento",
  no_show: "El cliente no se presentó a la cita",
  sin_contacto_o_conversacion: "Faltan datos del cliente",
};

function friendlyReason(raw: string): string {
  return REASON_TEXT_LABELS[raw] ?? raw;
}

export function ReminderHistory({ workspaceId }: { workspaceId: string }) {
  const [jobs, setJobs] = useState<JobRow[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/workspace/${workspaceId}/reminders/jobs`)
      .then((r) => r.json())
      .then((json: { jobs?: JobRow[] }) => {
        if (!cancelled) setJobs(json.jobs ?? []);
      })
      .catch(() => {
        if (!cancelled) setJobs([]);
      });
    return () => {
      cancelled = true;
    };
  }, [workspaceId]);

  return (
    <div className="space-y-2 rounded-lg border border-border/60 p-4">
      <p className="text-sm font-medium text-foreground">Historial de mensajes</p>
      {!jobs ? (
        <p className="text-xs text-muted-foreground">Cargando…</p>
      ) : jobs.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          Todavía no hay recordatorios programados.
        </p>
      ) : (
        <div className="max-h-80 space-y-1.5 overflow-y-auto">
          {jobs.map((job) => {
            const meta = STATUS_LABEL[job.status] ?? { label: job.status, variant: "outline" as const };
            return (
              <div
                key={job.id}
                className="flex items-center justify-between gap-2 rounded-md border border-border/40 p-2 text-xs"
              >
                <div>
                  <p className="font-medium text-foreground">
                    {job.contact_name ?? job.contact_phone ?? "Cliente"}
                  </p>
                  <p className="text-muted-foreground">
                    {job.step_key} · {new Date(job.scheduled_for).toLocaleString("es-MX")}
                  </p>
                  {(job.cancel_reason || job.error_detail) && (
                    <p className="text-[11px] text-muted-foreground">
                      {job.cancel_reason ? friendlyReason(job.cancel_reason) : job.error_detail}
                    </p>
                  )}
                </div>
                <Badge variant={meta.variant}>{meta.label}</Badge>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
