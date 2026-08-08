"use client";

import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { GripVertical, Plus, Trash2 } from "lucide-react";
import {
  createSubtask,
  deleteSubtask,
  listSubtasks,
  reorderSubtasks,
  toggleSubtask,
  updateSubtask,
} from "@/features/projects/services/subtask-actions";
import type { SubtaskRow } from "@/features/projects/types";
import type { WorkspaceMember } from "@/features/projects/services/project-actions";

interface SubtaskListProps {
  workspaceId: string;
  taskId: string;
  members: WorkspaceMember[];
}

function SubtaskItem({
  subtask,
  members,
  isPending,
  onToggle,
  onAssign,
  onDueDate,
  onDelete,
}: {
  subtask: SubtaskRow;
  members: WorkspaceMember[];
  isPending: boolean;
  onToggle: () => void;
  onAssign: (userId: string | null) => void;
  onDueDate: (value: string | null) => void;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: subtask.id,
  });
  const [confirmOpen, setConfirmOpen] = useState(false);
  const assignee = members.find((m) => m.user_id === subtask.assigned_to);

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={isDragging ? "opacity-60" : undefined}
    >
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          {...attributes}
          {...listeners}
          className="shrink-0 cursor-grab text-muted-foreground/50 hover:text-muted-foreground"
          aria-label={`Reordenar "${subtask.title}"`}
        >
          <GripVertical className="h-3 w-3" />
        </button>
        <Checkbox
          checked={subtask.done}
          onCheckedChange={onToggle}
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

        <Select
          value={subtask.assigned_to ?? "none"}
          onValueChange={(v) => onAssign(v === "none" ? null : v)}
        >
          <SelectTrigger className="h-5 w-24 text-[10px] border-0 bg-transparent shadow-none px-1">
            <SelectValue placeholder="Sin asignar">{assignee?.full_name ?? "—"}</SelectValue>
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

        <Input
          type="date"
          value={subtask.due_at ? subtask.due_at.slice(0, 10) : ""}
          onChange={(e) => onDueDate(e.target.value ? new Date(e.target.value).toISOString() : null)}
          className="h-5 w-28 text-[10px] px-1"
          aria-label={`Fecha de "${subtask.title}"`}
        />

        <Popover open={confirmOpen} onOpenChange={setConfirmOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-5 w-5 shrink-0"
              aria-label={`Eliminar subtarea "${subtask.title}"`}
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-56 text-xs space-y-2">
            <p>¿Eliminar &quot;{subtask.title}&quot;?</p>
            <div className="flex justify-end gap-2">
              <Button size="sm" variant="ghost" className="h-6 text-[11px]" onClick={() => setConfirmOpen(false)}>
                Cancelar
              </Button>
              <Button
                size="sm"
                variant="destructive"
                className="h-6 text-[11px]"
                onClick={() => {
                  setConfirmOpen(false);
                  onDelete();
                }}
              >
                Eliminar
              </Button>
            </div>
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
}

export function SubtaskList({ workspaceId, taskId, members }: SubtaskListProps) {
  const [subtasks, setSubtasks] = useState<SubtaskRow[]>([]);
  const [title, setTitle] = useState("");
  const [isPending, startTransition] = useTransition();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

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
      const result = await createSubtask(workspaceId, { task_id: taskId, title: title.trim() });
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
      const result = await toggleSubtask(workspaceId, subtask.id, !subtask.done);
      if (!result.ok) {
        toast.error(result.error ?? "Error al actualizar la subtarea");
        return;
      }
      refresh();
    });
  }

  function handleAssign(subtaskId: string, userId: string | null) {
    startTransition(async () => {
      const result = await updateSubtask(workspaceId, subtaskId, { assigned_to: userId });
      if (!result.ok) {
        toast.error(result.error ?? "Error al asignar");
        return;
      }
      refresh();
    });
  }

  function handleDueDate(subtaskId: string, value: string | null) {
    startTransition(async () => {
      const result = await updateSubtask(workspaceId, subtaskId, { due_at: value });
      if (!result.ok) {
        toast.error(result.error ?? "Error al cambiar la fecha");
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

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = subtasks.findIndex((s) => s.id === active.id);
    const newIndex = subtasks.findIndex((s) => s.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = [...subtasks];
    const [moved] = reordered.splice(oldIndex, 1);
    reordered.splice(newIndex, 0, moved);
    setSubtasks(reordered);

    startTransition(async () => {
      const result = await reorderSubtasks({
        task_id: taskId,
        ordered_ids: reordered.map((s) => s.id),
      });
      if (!result.ok) {
        toast.error(result.error ?? "Error al reordenar");
        refresh();
      }
    });
  }

  return (
    <div className="pl-8 pr-3 py-2 space-y-1.5 bg-muted/20">
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={subtasks.map((s) => s.id)} strategy={verticalListSortingStrategy}>
          {subtasks.map((subtask) => (
            <SubtaskItem
              key={subtask.id}
              subtask={subtask}
              members={members}
              isPending={isPending}
              onToggle={() => handleToggle(subtask)}
              onAssign={(userId) => handleAssign(subtask.id, userId)}
              onDueDate={(value) => handleDueDate(subtask.id, value)}
              onDelete={() => handleDelete(subtask.id)}
            />
          ))}
        </SortableContext>
      </DndContext>

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
