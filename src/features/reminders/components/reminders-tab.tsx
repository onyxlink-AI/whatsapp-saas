"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, ShieldAlert, Octagon } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { StepEditorCard } from "./step-editor-card";
import { ReadinessChecklist } from "./readiness-checklist";
import { ReminderSimulator } from "./reminder-simulator";
import { ReminderHistory } from "./reminder-history";
import { AppointmentOperationsPanel } from "./appointment-operations-panel";
import type {
  ReminderConfigRow,
  ReminderStepRow,
} from "@/features/reminders/services/reminder-config";
import type { ReminderReadiness } from "@/features/reminders/services/readiness";
import type { AgentDto } from "@/features/agents/types";

interface ConfigResponse {
  config: ReminderConfigRow;
  steps: ReminderStepRow[];
  readiness: ReminderReadiness;
  liveSendingEnabled: boolean;
  availableTemplates: { key: string; label: string; description: string }[];
}

const TIMEZONES = [
  "America/Mexico_City",
  "America/Bogota",
  "America/Lima",
  "America/Santiago",
  "America/Buenos_Aires",
  "America/New_York",
  "Europe/Madrid",
];

function minutesToHHMM(minutes: number): string {
  const h = Math.floor(minutes / 60)
    .toString()
    .padStart(2, "0");
  const m = (minutes % 60).toString().padStart(2, "0");
  return `${h}:${m}`;
}

function hhmmToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

export function RemindersTab({
  workspaceId,
  agents,
}: {
  workspaceId: string;
  agents: AgentDto[];
}) {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<ConfigResponse | null>(null);
  const [saving, setSaving] = useState(false);

  const activeAgent = agents.find((a) => a.isActive) ?? null;

  async function load() {
    setLoading(true);
    try {
      const res = await fetch(`/api/workspace/${workspaceId}/reminders/config`);
      const json = (await res.json()) as ConfigResponse;
      setData(json);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data fetch on mount, same established pattern as day-view.tsx/subtask-list.tsx
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId]);

  async function patchConfig(body: Record<string, unknown>) {
    setSaving(true);
    try {
      const res = await fetch(`/api/workspace/${workspaceId}/reminders/config`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = (await res.json()) as { config?: ReminderConfigRow; steps?: ReminderStepRow[]; error?: string };
      if (!res.ok || !json.config) {
        toast.error(json.error ?? "No se pudo guardar");
        return;
      }
      setData((prev) => (prev ? { ...prev, config: json.config!, steps: json.steps ?? prev.steps } : prev));
      toast.success("Guardado");
    } catch {
      toast.error("Error de conexión");
    } finally {
      setSaving(false);
    }
  }

  async function emergencyStop(action: "stop" | "resume") {
    setSaving(true);
    try {
      const res = await fetch(`/api/workspace/${workspaceId}/reminders/emergency-stop`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const json = (await res.json()) as { ok?: boolean; cancelledJobs?: number; error?: string };
      if (!res.ok || !json.ok) {
        toast.error(json.error ?? "No se pudo actualizar la pausa");
        return;
      }
      toast.success(
        action === "stop"
          ? `Detenido. ${json.cancelledJobs ?? 0} mensajes pendientes cancelados.`
          : "Recordatorios reanudados.",
      );
      await load();
    } catch {
      toast.error("Error de conexión");
    } finally {
      setSaving(false);
    }
  }

  if (loading || !data) {
    return (
      <div className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        Cargando recordatorios y seguimiento…
      </div>
    );
  }

  const { config, steps, readiness, availableTemplates } = data;

  // "Origen de las citas" only ever lists integrations that are actually
  // connected right now — never a fabricated "connected" state.
  const sourceOptions: { value: "google_calendar" | "highlevel"; label: string }[] = [];
  // These reflect readiness.agendaConnected only for the CURRENTLY selected
  // source; to let the admin pick either real option we simply always offer
  // both and let the readiness checklist explain what's missing.
  sourceOptions.push({ value: "google_calendar", label: "Google Calendar" });
  sourceOptions.push({ value: "highlevel", label: "HighLevel" });

  return (
    <div className="space-y-6">
      {data.liveSendingEnabled ? (
        <div className="flex items-center gap-2 rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-xs font-medium text-destructive">
          <ShieldAlert className="h-4 w-4 shrink-0" aria-hidden="true" />
          ⚠️ Envíos reales activados — los mensajes que cumplan todos los requisitos se enviarán de verdad.
        </div>
      ) : (
        <div className="flex items-center gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs font-medium text-amber-700 dark:text-amber-400">
          🧪 Modo simulación — los envíos reales están bloqueados. Ningún mensaje saldrá de verdad aunque actives todo lo demás.
        </div>
      )}

      {config.paused_at && (
        <div className="flex items-center justify-between gap-3 rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          <span className="flex items-center gap-2 font-medium">
            <Octagon className="h-4 w-4 shrink-0" aria-hidden="true" />
            Detenido por seguridad — todos los mensajes pendientes fueron cancelados.
          </span>
          <Button size="sm" variant="outline" onClick={() => void emergencyStop("resume")} disabled={saving}>
            Reanudar
          </Button>
        </div>
      )}

      <div className="flex items-start justify-between gap-4 rounded-lg border border-border/60 p-4">
        <div>
          <Label className="text-sm font-medium text-foreground">
            Activar recordatorios y seguimiento
          </Label>
          <p className="mt-1 text-xs text-muted-foreground max-w-md">
            El sistema decide exactamente cuándo enviar cada mensaje — la IA
            nunca elige fechas, solo conversa cuando el cliente responde.
          </p>
        </div>
        <Switch
          checked={config.enabled}
          onCheckedChange={(v) => void patchConfig({ enabled: v })}
          disabled={saving}
          aria-label="Activar recordatorios y seguimiento"
        />
      </div>

      <div className="space-y-3 rounded-lg border border-border/60 p-4">
        <Label className="text-xs">Plantilla</Label>
        <div className="flex flex-wrap gap-2">
          {availableTemplates.map((t) => (
            <Button
              key={t.key}
              size="sm"
              variant={config.template_key === t.key ? "default" : "outline"}
              onClick={() => void patchConfig({ install_template_key: t.key })}
              disabled={saving}
            >
              {t.label}
            </Button>
          ))}
          <Button
            size="sm"
            variant={config.template_key === "custom" ? "default" : "outline"}
            disabled
            title="Se activa automáticamente al editar los pasos"
          >
            Configuración personalizada
          </Button>
        </div>
        {availableTemplates.find((t) => t.key === config.template_key) && (
          <p className="text-xs text-muted-foreground">
            {availableTemplates.find((t) => t.key === config.template_key)?.description}
          </p>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2 rounded-lg border border-border/60 p-4">
          <Label className="text-xs">Origen de las citas</Label>
          <Select
            value={config.appointment_source ?? ""}
            onValueChange={(v) => void patchConfig({ appointment_source: v })}
          >
            <SelectTrigger className="h-9 text-xs">
              <SelectValue placeholder="Elige una integración conectada" />
            </SelectTrigger>
            <SelectContent>
              {sourceOptions.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {!readiness.agendaConnected && (
            <p className="text-[11px] text-amber-600 dark:text-amber-400">
              Esta integración todavía no está conectada — ve a Ajustes → Integraciones.
            </p>
          )}
        </div>

        <div className="space-y-2 rounded-lg border border-border/60 p-4">
          <Label className="text-xs">Zona horaria de la empresa</Label>
          <Select value={config.timezone} onValueChange={(v) => void patchConfig({ timezone: v })}>
            <SelectTrigger className="h-9 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TIMEZONES.map((tz) => (
                <SelectItem key={tz} value={tz}>
                  {tz}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2 rounded-lg border border-border/60 p-4 sm:col-span-2">
          <Label className="text-xs">Horario permitido para enviar mensajes</Label>
          <div className="flex items-center gap-2 text-xs">
            <input
              type="time"
              value={minutesToHHMM(config.send_window_start_minute)}
              onChange={(e) =>
                void patchConfig({ send_window_start_minute: hhmmToMinutes(e.target.value) })
              }
              className="rounded-md border border-input bg-transparent px-2 py-1"
            />
            <span className="text-muted-foreground">a</span>
            <input
              type="time"
              value={minutesToHHMM(config.send_window_end_minute)}
              onChange={(e) =>
                void patchConfig({ send_window_end_minute: hhmmToMinutes(e.target.value) })
              }
              className="rounded-md border border-input bg-transparent px-2 py-1"
            />
          </div>
          <p className="text-[11px] text-muted-foreground">
            Si un mensaje calcula una hora fuera de este rango, se envía en el
            siguiente horario permitido.
          </p>
        </div>

        <div className="space-y-2 rounded-lg border border-border/60 p-4">
          <Label className="text-xs">Máximo de mensajes por cliente al día</Label>
          <input
            type="number"
            min={1}
            max={20}
            value={config.max_messages_per_contact_per_day}
            onChange={(e) =>
              void patchConfig({ max_messages_per_contact_per_day: Number(e.target.value) || 1 })
            }
            className="w-24 rounded-md border border-input bg-transparent px-2 py-1 text-xs"
          />
        </div>

        <div className="space-y-2 rounded-lg border border-border/60 p-4">
          <Label className="text-xs">Minutos mínimos entre mensajes al mismo cliente</Label>
          <input
            type="number"
            min={0}
            max={1440}
            value={config.min_minutes_between_messages}
            onChange={(e) =>
              void patchConfig({ min_minutes_between_messages: Number(e.target.value) || 0 })
            }
            className="w-24 rounded-md border border-input bg-transparent px-2 py-1 text-xs"
          />
        </div>

        <div className="space-y-2 rounded-lg border border-destructive/40 p-4">
          <Label className="text-xs">Emergencia</Label>
          <p className="text-[11px] text-muted-foreground">
            Cancela inmediatamente todos los mensajes pendientes de esta empresa.
          </p>
          <Button
            size="sm"
            variant="destructive"
            onClick={() => void emergencyStop("stop")}
            disabled={saving || Boolean(config.paused_at)}
          >
            <Octagon className="h-3.5 w-3.5" aria-hidden="true" />
            Detener todo
          </Button>
        </div>
      </div>

      <div className="space-y-3">
        <Label className="text-xs">Pasos de la secuencia</Label>
        {steps.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            Elige una plantilla arriba para instalar los pasos, o créalos personalizados.
          </p>
        ) : (
          steps
            .slice()
            .sort((a, b) => a.position - b.position)
            .map((step) => (
              <StepEditorCard
                key={step.id}
                workspaceId={workspaceId}
                step={step}
                onSaved={(updated) =>
                  setData((prev) =>
                    prev
                      ? { ...prev, steps: prev.steps.map((s) => (s.id === updated.id ? updated : s)) }
                      : prev,
                  )
                }
              />
            ))
        )}
      </div>

      <ReadinessChecklist workspaceId={workspaceId} readiness={readiness} />
      <AppointmentOperationsPanel workspaceId={workspaceId} />
      <ReminderSimulator workspaceId={workspaceId} activeAgent={activeAgent} />
      <ReminderHistory workspaceId={workspaceId} />
    </div>
  );
}
