"use client";

import { useState } from "react";
import { MessagesSquare } from "lucide-react";
import { toast } from "sonner";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

interface Props {
  workspaceId: string;
  initialEnabled: boolean;
  initialLimit: number;
  seatsUsed: number;
  initialStorageQuotaMb: number;
}

async function patchTeamChat(
  workspaceId: string,
  body: { enabled?: boolean; humanMemberLimit?: number; storageQuotaMb?: number },
) {
  const response = await fetch(`/api/workspace/${workspaceId}/team-chat-enabled`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const data = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(typeof data.error === "string" ? data.error : "Error al guardar");
  }
}

export function TeamChatToggle({ workspaceId, initialEnabled, initialLimit, seatsUsed, initialStorageQuotaMb }: Props) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [limit, setLimit] = useState(String(initialLimit));
  const [storageQuotaMb, setStorageQuotaMb] = useState(String(initialStorageQuotaMb));
  const [saving, setSaving] = useState(false);

  async function handleToggle(next: boolean) {
    setSaving(true);
    setEnabled(next);
    try {
      await patchTeamChat(workspaceId, { enabled: next });
      toast.success(next ? "Chat de equipo activado" : "Chat de equipo desactivado");
    } catch (error) {
      setEnabled(!next);
      toast.error(error instanceof Error ? error.message : "Error al guardar");
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveLimit() {
    const parsed = parseInt(limit, 10);
    if (!Number.isFinite(parsed) || parsed < 1 || parsed > 500) {
      toast.error("El límite debe estar entre 1 y 500");
      return;
    }
    if (parsed < seatsUsed) {
      toast.error(`Ya hay ${seatsUsed} plazas ocupadas — no puedes fijar un límite menor`);
      return;
    }
    setSaving(true);
    try {
      await patchTeamChat(workspaceId, { humanMemberLimit: parsed });
      toast.success("Límite de plazas actualizado");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Error al guardar");
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveStorageQuota() {
    const parsed = parseInt(storageQuotaMb, 10);
    if (!Number.isFinite(parsed) || parsed < 1 || parsed > 51200) {
      toast.error("La cuota debe estar entre 1 y 51200 MB");
      return;
    }
    setSaving(true);
    try {
      await patchTeamChat(workspaceId, { storageQuotaMb: parsed });
      toast.success("Cuota de almacenamiento actualizada");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Error al guardar");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border/60 p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex gap-3">
          <MessagesSquare className="h-5 w-5 mt-0.5 shrink-0 text-[hsl(var(--electric-lime))]" aria-hidden="true" />
          <div>
            <Label className="text-sm font-medium text-foreground">Chat de equipo</Label>
            <p className="mt-1 text-xs text-muted-foreground max-w-md">
              Mensajería interna instantánea (General y mensajes directos). El límite de
              plazas humanas lo controla exclusivamente Onyxlink.
            </p>
          </div>
        </div>
        <Switch checked={enabled} onCheckedChange={handleToggle} disabled={saving} aria-label="Activar Chat de equipo" />
      </div>

      {enabled && (
        <div className="flex items-center gap-2 pl-8">
          <Label htmlFor="team-chat-limit" className="text-xs text-muted-foreground shrink-0">
            Plazas contratadas
          </Label>
          <Input
            id="team-chat-limit"
            type="number"
            min={1}
            max={500}
            value={limit}
            onChange={(e) => setLimit(e.target.value)}
            className="h-8 w-20 text-sm"
          />
          <Button size="sm" variant="outline" className="h-8 text-xs" onClick={handleSaveLimit} disabled={saving}>
            Guardar
          </Button>
          <span className="text-[11px] text-muted-foreground">{seatsUsed} ocupadas</span>
        </div>
      )}

      {enabled && (
        <div className="flex items-center gap-2 pl-8">
          <Label htmlFor="team-chat-storage-quota" className="text-xs text-muted-foreground shrink-0">
            Cuota de documentos (MB/mes)
          </Label>
          <Input
            id="team-chat-storage-quota"
            type="number"
            min={1}
            max={51200}
            value={storageQuotaMb}
            onChange={(e) => setStorageQuotaMb(e.target.value)}
            className="h-8 w-24 text-sm"
          />
          <Button size="sm" variant="outline" className="h-8 text-xs" onClick={handleSaveStorageQuota} disabled={saving}>
            Guardar
          </Button>
        </div>
      )}
    </div>
  );
}
