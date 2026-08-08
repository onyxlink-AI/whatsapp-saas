"use client";

import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { format, startOfWeek } from "date-fns";
import { Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  createAgendaTask,
  updateAgendaTask,
} from "@/features/projects/services/agenda-actions";
import type { AgendaScheduleMode, AgendaTaskRow } from "@/features/projects/types";

interface AgendaTaskFormDialogProps {
  open: boolean;
  workspaceId: string;
  task: AgendaTaskRow | null;
  defaultMode: AgendaScheduleMode;
  defaultDate: string;
  onClose: () => void;
  onSaved: () => void;
}

export function AgendaTaskFormDialog({
  open,
  workspaceId,
  task,
  defaultMode,
  defaultDate,
  onClose,
  onSaved,
}: AgendaTaskFormDialogProps) {
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [mode, setMode] = useState<AgendaScheduleMode>(defaultMode);
  const [date, setDate] = useState(defaultDate);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!open) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- resets the form to the target task's values each time the dialog opens.
    setTitle(task?.title ?? "");
    setNotes(task?.notes ?? "");
    if (task) {
      setMode(task.scheduled_week_start ? "week" : "day");
      setDate(task.scheduled_date ?? task.scheduled_week_start ?? defaultDate);
    } else {
      setMode(defaultMode);
      setDate(defaultDate);
    }
  }, [open, task, defaultMode, defaultDate]);

  function handleSave() {
    if (!title.trim()) {
      toast.error("El título es requerido");
      return;
    }

    const weekStart =
      mode === "week"
        ? format(startOfWeek(new Date(date), { weekStartsOn: 1 }), "yyyy-MM-dd")
        : undefined;

    startTransition(async () => {
      const input = {
        title: title.trim(),
        notes: notes.trim(),
        scheduled_date: mode === "day" ? date : "",
        scheduled_week_start: mode === "week" ? weekStart : "",
      };

      const result = task
        ? await updateAgendaTask(workspaceId, task.id, input)
        : await createAgendaTask(workspaceId, input);

      if (!result.ok) {
        toast.error(result.error ?? "Error al guardar la tarea");
        return;
      }

      toast.success(task ? "Tarea actualizada" : "Tarea creada");
      onSaved();
      onClose();
    });
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{task ? "Editar tarea" : "Nueva tarea"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Título</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="h-8 text-sm"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Asignar a</Label>
            <Tabs value={mode} onValueChange={(v) => setMode(v as AgendaScheduleMode)}>
              <TabsList>
                <TabsTrigger value="day">Un día</TabsTrigger>
                <TabsTrigger value="week">Una semana</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">
              {mode === "day" ? "Fecha" : "Cualquier día de esa semana"}
            </Label>
            <Input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="h-8 text-sm"
            />
            {mode === "week" && (
              <p className="text-[10px] text-muted-foreground">
                Semana del{" "}
                {format(startOfWeek(new Date(date), { weekStartsOn: 1 }), "dd/MM/yyyy")}
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Notas</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="text-sm min-h-16"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancelar
          </Button>
          <Button size="sm" onClick={handleSave} disabled={isPending} aria-busy={isPending}>
            {isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" aria-hidden />}
            {isPending ? "Guardando..." : "Guardar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
