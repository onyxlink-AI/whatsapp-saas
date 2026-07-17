"use client";

import { useEffect, useState } from "react";
import { addDays, addWeeks, format, parseISO, startOfWeek } from "date-fns";
import { es } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { listAgendaTasksForWeek } from "@/features/projects/services/agenda-actions";
import type { AgendaTaskRow } from "@/features/projects/types";
import { AgendaTaskItem } from "./agenda-task-item";
import { AgendaTaskFormDialog } from "./agenda-task-form-dialog";

interface WeekViewProps {
  workspaceId: string;
  date: string;
  onDateChange: (date: string) => void;
}

export function WeekView({ workspaceId, date, onDateChange }: WeekViewProps) {
  const [tasks, setTasks] = useState<AgendaTaskRow[]>([]);
  const [formOpen, setFormOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<AgendaTaskRow | null>(null);

  const weekStartDate = startOfWeek(parseISO(date), { weekStartsOn: 1 });
  const weekStart = format(weekStartDate, "yyyy-MM-dd");

  async function refresh() {
    const data = await listAgendaTasksForWeek(workspaceId, weekStart);
    setTasks(data);
  }

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId, weekStart]);

  function shiftWeek(delta: number) {
    onDateChange(format(addWeeks(weekStartDate, delta), "yyyy-MM-dd"));
  }

  function handleAdd() {
    setEditingTask(null);
    setFormOpen(true);
  }

  function handleEdit(task: AgendaTaskRow) {
    setEditingTask(task);
    setFormOpen(true);
  }

  const label = `${format(weekStartDate, "d MMM", { locale: es })} – ${format(
    addDays(weekStartDate, 6),
    "d MMM",
    { locale: es },
  )}`;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2 flex-wrap">
        <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => shiftWeek(-1)} aria-label="Semana anterior">
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 text-xs shrink-0"
          onClick={() => onDateChange(format(new Date(), "yyyy-MM-dd"))}
        >
          Esta semana
        </Button>
        <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => shiftWeek(1)} aria-label="Semana siguiente">
          <ChevronRight className="h-4 w-4" />
        </Button>
        <span className="text-sm font-medium ml-1 truncate">Semana del {label}</span>

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
            Sin tareas para esta semana
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
        defaultMode="week"
        defaultDate={weekStart}
        onClose={() => setFormOpen(false)}
        onSaved={refresh}
      />
    </div>
  );
}
