"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronRight, MoreVertical, FolderInput, FolderMinus, UserPlus } from "lucide-react";
import {
  completeTask,
  deleteTask,
  reassignTask,
  updateTask,
} from "@/features/projects/services/task-actions";
import {
  listWorkspaceMembers,
  type WorkspaceMember,
} from "@/features/projects/services/project-actions";
import { InviteMemberDialog } from "@/features/team/components/invite-member-dialog";
import {
  TASK_TYPE_LABELS,
  type ProjectOption,
  type TaskRow as TaskRowType,
} from "@/features/projects/types";
import { SubtaskList } from "./subtask-list";
import { ProjectPicker } from "./project-picker";

interface TaskRowProps {
  task: TaskRowType & { project?: ProjectOption | null };
  workspaceId: string;
  members: WorkspaceMember[];
  onChanged: () => void;
}

function isOverdue(task: TaskRowType) {
  if (!task.due_at) return false;
  if (task.status === "done" || task.status === "cancelled") return false;
  return new Date(task.due_at) < new Date();
}

export function TaskRow({ task, workspaceId, members, onChanged }: TaskRowProps) {
  const [isPending, startTransition] = useTransition();
  const [expanded, setExpanded] = useState(false);
  const [associateOpen, setAssociateOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  // Miembros invitados desde este mismo menú, hasta que la próxima carga de
  // la página los traiga ya incluidos en `members`.
  const [extraMembers, setExtraMembers] = useState<WorkspaceMember[]>([]);
  const allMembers = [...members, ...extraMembers.filter((e) => !members.some((m) => m.user_id === e.user_id))];

  function handleAssociate(project: ProjectOption) {
    startTransition(async () => {
      const result = await updateTask(task.id, { project_id: project.id });
      if (!result.ok) {
        toast.error(result.error ?? "Error al asociar el proyecto");
        return;
      }
      setAssociateOpen(false);
      onChanged();
    });
  }

  function handleDisassociate() {
    startTransition(async () => {
      const result = await updateTask(task.id, { project_id: null });
      if (!result.ok) {
        toast.error(result.error ?? "Error al desasociar el proyecto");
        return;
      }
      onChanged();
    });
  }

  function handleToggle() {
    startTransition(async () => {
      const result = await completeTask(task.id);
      if (!result.ok) {
        toast.error(result.error ?? "Error al completar la tarea");
        return;
      }
      onChanged();
    });
  }

  function handleReassign(userId: string) {
    startTransition(async () => {
      const result = await reassignTask(task.id, userId);
      if (!result.ok) {
        toast.error(result.error ?? "Error al reasignar");
        return;
      }
      onChanged();
    });
  }

  function handleDelete() {
    startTransition(async () => {
      const result = await deleteTask(task.id);
      if (!result.ok) {
        toast.error(result.error ?? "Error al eliminar la tarea");
        return;
      }
      onChanged();
    });
  }

  const assignee = members.find((m) => m.user_id === task.assigned_to);

  return (
    <div className="border-b border-border/30 last:border-0">
      <div className="flex items-center gap-3 px-3 py-2">
        <Button
          variant="ghost"
          size="icon"
          className="h-5 w-5 shrink-0"
          onClick={() => setExpanded((v) => !v)}
          aria-label={expanded ? "Ocultar subtareas" : "Mostrar subtareas"}
          aria-expanded={expanded}
        >
          {expanded ? (
            <ChevronDown className="h-3.5 w-3.5" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5" />
          )}
        </Button>
        <Checkbox
          checked={task.status === "done"}
          onCheckedChange={handleToggle}
          disabled={isPending}
          aria-label={`Marcar "${task.title}" como completada`}
        />
        <div className="flex-1 min-w-0">
          <p
            className={
              task.status === "done"
                ? "text-sm line-through text-muted-foreground truncate"
                : "text-sm truncate"
            }
          >
            {task.title}
          </p>
          <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
            <span>{TASK_TYPE_LABELS[task.task_type]}</span>
            {task.due_at && (
              <span className={isOverdue(task) ? "text-destructive" : undefined}>
                {new Intl.DateTimeFormat("es-MX", {
                  day: "2-digit",
                  month: "short",
                  hour: "2-digit",
                  minute: "2-digit",
                }).format(new Date(task.due_at))}
              </span>
            )}
            {assignee && <span>{assignee.full_name}</span>}
            {task.project && <span>· {task.project.name}</span>}
          </div>
        </div>
        {isOverdue(task) && (
          <Badge variant="destructive" className="text-[9px] h-4 px-1.5">
            Vencida
          </Badge>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="icon" variant="ghost" className="h-6 w-6" aria-label="Más opciones de la tarea">
              <MoreVertical className="h-3.5 w-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {allMembers.map((m) => (
              <DropdownMenuItem key={m.user_id} onClick={() => handleReassign(m.user_id)}>
                Asignar a {m.full_name}
              </DropdownMenuItem>
            ))}
            <DropdownMenuItem onClick={() => setInviteOpen(true)}>
              <UserPlus className="h-3.5 w-3.5" aria-hidden />
              Añadir miembro
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setAssociateOpen(true)}>
              <FolderInput className="h-3.5 w-3.5" aria-hidden />
              {task.project_id ? "Cambiar de proyecto" : "Asociar a proyecto"}
            </DropdownMenuItem>
            {task.project_id && (
              <DropdownMenuItem onClick={handleDisassociate}>
                <FolderMinus className="h-3.5 w-3.5" aria-hidden />
                Quitar del proyecto
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onClick={handleDelete} className="text-destructive">
              Eliminar
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {expanded && <SubtaskList taskId={task.id} members={members} />}

      <Dialog open={associateOpen} onOpenChange={setAssociateOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Asociar a un proyecto</DialogTitle>
          </DialogHeader>
          <ProjectPicker workspaceId={workspaceId} onSelect={handleAssociate} />
        </DialogContent>
      </Dialog>

      <InviteMemberDialog
        open={inviteOpen}
        workspaceId={workspaceId}
        onClose={() => setInviteOpen(false)}
        onInvited={async (userId) => {
          setInviteOpen(false);
          const fresh = await listWorkspaceMembers(workspaceId);
          setExtraMembers(fresh);
          handleReassign(userId);
        }}
      />
    </div>
  );
}
