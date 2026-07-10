"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { BrainCircuit, Lock } from "lucide-react";

interface Props {
  workspaceId: string;
  initialEnabled: boolean;
  /** Only Onyxlink (platform super admin) can toggle this paid add-on. */
  isSuperAdmin?: boolean;
}

export function AdvancedMemoryToggle({
  workspaceId,
  initialEnabled,
  isSuperAdmin = false,
}: Props) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [saving, setSaving] = useState(false);

  async function handleToggle(next: boolean) {
    setSaving(true);
    setEnabled(next); // optimistic

    try {
      const res = await fetch(`/api/workspace/${workspaceId}/advanced-memory`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: next }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(typeof data.error === "string" ? data.error : "Error al guardar");
      }
      toast.success(
        next ? "Memoria Inteligente Avanzada activada" : "Memoria Inteligente Avanzada desactivada",
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
        <BrainCircuit className="h-5 w-5 mt-0.5 shrink-0 text-[hsl(var(--electric-lime))]" aria-hidden="true" />
        <div>
          <Label className="text-sm font-medium text-foreground">
            Memoria Inteligente Avanzada
          </Label>
          <p className="mt-1 text-xs text-muted-foreground max-w-md">
            El agente recuerda a cada contacto entre conversaciones: resumen,
            intereses, preferencias, objeciones y estado del lead. Se extrae
            automáticamente tras cada respuesta y nunca guarda contraseñas ni
            datos bancarios.
          </p>
          {!isSuperAdmin && (
            <p className="mt-2 flex items-center gap-1.5 text-[11px] text-[hsl(var(--electric-lime))]">
              <Lock className="h-3 w-3" aria-hidden="true" />
              Función premium — contacta a tu gestor de Onyxlink para activarla.
            </p>
          )}
        </div>
      </div>
      <Switch
        checked={enabled}
        onCheckedChange={handleToggle}
        disabled={saving || !isSuperAdmin}
        aria-label="Activar Memoria Inteligente Avanzada"
      />
    </div>
  );
}
