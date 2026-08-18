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
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { createGoal, updateGoal } from "../services/goal-actions";
import type { Quarter } from "../services/period-calculator";
import { parseIsoDate, todayLocalIso } from "../services/period-calculator";
import type { PeriodSelectorInput } from "../services/goal-schemas";
import {
  GOAL_STATUS_LABELS,
  type AgencyGoalOwner,
  type AgencyGoalWithOwner,
  type GoalPeriodType,
  type GoalStatus,
} from "../types";

const MONTH_LABELS = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  periodType: GoalPeriodType;
  goal: AgencyGoalWithOwner | null;
  staffUsers: AgencyGoalOwner[];
  onSaved: () => void;
}

function defaultYear(): number {
  return new Date().getFullYear();
}

function defaultQuarter(): Quarter {
  return (Math.floor(new Date().getMonth() / 3) + 1) as Quarter;
}

export function GoalFormSheet({ open, onOpenChange, periodType, goal, staffUsers, onSaved }: Props) {
  const isEdit = Boolean(goal);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [year, setYear] = useState(defaultYear());
  const [quarter, setQuarter] = useState<Quarter>(defaultQuarter());
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [weekReferenceDate, setWeekReferenceDate] = useState(todayLocalIso);
  const [ownerId, setOwnerId] = useState<string>("none");
  const [status, setStatus] = useState<GoalStatus>("pending");
  const [progress, setProgress] = useState(0);
  const [saving, setSaving] = useState(false);

  // Reinicia el formulario cada vez que se abre — evita arrastrar datos de
  // una edición anterior a la siguiente apertura.
  useEffect(() => {
    if (!open) return;
    if (goal) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- resets form fields from the goal prop whenever the sheet opens, an intentional prop-driven reset
      setTitle(goal.title);
      setDescription(goal.description ?? "");
      const start = parseIsoDate(goal.period_start);
      setYear(start.getFullYear());
      setQuarter((Math.floor(start.getMonth() / 3) + 1) as Quarter);
      setMonth(start.getMonth() + 1);
      setWeekReferenceDate(goal.period_start);
      setOwnerId(goal.owner_id ?? "none");
      setStatus(goal.status);
      setProgress(goal.progress);
    } else {
      setTitle("");
      setDescription("");
      setYear(defaultYear());
      setQuarter(defaultQuarter());
      setMonth(new Date().getMonth() + 1);
      setWeekReferenceDate(todayLocalIso());
      setOwnerId("none");
      setStatus("pending");
      setProgress(0);
    }
  }, [open, goal]);

  function buildPeriod(): PeriodSelectorInput {
    switch (periodType) {
      case "annual":
        return { type: "annual", year };
      case "quarterly":
        return { type: "quarterly", year, quarter };
      case "monthly":
        return { type: "monthly", year, month };
      case "weekly":
        return { type: "weekly", referenceDate: weekReferenceDate };
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const result =
        isEdit && goal
          ? await updateGoal(goal.id, {
              title,
              description: description || undefined,
              period: buildPeriod(),
              // null limpia explícitamente el responsable en edición;
              // en creación no hay nada que limpiar, así que se omite.
              owner_id: ownerId === "none" ? null : ownerId,
              status,
              progress,
            })
          : await createGoal({
              title,
              description: description || undefined,
              period: buildPeriod(),
              owner_id: ownerId === "none" ? undefined : ownerId,
              status,
              progress,
            });

      if (!result.ok) {
        toast.error(result.error);
        return;
      }

      toast.success(isEdit ? "Objetivo actualizado" : "Objetivo creado");
      onSaved();
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-full flex-col sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{isEdit ? "Editar objetivo" : "Nuevo objetivo"}</SheetTitle>
          <SheetDescription>
            {isEdit ? "Actualiza los datos del objetivo." : "Crea un objetivo interno de la agencia."}
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="flex flex-1 flex-col gap-4 overflow-y-auto py-4">
          <div className="space-y-1.5">
            <Label htmlFor="goal-title">Objetivo</Label>
            <Input id="goal-title" value={title} onChange={(e) => setTitle(e.target.value)} required maxLength={200} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="goal-description">Descripción (opcional)</Label>
            <Textarea id="goal-description" value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
          </div>

          {(periodType === "annual" || periodType === "quarterly" || periodType === "monthly") && (
            <div className="space-y-1.5">
              <Label htmlFor="goal-year">Año</Label>
              <Input
                id="goal-year"
                type="number"
                value={year}
                onChange={(e) => setYear(Number(e.target.value))}
                min={2000}
                max={2100}
                required
              />
            </div>
          )}

          {periodType === "quarterly" && (
            <div className="space-y-1.5">
              <Label htmlFor="goal-quarter">Trimestre</Label>
              <Select value={String(quarter)} onValueChange={(v) => setQuarter(Number(v) as Quarter)}>
                <SelectTrigger id="goal-quarter"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">T1 · Enero-Marzo</SelectItem>
                  <SelectItem value="2">T2 · Abril-Junio</SelectItem>
                  <SelectItem value="3">T3 · Julio-Septiembre</SelectItem>
                  <SelectItem value="4">T4 · Octubre-Diciembre</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          {periodType === "monthly" && (
            <div className="space-y-1.5">
              <Label htmlFor="goal-month">Mes</Label>
              <Select value={String(month)} onValueChange={(v) => setMonth(Number(v))}>
                <SelectTrigger id="goal-month"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {MONTH_LABELS.map((label, index) => (
                    <SelectItem key={label} value={String(index + 1)}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {periodType === "weekly" && (
            <div className="space-y-1.5">
              <Label htmlFor="goal-week">Cualquier día de la semana deseada</Label>
              <Input
                id="goal-week"
                type="date"
                value={weekReferenceDate}
                onChange={(e) => setWeekReferenceDate(e.target.value)}
                required
              />
              <p className="text-xs text-muted-foreground">La semana se calcula automáticamente de lunes a domingo.</p>
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="goal-owner">Responsable (opcional)</Label>
            <Select value={ownerId} onValueChange={setOwnerId}>
              <SelectTrigger id="goal-owner"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Sin asignar</SelectItem>
                {staffUsers.map((u) => (
                  <SelectItem key={u.id} value={u.id}>{u.full_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="goal-status">Estado</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as GoalStatus)}>
                <SelectTrigger id="goal-status"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(GOAL_STATUS_LABELS) as GoalStatus[]).map((s) => (
                    <SelectItem key={s} value={s}>{GOAL_STATUS_LABELS[s]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="goal-progress">Progreso (%)</Label>
              <Input
                id="goal-progress"
                type="number"
                min={0}
                max={100}
                value={progress}
                onChange={(e) => setProgress(Math.min(100, Math.max(0, Number(e.target.value))))}
                required
              />
            </div>
          </div>

          <SheetFooter className="mt-auto pt-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
              Cancelar
            </Button>
            <Button type="submit" disabled={saving || !title.trim()}>
              {saving ? "Guardando…" : isEdit ? "Guardar cambios" : "Crear objetivo"}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
