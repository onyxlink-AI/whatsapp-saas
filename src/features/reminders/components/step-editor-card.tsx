"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import type { ReminderStepRow } from "@/features/reminders/services/reminder-config";

function minutesToParts(offsetMinutes: number): { amount: number; unit: "horas" | "dias"; direction: "antes" | "despues" } {
  const direction = offsetMinutes < 0 ? "antes" : "despues";
  const abs = Math.abs(offsetMinutes);
  if (abs % (24 * 60) === 0 && abs >= 24 * 60) {
    return { amount: abs / (24 * 60), unit: "dias", direction };
  }
  return { amount: Math.round(abs / 60), unit: "horas", direction };
}

function partsToMinutes(amount: number, unit: "horas" | "dias", direction: "antes" | "despues"): number {
  const abs = unit === "dias" ? amount * 24 * 60 : amount * 60;
  return direction === "antes" ? -abs : abs;
}

export function StepEditorCard({
  workspaceId,
  step,
  onSaved,
}: {
  workspaceId: string;
  step: ReminderStepRow;
  onSaved: (step: ReminderStepRow) => void;
}) {
  const initialParts = minutesToParts(step.offset_minutes);
  const [enabled, setEnabled] = useState(step.enabled);
  const [amount, setAmount] = useState(initialParts.amount);
  const [unit, setUnit] = useState(initialParts.unit);
  const [direction, setDirection] = useState(initialParts.direction);
  const [message, setMessage] = useState(step.message_base);
  const [allowAiPersonalize, setAllowAiPersonalize] = useState(step.allow_ai_personalize);
  const [requiresConsent, setRequiresConsent] = useState(step.requires_consent);
  const [saving, setSaving] = useState(false);

  async function patch(body: Record<string, unknown>) {
    setSaving(true);
    try {
      const res = await fetch(`/api/workspace/${workspaceId}/reminders/steps/${step.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = (await res.json()) as { step?: ReminderStepRow; error?: string };
      if (!res.ok || !json.step) {
        toast.error(json.error ?? "No se pudo guardar el paso");
        return;
      }
      onSaved(json.step);
    } catch {
      toast.error("Error de conexión al guardar el paso");
    } finally {
      setSaving(false);
    }
  }

  function handleToggle(next: boolean) {
    setEnabled(next);
    void patch({ enabled: next });
  }

  function handleSaveDetails() {
    void patch({
      offset_minutes: partsToMinutes(amount, unit, direction),
      message_base: message,
      allow_ai_personalize: allowAiPersonalize,
      requires_consent: requiresConsent,
    });
  }

  return (
    <div className="space-y-3 rounded-lg border border-border/60 p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-foreground">{step.name}</p>
          <p className="text-xs text-muted-foreground">Paso {step.position + 1} de la secuencia</p>
        </div>
        <Switch checked={enabled} onCheckedChange={handleToggle} disabled={saving} aria-label={`Activar ${step.name}`} />
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="text-muted-foreground">Enviar</span>
        <Input
          type="number"
          min={0}
          value={amount}
          onChange={(e) => setAmount(Math.max(0, Number(e.target.value)))}
          className="h-8 w-16"
        />
        <Select value={unit} onValueChange={(v) => setUnit(v as "horas" | "dias")}>
          <SelectTrigger className="h-8 w-24">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="horas">horas</SelectItem>
            <SelectItem value="dias">días</SelectItem>
          </SelectContent>
        </Select>
        <Select value={direction} onValueChange={(v) => setDirection(v as "antes" | "despues")}>
          <SelectTrigger className="h-8 w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="antes">antes de la cita</SelectItem>
            <SelectItem value="despues">después de la cita</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">Mensaje base</Label>
        <Textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={3}
          className="resize-none text-xs"
          placeholder="Escribe el mensaje. Puedes usar {{nombre}}, {{empresa}}, {{hora}}, {{profesional}}."
        />
      </div>

      <div className="flex flex-wrap items-center gap-4 text-xs">
        <label className="flex items-center gap-2">
          <Switch checked={allowAiPersonalize} onCheckedChange={setAllowAiPersonalize} />
          La IA puede personalizar la conversación de este paso
        </label>
        {step.collects_response && (
          <label className="flex items-center gap-2">
            <Switch checked={requiresConsent} onCheckedChange={setRequiresConsent} />
            Requiere consentimiento explícito (ej. pedir valoración)
          </label>
        )}
      </div>

      <Button size="sm" variant="outline" onClick={handleSaveDetails} disabled={saving}>
        {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : null}
        Guardar paso
      </Button>
    </div>
  );
}
