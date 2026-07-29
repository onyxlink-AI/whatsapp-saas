"use client";

import { useEffect, useState, useTransition } from "react";
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
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Plus, Trash2 } from "lucide-react";
import {
  deleteProject,
  getProject,
  updateProject,
  type WorkspaceMember,
} from "@/features/projects/services/project-actions";
import { listTasks } from "@/features/projects/services/task-actions";
import { ContactPicker } from "./contact-picker";
import { TaskRow } from "./task-row";
import { TaskFormDialog } from "./task-form-dialog";
import {
  PROJECT_PRIORITIES,
  PROJECT_PRIORITY_LABELS,
  PROJECT_STATUSES,
  PROJECT_STATUS_LABELS,
  type ContactOption,
  type ProjectPriority,
  type ProjectStatus,
  type ProjectWithContact,
  type TaskRow as TaskRowType,
} from "@/features/projects/types";

interface ProjectDetailDialogProps {
  projectId: string;
  workspaceId: string;
  members: WorkspaceMember[];
  onClose: () => void;
  onSaved: (project: ProjectWithContact) => void;
  onDeleted: (projectId: string) => void;
}

export function ProjectDetailDialog({
  projectId,
  workspaceId,
  members,
  onClose,
  onSaved,
  onDeleted,
}: ProjectDetailDialogProps) {
  const [project, setProject] = useState<ProjectWithContact | null>(null);
  const [name, setName] = useState("");
  const [contact, setContact] = useState<ContactOption | null>(null);
  const [pickingContact, setPickingContact] = useState(false);
  const [responsibleId, setResponsibleId] = useState("none");
  const [dueDate, setDueDate] = useState("");
  const [priority, setPriority] = useState<ProjectPriority>("media");
  const [status, setStatus] = useState<ProjectStatus>("pendiente");
  const [description, setDescription] = useState("");
  const [notes, setNotes] = useState("");
  const [tasks, setTasks] = useState<TaskRowType[]>([]);
  const [taskDialogOpen, setTaskDialogOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  async function refreshTasks() {
    setTasks(await listTasks(workspaceId, { projectId }));
  }

  useEffect(() => {
    void getProject(projectId).then((data) => {
      if (!data) return;
      setProject(data);
      setName(data.name);
      setContact(data.contact);
      setResponsibleId(data.responsible_id ?? "none");
      setDueDate(data.due_date ?? "");
      setPriority(data.priority);
      setStatus(data.status);
      setDescription(data.description ?? "");
      setNotes(data.notes ?? "");
    });
    // eslint-disable-next-line react-hooks/set-state-in-effect -- refetches the project's subtasks whenever the open project changes.
    void refreshTasks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  function handleSave() {
    startTransition(async () => {
      const result = await updateProject(projectId, {
        name: name.trim(),
        contact_id: contact?.id ?? null,
        responsible_id: responsibleId === "none" ? null : responsibleId,
        due_date: dueDate || undefined,
        priority,
        status,
        description: description || undefined,
        notes: notes || undefined,
      });

      if (!result.ok) {
        toast.error(result.error ?? "Error al guardar el proyecto");
        return;
      }

      const updated = await getProject(projectId);
      if (updated) onSaved(updated);
      toast.success("Proyecto actualizado");
    });
  }

  function handleDelete() {
    const ok = window.confirm(
      `¿Eliminar el proyecto "${project?.name}"? Esta acción no se puede deshacer.`,
    );
    if (!ok) return;

    startTransition(async () => {
      const result = await deleteProject(projectId);
      if (!result.ok) {
        toast.error(result.error ?? "Error al eliminar el proyecto");
        return;
      }
      onDeleted(projectId);
      onClose();
    });
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{project?.name || "Proyecto"}</DialogTitle>
        </DialogHeader>

        {project && (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Nombre</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="h-8 text-sm"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Cliente asociado</Label>
              {contact && !pickingContact ? (
                <div className="flex items-center justify-between rounded-md border border-border/50 px-3 py-2">
                  <div className="flex flex-col">
                    <span className="text-sm">{contact.name || "Sin nombre"}</span>
                    <span className="text-xs text-muted-foreground font-mono">
                      {contact.phone}
                    </span>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 text-xs"
                    onClick={() => setPickingContact(true)}
                  >
                    Cambiar
                  </Button>
                </div>
              ) : (
                <ContactPicker
                  workspaceId={workspaceId}
                  onSelect={(c) => {
                    setContact(c);
                    setPickingContact(false);
                  }}
                />
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Estado</Label>
                <Select value={status} onValueChange={(v) => setStatus(v as ProjectStatus)}>
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PROJECT_STATUSES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {PROJECT_STATUS_LABELS[s]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Prioridad</Label>
                <Select value={priority} onValueChange={(v) => setPriority(v as ProjectPriority)}>
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PROJECT_PRIORITIES.map((p) => (
                      <SelectItem key={p} value={p}>
                        {PROJECT_PRIORITY_LABELS[p]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Responsable</Label>
                <Select value={responsibleId} onValueChange={setResponsibleId}>
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
                <Label className="text-xs">Fecha límite</Label>
                <Input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="h-8 text-sm"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Descripción</Label>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="text-sm min-h-16"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Notas</Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="text-sm min-h-16"
              />
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-xs">Tareas</Label>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 text-xs gap-1"
                  onClick={() => setTaskDialogOpen(true)}
                >
                  <Plus className="h-3 w-3" />
                  Agregar
                </Button>
              </div>
              <div className="rounded-md border border-border/40">
                {tasks.length === 0 && (
                  <p className="text-xs text-muted-foreground text-center py-3">
                    Todavía no hay tareas
                  </p>
                )}
                {tasks.map((task) => (
                  <TaskRow
                    key={task.id}
                    task={task}
                    members={members}
                    onChanged={refreshTasks}
                  />
                ))}
              </div>
            </div>
          </div>
        )}

        <DialogFooter className="sm:justify-between">
          <Button
            variant="ghost"
            size="sm"
            className="text-destructive gap-1.5"
            onClick={handleDelete}
            disabled={isPending}
          >
            <Trash2 className="h-3.5 w-3.5" />
            Eliminar
          </Button>
          <Button size="sm" onClick={handleSave} disabled={isPending} aria-busy={isPending}>
            {isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" aria-hidden />}
            {isPending ? "Guardando..." : "Guardar cambios"}
          </Button>
        </DialogFooter>
      </DialogContent>

      {project && (
        <TaskFormDialog
          open={taskDialogOpen}
          projectId={project.id}
          onClose={() => setTaskDialogOpen(false)}
          onCreated={refreshTasks}
        />
      )}
    </Dialog>
  );
}
