"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Phone, Lock } from "lucide-react";

interface Props {
  workspaceId: string;
  initialAssistantId: string | null;
  /** Only Onyxlink (platform super admin) can link/unlink this paid add-on. */
  isSuperAdmin?: boolean;
}

export function VapiAssistantField({
  workspaceId,
  initialAssistantId,
  isSuperAdmin = false,
}: Props) {
  const [value, setValue] = useState(initialAssistantId ?? "");
  const [saved, setSaved] = useState(initialAssistantId ?? "");
  const [saving, setSaving] = useState(false);

  const dirty = value.trim() !== (saved ?? "");

  async function handleSave() {
    setSaving(true);
    const trimmed = value.trim();

    try {
      const res = await fetch(`/api/workspace/${workspaceId}/vapi-assistant`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assistantId: trimmed.length > 0 ? trimmed : null }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(typeof data.error === "string" ? data.error : "Error al guardar");
      }
      setSaved(trimmed);
      toast.success(
        trimmed.length > 0
          ? "Assistant de voz vinculado — la sección \"Asistente AI\" ya está disponible en el menú"
          : "Assistant de voz desvinculado",
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al guardar");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border/60 p-4">
      <div className="flex gap-3">
        <Phone className="h-5 w-5 mt-0.5 shrink-0 text-[hsl(var(--electric-lime))]" aria-hidden="true" />
        <div>
          <Label htmlFor="vapi-assistant-id" className="text-sm font-medium text-foreground">
            Asistente AI (agente de voz, Vapi)
          </Label>
          <p className="mt-1 text-xs text-muted-foreground max-w-md">
            Conecta tu asistente de voz para activar la sección
            &quot;Asistente AI&quot; en el menú: cuánto cuesta cada llamada,
            resumen y transcripción. Déjalo vacío para desactivarla.
          </p>
          {!isSuperAdmin && (
            <p className="mt-2 flex items-center gap-1.5 text-[11px] text-[hsl(var(--electric-lime))]">
              <Lock className="h-3 w-3" aria-hidden="true" />
              Función premium — contacta a tu gestor de Onyxlink para activarla.
            </p>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2 pl-8">
        <Input
          id="vapi-assistant-id"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="ej. 4ca5c330-4093-4be0-a787-c2eb05f478f3"
          className="h-8 max-w-sm font-mono text-xs"
          disabled={!isSuperAdmin}
        />
        <Button
          size="sm"
          className="h-8 text-xs"
          disabled={!dirty || saving || !isSuperAdmin}
          onClick={handleSave}
        >
          Guardar
        </Button>
      </div>
    </div>
  );
}
