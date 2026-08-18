"use client";

import { useState } from "react";
import { Pencil, Trash2, Check, X, Clock, Loader2, CheckCircle2, Target } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { GOAL_STATUS_LABELS, GOAL_PERIOD_TYPE_LABELS, type AgencyGoalWithOwner, type GoalStatus } from "../types";

interface Props {
  goals: AgencyGoalWithOwner[];
  loading: boolean;
  error: string | null;
  onEdit: (goal: AgencyGoalWithOwner) => void;
  onDelete: (goalId: string) => void;
  onStatusChange: (goalId: string, status: GoalStatus) => void;
  deletingId: string | null;
}

const STATUS_ICON: Record<GoalStatus, typeof Clock> = {
  pending: Clock,
  in_progress: Loader2,
  completed: CheckCircle2,
};

const STATUS_TONE: Record<GoalStatus, string> = {
  pending: "text-muted-foreground",
  in_progress: "text-primary",
  completed: "text-success",
};

function formatPeriodRange(start: string, end: string): string {
  const startDate = new Date(`${start}T00:00:00`);
  const endDate = new Date(`${end}T00:00:00`);
  const fmt = new Intl.DateTimeFormat("es", { day: "numeric", month: "short", year: "numeric" });
  return `${fmt.format(startDate)} – ${fmt.format(endDate)}`;
}

function StatusIndicator({ status }: { status: GoalStatus }) {
  const Icon = STATUS_ICON[status];
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-xs font-medium", STATUS_TONE[status])}>
      <Icon className={cn("h-3.5 w-3.5", status === "in_progress" && "animate-spin")} aria-hidden="true" />
      {GOAL_STATUS_LABELS[status]}
    </span>
  );
}

function ProgressCell({ progress }: { progress: number }) {
  return (
    <div className="flex min-w-[7rem] items-center gap-2">
      <Progress value={progress} className="h-1.5 w-16" />
      <span className="text-xs font-medium tabular-nums text-foreground">{progress}%</span>
    </div>
  );
}

function StatusSelect({ value, onChange }: { value: GoalStatus; onChange: (status: GoalStatus) => void }) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v as GoalStatus)}>
      <SelectTrigger className="h-8 w-[9.5rem] text-xs" aria-label="Cambiar estado">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {(Object.keys(GOAL_STATUS_LABELS) as GoalStatus[]).map((status) => (
          <SelectItem key={status} value={status}>
            <StatusIndicator status={status} />
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function RowActions({
  goal,
  onEdit,
  onDelete,
  deleting,
}: {
  goal: AgencyGoalWithOwner;
  onEdit: () => void;
  onDelete: () => void;
  deleting: boolean;
}) {
  const [confirming, setConfirming] = useState(false);

  if (confirming) {
    return (
      <div className="flex items-center justify-end gap-1">
        <Button
          size="sm"
          variant="destructive"
          className="h-8 px-2 text-xs"
          disabled={deleting}
          onClick={() => {
            setConfirming(false);
            onDelete();
          }}
        >
          <Check className="h-3.5 w-3.5" aria-hidden="true" />
          Eliminar
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="h-8 px-2 text-xs"
          disabled={deleting}
          onClick={() => setConfirming(false)}
        >
          <X className="h-3.5 w-3.5" aria-hidden="true" />
        </Button>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-end gap-1">
      <Button size="icon" variant="ghost" className="h-8 w-8" aria-label={`Editar «${goal.title}»`} onClick={onEdit}>
        <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
      </Button>
      <Button
        size="icon"
        variant="ghost"
        className="h-8 w-8 text-destructive hover:bg-destructive/10 hover:text-destructive"
        aria-label={`Eliminar «${goal.title}»`}
        onClick={() => setConfirming(true)}
      >
        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
      </Button>
    </div>
  );
}

export function ObjetivosTable({ goals, loading, error, onEdit, onDelete, onStatusChange, deletingId }: Props) {
  if (loading) {
    return (
      <div className="space-y-2 p-2" role="status" aria-live="polite">
        <span className="sr-only">Cargando objetivos…</span>
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-12 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center gap-2 px-5 py-10 text-center">
        <p className="text-sm font-medium text-destructive">No se pudieron cargar los objetivos</p>
        <p className="text-xs text-muted-foreground">{error}</p>
      </div>
    );
  }

  if (goals.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 px-5 py-12 text-center">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <Target className="h-5 w-5" aria-hidden="true" />
        </div>
        <p className="text-sm font-medium text-foreground">Todavía no hay objetivos en este periodo</p>
        <p className="text-xs text-muted-foreground">Crea el primero con «Nuevo objetivo».</p>
      </div>
    );
  }

  return (
    <>
      {/* Escritorio/tablet: tabla real */}
      <div className="hidden md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Objetivo</TableHead>
              <TableHead>Periodo</TableHead>
              <TableHead>Responsable</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Progreso</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {goals.map((goal) => (
              <TableRow key={goal.id}>
                <TableCell className="max-w-[16rem]">
                  <p className="truncate text-sm font-medium text-foreground">{goal.title}</p>
                  {goal.description && (
                    <p className="truncate text-xs text-muted-foreground">{goal.description}</p>
                  )}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {formatPeriodRange(goal.period_start, goal.period_end)}
                </TableCell>
                <TableCell className="text-xs text-foreground">{goal.owner?.full_name ?? "Sin asignar"}</TableCell>
                <TableCell>
                  <StatusSelect value={goal.status} onChange={(status) => onStatusChange(goal.id, status)} />
                </TableCell>
                <TableCell>
                  <ProgressCell progress={goal.progress} />
                </TableCell>
                <TableCell>
                  <RowActions
                    goal={goal}
                    onEdit={() => onEdit(goal)}
                    onDelete={() => onDelete(goal.id)}
                    deleting={deletingId === goal.id}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Móvil: tarjetas apiladas, sin scroll horizontal */}
      <div className="space-y-2 p-2 md:hidden">
        {goals.map((goal) => (
          <div key={goal.id} className="surface-subtle space-y-3 rounded-lg p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-foreground">{goal.title}</p>
                <p className="text-xs text-muted-foreground">{GOAL_PERIOD_TYPE_LABELS[goal.period_type]} · {formatPeriodRange(goal.period_start, goal.period_end)}</p>
              </div>
              <RowActions
                goal={goal}
                onEdit={() => onEdit(goal)}
                onDelete={() => onDelete(goal.id)}
                deleting={deletingId === goal.id}
              />
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs text-muted-foreground">{goal.owner?.full_name ?? "Sin asignar"}</span>
              <StatusSelect value={goal.status} onChange={(status) => onStatusChange(goal.id, status)} />
            </div>
            <ProgressCell progress={goal.progress} />
          </div>
        ))}
      </div>
    </>
  );
}
