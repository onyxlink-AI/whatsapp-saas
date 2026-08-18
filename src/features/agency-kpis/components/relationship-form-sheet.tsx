"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { createClientRelationship, updateClientRelationship } from "../services/kpi-actions";
import { todayLocalIso } from "@/features/agency-goals/services/period-calculator";
import type { AgencyClientRelationshipWithWorkspace, RegistrableWorkspace } from "../types";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  relationship: AgencyClientRelationshipWithWorkspace | null;
  registrableWorkspaces: RegistrableWorkspace[];
  onSaved: () => void;
}

export function RelationshipFormSheet({ open, onOpenChange, relationship, registrableWorkspaces, onSaved }: Props) {
  const isEdit = Boolean(relationship);

  const [workspaceId, setWorkspaceId] = useState("");
  const [startedOn, setStartedOn] = useState(todayLocalIso);
  const [hasEndDate, setHasEndDate] = useState(false);
  const [endedOn, setEndedOn] = useState(todayLocalIso);
  const [hasFee, setHasFee] = useState(false);
  const [fee, setFee] = useState("0");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (relationship) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- resets form fields from the relationship prop whenever the sheet opens, an intentional prop-driven reset
      setWorkspaceId(relationship.workspace_id ?? "");
      setStartedOn(relationship.service_started_on);
      setHasEndDate(relationship.service_ended_on !== null);
      setEndedOn(relationship.service_ended_on ?? todayLocalIso());
      setHasFee(relationship.monthly_fee !== null);
      setFee(relationship.monthly_fee !== null ? String(relationship.monthly_fee) : "0");
    } else {
      setWorkspaceId("");
      setStartedOn(todayLocalIso());
      setHasEndDate(false);
      setEndedOn(todayLocalIso());
      setHasFee(false);
      setFee("0");
    }
  }, [open, relationship]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const monthly_fee = hasFee ? Number(fee) : null;

      const result =
        isEdit && relationship
          ? await updateClientRelationship(relationship.id, {
              service_started_on: startedOn,
              service_ended_on: hasEndDate ? endedOn : null,
              monthly_fee,
            })
          : await createClientRelationship({
              workspace_id: workspaceId,
              service_started_on: startedOn,
              service_ended_on: hasEndDate ? endedOn : undefined,
              monthly_fee,
            });

      if (!result.ok) {
        toast.error(result.error);
        return;
      }

      toast.success(isEdit ? "Cliente actualizado" : "Cliente registrado");
      onSaved();
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  }

  const canSubmit = isEdit || Boolean(workspaceId);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-full flex-col sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{isEdit ? "Editar cliente" : "Nuevo cliente"}</SheetTitle>
          <SheetDescription>
            {isEdit ? "Actualiza los datos de la relación comercial." : "Registra un workspace como cliente de la agencia."}
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="flex flex-1 flex-col gap-4 overflow-y-auto py-4">
          {!isEdit && (
            <div className="space-y-1.5">
              <Label htmlFor="rel-workspace">Empresa</Label>
              <Select value={workspaceId} onValueChange={setWorkspaceId}>
                <SelectTrigger id="rel-workspace"><SelectValue placeholder="Selecciona una empresa" /></SelectTrigger>
                <SelectContent>
                  {registrableWorkspaces.length === 0 ? (
                    <div className="px-2 py-1.5 text-xs text-muted-foreground">No hay empresas sin registrar</div>
                  ) : (
                    registrableWorkspaces.map((ws) => (
                      <SelectItem key={ws.id} value={ws.id}>{ws.name}</SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* TAREA 3B: la empresa nunca es editable — se muestra en modo
              lectura, con el nombre actual del workspace si sigue existiendo
              o el respaldo histórico si ya se borró. */}
          {isEdit && relationship && (
            <div className="space-y-1.5">
              <Label>Empresa</Label>
              <p className="text-sm text-foreground">{relationship.workspace?.name ?? relationship.client_name_snapshot}</p>
              {relationship.workspace === null && (
                <p className="text-xs text-muted-foreground">El workspace original ya no existe — se conserva el nombre histórico.</p>
              )}
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="rel-started">Fecha de inicio</Label>
            <Input id="rel-started" type="date" value={startedOn} onChange={(e) => setStartedOn(e.target.value)} required />
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="rel-ended">Fecha de finalización</Label>
              <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <input type="checkbox" checked={hasEndDate} onChange={(e) => setHasEndDate(e.target.checked)} />
                Ha finalizado
              </label>
            </div>
            {hasEndDate && (
              <Input id="rel-ended" type="date" value={endedOn} onChange={(e) => setEndedOn(e.target.value)} required />
            )}
            {!hasEndDate && <p className="text-xs text-muted-foreground">Sin fecha de finalización — cliente activo.</p>}
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="rel-fee">Cuota mensual (EUR)</Label>
              <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <input type="checkbox" checked={hasFee} onChange={(e) => setHasFee(e.target.checked)} />
                Informar cuota
              </label>
            </div>
            {hasFee ? (
              <Input id="rel-fee" type="number" min={0} step="0.01" value={fee} onChange={(e) => setFee(e.target.value)} required />
            ) : (
              <p className="text-xs text-muted-foreground">Sin cuota informada.</p>
            )}
          </div>

          <SheetFooter className="mt-auto pt-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
              Cancelar
            </Button>
            <Button type="submit" disabled={saving || !canSubmit}>
              {saving ? "Guardando…" : isEdit ? "Guardar cambios" : "Registrar cliente"}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
