"use client";

import { useState } from "react";
import { Network } from "lucide-react";
import { toast } from "sonner";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

interface Props {
  workspaceId: string;
  initialEnabled: boolean;
}

export function OfficeVirtualToggle({ workspaceId, initialEnabled }: Props) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [saving, setSaving] = useState(false);

  async function handleToggle(next: boolean) {
    setSaving(true);
    setEnabled(next);

    try {
      const response = await fetch(
        `/api/workspace/${workspaceId}/office-virtual`,
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
        next ? "Oficina Virtual activada" : "Oficina Virtual desactivada",
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
        <Network
          className="h-5 w-5 mt-0.5 shrink-0 text-[hsl(var(--electric-lime))]"
          aria-hidden="true"
        />
        <div>
          <Label className="text-sm font-medium text-foreground">
            Oficina Virtual
          </Label>
          <p className="mt-1 text-xs text-muted-foreground max-w-md">
            Habilita el equipo de especialistas y su orquestador para este
            workspace.
          </p>
        </div>
      </div>
      <Switch
        checked={enabled}
        onCheckedChange={handleToggle}
        disabled={saving}
        aria-label="Activar Oficina Virtual"
      />
    </div>
  );
}
