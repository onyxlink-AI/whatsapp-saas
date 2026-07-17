"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Pencil, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  deleteAgendaTask,
  toggleAgendaTaskDone,
} from "@/features/projects/services/agenda-actions";
import type { AgendaTaskRow } from "@/features/projects/types";

interface AgendaTaskItemProps {
  task: AgendaTaskRow;
  onEdit: (task: AgendaTaskRow) => void;
  onChanged: () => void;
}

export function AgendaTaskItem({ task, onEdit, onChanged }: AgendaTaskItemProps) {
  const [isPending, startTransition] = useTransition();

  function handleToggle() {
    startTransition(async () => {
      const result = await toggleAgendaTaskDone(task.id, !task.done);
      if (!result.ok) {
        toast.error(result.error ?? "Error al actualizar la tarea");
        return;
      }
      onChanged();
    });
  }

  function handleDelete() {
    const ok = window.confirm(`¿Eliminar la tarea "${task.title}"?`);
    if (!ok) return;

    startTransition(async () => {
      const result = await deleteAgendaTask(task.id);
      if (!result.ok) {
        toast.error(result.error ?? "Error al eliminar la tarea");
        return;
      }
      onChanged();
    });
  }

  return (
    <div className="flex items-start gap-3 rounded-md border border-border/40 px-3 py-2.5">
      <Checkbox
        checked={task.done}
        onCheckedChange={handleToggle}
        disabled={isPending}
        className="mt-0.5"
        aria-label={`Marcar "${task.title}" como completada`}
      />
      <div className="flex-1 min-w-0">
        <p
          className={cn(
            "text-sm font-medium",
            task.done && "line-through text-muted-foreground",
          )}
        >
          {task.title}
        </p>
        {task.notes && (
          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
            {task.notes}
          </p>
        )}
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={() => onEdit(task)}
          aria-label={`Editar "${task.title}"`}
        >
          <Pencil className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-destructive"
          onClick={handleDelete}
          disabled={isPending}
          aria-label={`Eliminar "${task.title}"`}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}
