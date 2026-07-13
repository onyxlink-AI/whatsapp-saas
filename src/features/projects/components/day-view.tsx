"use client";

import { useEffect, useState } from "react";
import { addDays, format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { listAgendaTasksForDay } from "@/features/projects/services/agenda-actions";
import type { AgendaTaskRow } from "@/features/projects/types";
import { AgendaTaskItem } from "./agenda-task-item";
import { AgendaTaskFormDialog } from "./agenda-task-form-dialog";

interface DayViewProps {
  workspaceId: string;
  date: string;
  onDateChange: (date: string) => void;
}

export function DayView({ workspaceId, date, onDateChange }: DayViewProps) {
  const [tasks, setTasks] = useState<AgendaTaskRow[]>([]);
  const [formOpen, setFormOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<AgendaTaskRow | null>(null);

  async function refresh() {
    const data = await listAgendaTasksForDay(workspaceId, date);
    setTasks(data);
  }

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId, date]);

  function shiftDay(delta: number) {
    onDateChange(format(addDays(parseISO(date), delta), "yyyy-MM-dd"));
  }

  function handleAdd() {
    setEditingTask(null);
    setFormOpen(true);
  }

  function handleEdit(task: AgendaTaskRow) {
    setEditingTask(task);
    setFormOpen(true);
  }

  const label = format(parseISO(date), "EEEE d 'de' MMMM", { locale: es });

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2 flex-wrap">
        <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => shiftDay(-1)}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 text-xs shrink-0"
          onClick={() => onDateChange(format(new Date(), "yyyy-MM-dd"))}
        >
          Hoy
        </Button>
        <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => shiftDay(1)}>
          <ChevronRight className="h-4 w-4" />
        </Button>
        <span className="text-sm font-medium capitalize ml-1 truncate">{label}</span>

        <Button
          size="sm"
          className="h-8 text-xs gap-1.5 ml-auto"
          onClick={handleAdd}
        >
          <Plus className="h-3.5 w-3.5" />
          Nueva tarea
        </Button>
      </div>

      <div className="space-y-2">
        {tasks.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-8">
            Sin tareas para este día
          </p>
        )}
        {tasks.map((task) => (
          <AgendaTaskItem
            key={task.id}
            task={task}
            onEdit={handleEdit}
            onChanged={refresh}
          />
        ))}
      </div>

      <AgendaTaskFormDialog
        open={formOpen}
        workspaceId={workspaceId}
        task={editingTask}
        defaultMode="day"
        defaultDate={date}
        onClose={() => setFormOpen(false)}
        onSaved={refresh}
      />
    </div>
  );
}
