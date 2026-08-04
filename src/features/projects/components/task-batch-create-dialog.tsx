"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Loader2, AlertTriangle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { createTasksBatch } from "@/features/projects/services/task-actions";
import type { WorkspaceMember } from "@/features/projects/services/project-actions";
import { TASK_TYPE_LABELS, type ProjectOption, type TaskType } from "@/features/projects/types";
import { ProjectPicker } from "./project-picker";

interface TaskBatchCreateDialogProps {
  open: boolean;
  workspaceId: string;
  members: WorkspaceMember[];
  onClose: () => void;
  onCreated: () => void;
}

/** Una tarea por línea — más simple y seguro que filas dinámicas para un primer lote. */
function parseLines(raw: string): string[] {
  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

export function TaskBatchCreateDialog({
  open,
  workspaceId,
  members,
  onClose,
  onCreated,
}: TaskBatchCreateDialogProps) {
  const [raw, setRaw] = useState("");
  const [project, setProject] = useState<ProjectOption | null>(null);
  const [assignedTo, setAssignedTo] = useState<string>("");
  const [taskType, setTaskType] = useState<TaskType>("follow_up");
  const [dueAt, setDueAt] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [isPending, startTransition] = useTransition();

  const titles = parseLines(raw);

  function reset() {
    setRaw("");
    setProject(null);
    setAssignedTo("");
    setTaskType("follow_up");
    setDueAt("");
    setConfirming(false);
  }

  function handleClose() {
    reset();
    onClose();
  }

  function handleConfirmStep() {
    if (titles.length === 0) {
      toast.error("Escribe al menos un título de tarea");
      return;
    }
    setConfirming(true);
  }

  function handleCreate() {
    startTransition(async () => {
      const result = await createTasksBatch(
        workspaceId,
        titles.map((title) => ({
          title,
          project_id: project?.id ?? null,
          assigned_to: assignedTo || null,
          task_type: taskType,
          due_at: dueAt ? new Date(dueAt).toISOString() : undefined,
        })),
      );

      if (!result.ok) {
        toast.error(result.error ?? "Error al crear las tareas");
        return;
      }

      const { created, failed } = result.data;
      if (failed.length === 0) {
        toast.success(`${created} tarea${created === 1 ? "" : "s"} creada${created === 1 ? "" : "s"}`);
      } else {
        toast.warning(
          `${created} creada${created === 1 ? "" : "s"}, ${failed.length} con error`,
        );
      }

      onCreated();
      handleClose();
    });
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Crear tareas en lote</DialogTitle>
        </DialogHeader>

        {!confirming ? (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Una tarea por línea</Label>
              <Textarea
                value={raw}
                onChange={(e) => setRaw(e.target.value)}
                placeholder={"Enviar propuesta\nLlamar al cliente\nRevisar contrato"}
                className="min-h-32 text-sm"
              />
              <p className="text-[11px] text-muted-foreground">
                {titles.length} tarea{titles.length === 1 ? "" : "s"} detectada{titles.length === 1 ? "" : "s"}
              </p>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Proyecto común (opcional)</Label>
              {project ? (
                <div className="flex items-center justify-between rounded-md border border-border/50 px-3 py-2">
                  <span className="text-sm">{project.name}</span>
                  <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setProject(null)}>
                    Quitar
                  </Button>
                </div>
              ) : (
                <ProjectPicker workspaceId={workspaceId} onSelect={setProject} />
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Responsable común (opcional)</Label>
                <Select value={assignedTo || "none"} onValueChange={(v) => setAssignedTo(v === "none" ? "" : v)}>
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sin asignar</SelectItem>
                    {members.map((m) => (
                      <SelectItem key={m.user_id} value={m.user_id}>
                        {m.full_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Tipo común</Label>
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
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Fecha límite común (opcional)</Label>
              <Input
                type="datetime-local"
                value={dueAt}
                onChange={(e) => setDueAt(e.target.value)}
                className="h-8 text-sm"
              />
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-foreground">
              Vas a crear <strong>{titles.length}</strong> tarea{titles.length === 1 ? "" : "s"}
              {project ? ` en "${project.name}"` : ""}:
            </p>
            <div className="max-h-48 overflow-y-auto rounded-md border border-border/40 p-2">
              <ul className="space-y-1 text-xs text-muted-foreground">
                {titles.map((title, i) => (
                  <li key={i} className="truncate">• {title}</li>
                ))}
              </ul>
            </div>
          </div>
        )}

        <DialogFooter>
          {confirming ? (
            <>
              <Button variant="outline" size="sm" onClick={() => setConfirming(false)} disabled={isPending}>
                Volver
              </Button>
              <Button size="sm" onClick={handleCreate} disabled={isPending} aria-busy={isPending}>
                {isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" aria-hidden />}
                {isPending ? "Creando..." : `Crear ${titles.length} tarea${titles.length === 1 ? "" : "s"}`}
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" size="sm" onClick={handleClose}>
                Cancelar
              </Button>
              <Button size="sm" onClick={handleConfirmStep} className="gap-1.5">
                <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
                Revisar antes de crear
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
