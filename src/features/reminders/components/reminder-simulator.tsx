"use client";

import { useEffect, useState } from "react";
import { Loader2, FlaskConical } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { TestChatPanel } from "@/features/agents/components/test-chat-panel";
import type { AgentDto } from "@/features/agents/types";

interface AppointmentOption {
  id: string;
  scheduled_at: string;
  contact_name: string | null;
  contact_phone: string | null;
}

interface SimulatedStep {
  stepKey: string;
  name: string;
  enabled: boolean;
  scheduledFor: string;
  adjusted: boolean;
  adjustReason: string | null;
  renderedMessage: string;
  wouldBeBlocked: boolean;
  blockedReasonsLabels: string[];
}

interface SimulationResponse {
  usedRealAppointment: boolean;
  exampleLabel: string;
  appointmentScheduledAt: string;
  steps: SimulatedStep[];
}

export function ReminderSimulator({
  workspaceId,
  activeAgent,
}: {
  workspaceId: string;
  activeAgent: AgentDto | null;
}) {
  const [appointments, setAppointments] = useState<AppointmentOption[]>([]);
  const [selectedId, setSelectedId] = useState<string>("example");
  const [simulating, setSimulating] = useState(false);
  const [result, setResult] = useState<SimulationResponse | null>(null);
  const [showAgentChat, setShowAgentChat] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/workspace/${workspaceId}/reminders/appointments`)
      .then((r) => r.json())
      .then((json: { appointments?: AppointmentOption[] }) => {
        if (!cancelled) setAppointments(json.appointments ?? []);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [workspaceId]);

  async function runSimulation() {
    setSimulating(true);
    setResult(null);
    try {
      const res = await fetch(`/api/workspace/${workspaceId}/reminders/simulate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          selectedId !== "example" ? { appointmentId: selectedId } : {},
        ),
      });
      const json = (await res.json()) as SimulationResponse & { error?: string };
      if (!res.ok) {
        setResult(null);
        return;
      }
      setResult(json);
    } finally {
      setSimulating(false);
    }
  }

  return (
    <div className="space-y-4 rounded-lg border border-border/60 p-4">
      <div className="flex items-center gap-2">
        <FlaskConical className="h-4 w-4 text-primary" aria-hidden="true" />
        <p className="text-sm font-medium text-foreground">🧪 Probar sin enviar</p>
      </div>
      <p className="text-xs text-muted-foreground">
        Calcula las fechas y mensajes de cada paso sin enviar nada real: no se
        llama a WhatsApp, no se crean contactos ni conversaciones.
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <Select value={selectedId} onValueChange={setSelectedId}>
          <SelectTrigger className="h-8 w-64 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="example">🧪 Usar datos de ejemplo (ficticios)</SelectItem>
            {appointments.map((a) => (
              <SelectItem key={a.id} value={a.id}>
                {a.contact_name ?? a.contact_phone ?? "Cliente"} —{" "}
                {new Date(a.scheduled_at).toLocaleString("es-MX")}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button size="sm" onClick={runSimulation} disabled={simulating}>
          {simulating ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : null}
          Probar sin enviar
        </Button>
      </div>

      {result && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-amber-700 dark:text-amber-400">
            {result.usedRealAppointment
              ? `Simulación sobre una cita real (${result.exampleLabel}) — no se enviará nada.`
              : `Simulación con ${result.exampleLabel} — todos los datos son ficticios.`}
          </p>
          {result.steps.map((s) => (
            <div key={s.stepKey} className="rounded-md border border-dashed border-border/60 p-3 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-medium text-foreground">
                  {s.name} {!s.enabled && "(desactivado)"}
                </span>
                <span className="text-muted-foreground">
                  {new Date(s.scheduledFor).toLocaleString("es-MX")}
                </span>
              </div>
              {s.adjusted && (
                <p className="mt-1 text-[11px] text-muted-foreground">
                  ⏱️ Se movió al siguiente horario permitido.
                </p>
              )}
              <p className="mt-2 whitespace-pre-wrap text-foreground">{s.renderedMessage}</p>
              {s.wouldBeBlocked ? (
                <p className="mt-2 rounded-md border border-destructive/40 bg-destructive/10 px-2 py-1 text-[11px] text-destructive">
                  🚫 Se bloquearía: {s.blockedReasonsLabels.join(" · ")}
                </p>
              ) : (
                <p className="mt-2 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-[11px] text-emerald-700 dark:text-emerald-400">
                  ✅ Preparado técnicamente — nada real se envía en esta prueba.
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="border-t border-border/60 pt-3">
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setShowAgentChat((v) => !v)}
        >
          💬 {showAgentChat ? "Ocultar" : "Conversar con el agente en modo seguro"}
        </Button>
        {showAgentChat && (
          activeAgent ? (
            <div className="mt-3">
              <TestChatPanel workspaceId={workspaceId} agent={activeAgent} />
            </div>
          ) : (
            <p className="mt-2 text-xs text-muted-foreground">
              No hay un agente activo — actívalo en la pestaña 🤖 Agentes para probar la conversación.
            </p>
          )
        )}
      </div>
    </div>
  );
}
