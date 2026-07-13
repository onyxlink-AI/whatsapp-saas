"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createTask } from "@/features/projects/services/task-actions";
import { TASK_TYPE_LABELS, type ProjectOption, type TaskType } from "@/features/projects/types";
import { ProjectPicker } from "./project-picker";

interface TaskFormDialogProps {
  open: boolean;
  projectId?: string;
  /** Required when projectId isn't given, to show the project picker. */
  workspaceId?: string;
  onClose: () => void;
  onCreated: () => void;
}

export function TaskFormDialog({
  open,
  projectId,
  workspaceId,
  onClose,
  onCreated,
}: TaskFormDialogProps) {
  const [title, setTitle] = useState("");
  const [taskType, setTaskType] = useState<TaskType>("follow_up");
  const [dueAt, setDueAt] = useState("");
  const [pickedProject, setPickedProject] = useState<ProjectOption | null>(null);
  const [isPending, startTransition] = useTransition();

  const needsProjectPick = !projectId;

  function reset() {
    setTitle("");
    setTaskType("follow_up");
    setDueAt("");
    setPickedProject(null);
  }

  function handleClose() {
    reset();
    onClose();
  }

  function handleCreate() {
    if (!title.trim()) {
      toast.error("El título es requerido");
      return;
    }
    if (needsProjectPick && !pickedProject) {
      toast.error("Selecciona un proyecto");
      return;
    }

    startTransition(async () => {
      const result = await createTask({
        project_id: (projectId ?? pickedProject?.id)!,
        title: title.trim(),
        task_type: taskType,
        due_at: dueAt ? new Date(dueAt).toISOString() : undefined,
      });

      if (!result.ok) {
        toast.error(result.error ?? "Error al crear la tarea");
        return;
      }

      toast.success("Tarea creada");
      onCreated();
      handleClose();
    });
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nueva tarea</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          {needsProjectPick && (
            <div className="space-y-1.5">
              <Label className="text-xs">Proyecto</Label>
              {pickedProject ? (
                <div className="flex items-center justify-between rounded-md border border-border/50 px-3 py-2">
                  <span className="text-sm">{pickedProject.name}</span>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 text-xs"
                    onClick={() => setPickedProject(null)}
                  >
                    Cambiar
                  </Button>
                </div>
              ) : (
                workspaceId && (
                  <ProjectPicker workspaceId={workspaceId} onSelect={setPickedProject} />
                )
              )}
            </div>
          )}

          <div className="space-y-1.5">
            <Label className="text-xs">Título</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ej. Enviar propuesta al cliente"
              className="h-8 text-sm"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Tipo</Label>
              <Select value={taskType} onValueChange={(v) => setTaskType(v as TaskType)}>
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(TASK_TYPE_LABELS) as TaskType[]).map((t) => (
                    <SelectItem key={t} value={t}>
                      {TASK_TYPE_LABELS[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Vence</Label>
              <Input
                type="datetime-local"
                value={dueAt}
                onChange={(e) => setDueAt(e.target.value)}
                className="h-8 text-sm"
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={handleClose}>
            Cancelar
          </Button>
          <Button size="sm" onClick={handleCreate} disabled={isPending}>
            {isPending ? "Creando..." : "Crear tarea"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
