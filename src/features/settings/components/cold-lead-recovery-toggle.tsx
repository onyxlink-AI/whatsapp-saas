"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { RefreshCw, Lock } from "lucide-react";

interface Props {
  workspaceId: string;
  initialEnabled: boolean;
  /** Only Onyxlink (platform super admin) can toggle this paid add-on. */
  isSuperAdmin?: boolean;
}

export function ColdLeadRecoveryToggle({
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
      const res = await fetch(`/api/workspace/${workspaceId}/cold-lead-recovery`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: next }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(typeof data.error === "string" ? data.error : "Error al guardar");
      }
      toast.success(
        next ? "Recuperación de Leads Fríos con IA activada" : "Recuperación de Leads Fríos con IA desactivada",
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
        <RefreshCw className="h-5 w-5 mt-0.5 shrink-0 text-[hsl(var(--electric-lime))]" aria-hidden="true" />
        <div>
          <Label className="text-sm font-medium text-foreground">
            Recuperación de Leads Fríos con IA
          </Label>
          <p className="mt-1 text-xs text-muted-foreground max-w-md">
            Cada día, la IA revisa los contactos sin respuesta y decide a
            cuáles merece la pena reenganchar, enviando una plantilla de
            WhatsApp aprobada con un mensaje personalizado. Requiere al menos
            una plantilla de marketing aprobada por Meta.
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
        aria-label="Activar Recuperación de Leads Fríos con IA"
      />
    </div>
  );
}
