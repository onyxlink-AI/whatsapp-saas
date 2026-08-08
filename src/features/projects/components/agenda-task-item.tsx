"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Copy, Pencil, Trash2, Video } from "lucide-react";
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

/** "11:00:00" -> "11:00" — Postgres TIME always includes seconds. */
function formatTime(time: string): string {
  return time.slice(0, 5);
}

function timeRangeLabel(task: AgendaTaskRow): string | null {
  if (!task.start_time) return null;
  return task.end_time
    ? `${formatTime(task.start_time)}–${formatTime(task.end_time)}`
    : formatTime(task.start_time);
}

export function AgendaTaskItem({ task, onEdit, onChanged }: AgendaTaskItemProps) {
  const [isPending, startTransition] = useTransition();

  function handleToggle() {
    startTransition(async () => {
      const result = await toggleAgendaTaskDone(task.workspace_id, task.id, !task.done);
      if (!result.ok) {
        toast.error(result.error ?? "Error al actualizar la tarea");
        return;
      }
      onChanged();
    });
  }

  function handleCopyLink() {
    if (!task.meeting_link) return;
    void navigator.clipboard.writeText(task.meeting_link);
    toast.success("Enlace copiado");
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
        <div className="flex items-center gap-1.5 flex-wrap">
          {timeRangeLabel(task) && (
            <span className="text-[11px] font-medium text-muted-foreground tabular-nums shrink-0">
              {timeRangeLabel(task)}
            </span>
          )}
          <p
            className={cn(
              "text-sm font-medium",
              task.done && "line-through text-muted-foreground",
            )}
          >
            {task.title}
          </p>
        </div>
        {task.notes && (
          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
            {task.notes}
          </p>
        )}
        {task.meeting_link && (
          <div className="flex items-center gap-1.5 mt-1">
            <a
              href={task.meeting_link}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-primary hover:underline truncate"
            >
              <Video className="h-3 w-3 shrink-0" />
              Enlace de la reunión
            </a>
            <Button
              variant="ghost"
              size="icon"
              className="h-5 w-5 shrink-0"
              onClick={handleCopyLink}
              aria-label="Copiar enlace de la reunión"
            >
              <Copy className="h-3 w-3" />
            </Button>
          </div>
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
