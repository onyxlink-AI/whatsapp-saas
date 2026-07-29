"use client";

import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Trash2 } from "lucide-react";
import {
  createSubtask,
  deleteSubtask,
  listSubtasks,
  toggleSubtask,
} from "@/features/projects/services/subtask-actions";
import type { SubtaskRow } from "@/features/projects/types";

interface SubtaskListProps {
  taskId: string;
}

export function SubtaskList({ taskId }: SubtaskListProps) {
  const [subtasks, setSubtasks] = useState<SubtaskRow[]>([]);
  const [title, setTitle] = useState("");
  const [isPending, startTransition] = useTransition();

  async function refresh() {
    setSubtasks(await listSubtasks(taskId));
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- refetches subtasks whenever the parent task changes.
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskId]);

  function handleAdd() {
    if (!title.trim()) return;
    startTransition(async () => {
      const result = await createSubtask({ task_id: taskId, title: title.trim() });
      if (!result.ok) {
        toast.error(result.error ?? "Error al crear la subtarea");
        return;
      }
      setTitle("");
      refresh();
    });
  }

  function handleToggle(subtask: SubtaskRow) {
    startTransition(async () => {
      const result = await toggleSubtask(subtask.id, !subtask.done);
      if (!result.ok) {
        toast.error(result.error ?? "Error al actualizar la subtarea");
        return;
      }
      refresh();
    });
  }

  function handleDelete(subtaskId: string) {
    startTransition(async () => {
      const result = await deleteSubtask(subtaskId);
      if (!result.ok) {
        toast.error(result.error ?? "Error al eliminar la subtarea");
        return;
      }
      refresh();
    });
  }

  return (
    <div className="pl-8 pr-3 py-2 space-y-1.5 bg-muted/20">
      {subtasks.map((subtask) => (
        <div key={subtask.id} className="flex items-center gap-2">
          <Checkbox
            checked={subtask.done}
            onCheckedChange={() => handleToggle(subtask)}
            disabled={isPending}
            className="h-3.5 w-3.5"
            aria-label={`Marcar "${subtask.title}" como completada`}
          />
          <span
            className={
              subtask.done
                ? "text-xs line-through text-muted-foreground flex-1 truncate min-w-0"
                : "text-xs flex-1 truncate min-w-0"
            }
          >
            {subtask.title}
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="h-5 w-5"
            onClick={() => handleDelete(subtask.id)}
            disabled={isPending}
            aria-label={`Eliminar subtarea "${subtask.title}"`}
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      ))}

      <div className="flex items-center gap-2">
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              handleAdd();
            }
          }}
          placeholder="Nueva subtarea..."
          aria-label="Nueva subtarea"
          className="h-6 text-xs"
        />
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 shrink-0"
          onClick={handleAdd}
          disabled={isPending || !title.trim()}
          aria-label="Agregar subtarea"
        >
          <Plus className="h-3 w-3" />
        </Button>
      </div>
    </div>
  );
}
