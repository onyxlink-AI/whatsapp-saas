"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { MoreVertical } from "lucide-react";
import { completeTask, deleteTask, reassignTask } from "@/features/pipeline/services/task-actions";
import { TASK_TYPE_LABELS, type TaskRow as TaskRowType } from "@/features/pipeline/types";
import type { WorkspaceMember } from "@/features/pipeline/services/deal-actions";

interface TaskRowProps {
  task: TaskRowType;
  members: WorkspaceMember[];
  onChanged: () => void;
}

function isOverdue(task: TaskRowType) {
  if (!task.due_at) return false;
  if (task.status === "done" || task.status === "cancelled") return false;
  return new Date(task.due_at) < new Date();
}

export function TaskRow({ task, members, onChanged }: TaskRowProps) {
  const [isPending, startTransition] = useTransition();

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
    <div className="flex items-center gap-3 px-3 py-2 border-b border-border/30 last:border-0">
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
          {members.map((m) => (
            <DropdownMenuItem key={m.user_id} onClick={() => handleReassign(m.user_id)}>
              Asignar a {m.full_name}
            </DropdownMenuItem>
          ))}
          <DropdownMenuItem onClick={handleDelete} className="text-destructive">
            Eliminar
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
