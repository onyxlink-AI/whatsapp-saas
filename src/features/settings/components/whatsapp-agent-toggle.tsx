"use client";

import { useState } from "react";
import { MessageCircle } from "lucide-react";
import { toast } from "sonner";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

interface Props {
  workspaceId: string;
  initialEnabled: boolean;
  /** Notified with the new value on every successful/rolled-back change, so
   * a parent can keep a sibling toggle (Gestión, always included) in sync
   * without a page reload. */
  onEnabledChange?: (enabled: boolean) => void;
}

export function WhatsappAgentToggle({ workspaceId, initialEnabled, onEnabledChange }: Props) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [saving, setSaving] = useState(false);

  async function handleToggle(next: boolean) {
    setSaving(true);
    setEnabled(next);
    onEnabledChange?.(next);
    try {
      const response = await fetch(`/api/workspace/${workspaceId}/whatsapp-agent`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: next }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(typeof body.error === "string" ? body.error : "Error al guardar");
      }
      toast.success(
        next
          ? "Agente de WhatsApp activado (incluye Onyxlink Gestión)"
          : "Agente de WhatsApp desactivado",
      );
    } catch (error) {
      setEnabled(!next);
      onEnabledChange?.(!next);
      toast.error(error instanceof Error ? error.message : "Error al guardar");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex items-start justify-between gap-4 rounded-lg border border-border/60 p-4">
      <div className="flex gap-3">
        <MessageCircle className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
        <div>
          <Label className="text-sm font-medium text-foreground">Agente de WhatsApp</Label>
          <p className="mt-1 max-w-md text-xs text-muted-foreground">
            Activa Inicio, Conversaciones y la configuración del agente — e
            incluye Onyxlink Gestión automáticamente (no puede existir sin ella).
          </p>
        </div>
      </div>
      <Switch
        checked={enabled}
        onCheckedChange={handleToggle}
        disabled={saving}
        aria-label="Activar Agente de WhatsApp"
      />
    </div>
  );
}
