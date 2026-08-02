"use client";

import { useState } from "react";
import { Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

interface Props {
  workspaceId: string;
  initialEnabled: boolean;
}

export function HelpAssistantActionsToggle({ workspaceId, initialEnabled }: Props) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [saving, setSaving] = useState(false);

  async function handleToggle(next: boolean) {
    setSaving(true);
    setEnabled(next);

    try {
      const response = await fetch(
        `/api/workspace/${workspaceId}/help-assistant-actions-enabled`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ enabled: next }),
        },
      );

      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(
          typeof body.error === "string" ? body.error : "Error al guardar",
        );
      }

      toast.success(
        next
          ? "El Asistente de Ayuda ya puede crear y editar cosas para este cliente"
          : "El Asistente de Ayuda vuelve a ser solo de preguntas para este cliente",
      );
    } catch (error) {
      setEnabled(!next);
      toast.error(
        error instanceof Error ? error.message : "Error al guardar",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex items-start justify-between gap-4 rounded-lg border border-border/60 p-4">
      <div className="flex gap-3">
        <Sparkles
          className="h-5 w-5 mt-0.5 shrink-0 text-[hsl(var(--electric-lime))]"
          aria-hidden="true"
        />
        <div>
          <Label className="text-sm font-medium text-foreground">
            Asistente de Ayuda — acciones
          </Label>
          <p className="mt-1 text-xs text-muted-foreground max-w-md">
            Deja que el Asistente de Ayuda también cree/edite clientes, mueva
            oportunidades del pipeline y cree/edite proyectos y tareas
            (nunca borra nada). Desactivado, solo responde preguntas —
            comportamiento actual de este cliente.
          </p>
        </div>
      </div>
      <Switch
        checked={enabled}
        onCheckedChange={handleToggle}
        disabled={saving}
        aria-label="Activar acciones del Asistente de Ayuda"
      />
    </div>
  );
}
