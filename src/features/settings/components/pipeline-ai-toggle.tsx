"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Sparkles } from "lucide-react";

interface Props {
  workspaceId: string;
  initialEnabled: boolean;
}

export function PipelineAiToggle({ workspaceId, initialEnabled }: Props) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [saving, setSaving] = useState(false);

  async function handleToggle(next: boolean) {
    setSaving(true);
    setEnabled(next); // optimistic

    try {
      const res = await fetch(`/api/workspace/${workspaceId}/pipeline-ai`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: next }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(typeof data.error === "string" ? data.error : "Error al guardar");
      }
      toast.success(
        next ? "Sugerencias de Pipeline con IA activadas" : "Sugerencias de Pipeline con IA desactivadas",
      );
    } catch (err) {
      setEnabled(!next); // rollback
      toast.error(err instanceof Error ? err.message : "Error al guardar");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex items-start justify-between gap-4 rounded-lg border border-border/60 p-4">
      <div className="flex gap-3">
        <Sparkles className="h-5 w-5 mt-0.5 shrink-0 text-[hsl(var(--electric-lime))]" aria-hidden="true" />
        <div>
          <Label className="text-sm font-medium text-foreground">
            Sugerencias de Pipeline con IA
          </Label>
          <p className="mt-1 text-xs text-muted-foreground max-w-md">
            El agente mueve al contacto por el pipeline en tiempo real
            (Exploración → Interés → Listo para comprar → Cliente) según la
            conversación, y crea la oportunidad si aún no existe. Solo actúa
            cuando el agente activo tiene &ldquo;Funciones de Setter&rdquo; activadas en
            su configuración.
          </p>
        </div>
      </div>
      <Switch
        checked={enabled}
        onCheckedChange={handleToggle}
        disabled={saving}
        aria-label="Activar Sugerencias de Pipeline con IA"
      />
    </div>
  );
}
