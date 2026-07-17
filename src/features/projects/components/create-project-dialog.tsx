"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  createProject,
  getProject,
  type WorkspaceMember,
} from "@/features/projects/services/project-actions";
import { ContactPicker } from "./contact-picker";
import {
  PROJECT_PRIORITIES,
  PROJECT_PRIORITY_LABELS,
  type ContactOption,
  type ProjectPriority,
  type ProjectWithContact,
} from "@/features/projects/types";

interface CreateProjectDialogProps {
  open: boolean;
  workspaceId: string;
  members: WorkspaceMember[];
  onClose: () => void;
  onCreated: (project: ProjectWithContact) => void;
}

export function CreateProjectDialog({
  open,
  workspaceId,
  members,
  onClose,
  onCreated,
}: CreateProjectDialogProps) {
  const [name, setName] = useState("");
  const [contact, setContact] = useState<ContactOption | null>(null);
  const [responsibleId, setResponsibleId] = useState<string>("none");
  const [dueDate, setDueDate] = useState("");
  const [priority, setPriority] = useState<ProjectPriority>("media");
  const [description, setDescription] = useState("");
  const [isPending, startTransition] = useTransition();

  function reset() {
    setName("");
    setContact(null);
    setResponsibleId("none");
    setDueDate("");
    setPriority("media");
    setDescription("");
  }

  function handleClose() {
    reset();
    onClose();
  }

  function handleCreate() {
    if (!name.trim()) {
      toast.error("El nombre del proyecto es requerido");
      return;
    }

    startTransition(async () => {
      const result = await createProject(workspaceId, {
        name: name.trim(),
        contact_id: contact?.id ?? null,
        responsible_id: responsibleId === "none" ? null : responsibleId,
        due_date: dueDate || undefined,
        priority,
        description: description.trim(),
      });

      if (!result.ok) {
        toast.error(result.error ?? "Error al crear el proyecto");
        return;
      }

      const created = await getProject(result.data.id);
      if (created) onCreated(created);

      toast.success("Proyecto creado");
      handleClose();
    });
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nuevo proyecto</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Nombre del proyecto</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ej. Rediseño de sitio web"
              className="h-8 text-sm"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Cliente asociado (opcional)</Label>
            {contact ? (
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
                  onClick={() => setContact(null)}
                >
                  Cambiar
                </Button>
              </div>
            ) : (
              <ContactPicker workspaceId={workspaceId} onSelect={setContact} />
            )}
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

          <div className="space-y-1.5">
            <Label className="text-xs">Fecha límite</Label>
            <Input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="h-8 text-sm"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Descripción</Label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="h-8 text-sm"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={handleClose}>
            Cancelar
          </Button>
          <Button size="sm" onClick={handleCreate} disabled={isPending} aria-busy={isPending}>
            {isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" aria-hidden />}
            {isPending ? "Creando..." : "Crear proyecto"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
