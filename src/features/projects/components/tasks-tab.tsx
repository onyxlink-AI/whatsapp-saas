"use client";

import { useEffect, useState } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { listTasks } from "@/features/projects/services/task-actions";
import type { WorkspaceMember } from "@/features/projects/services/project-actions";
import { TASK_STATUS_LABELS, type TaskRow as TaskRowType, type TaskStatus } from "@/features/projects/types";
import { TaskRow } from "./task-row";
import { TaskFormDialog } from "./task-form-dialog";

interface TasksTabProps {
  workspaceId: string;
  initialTasks: TaskRowType[];
  members: WorkspaceMember[];
}

type StatusFilter = TaskStatus | "all" | "overdue";

export function TasksTab({ workspaceId, initialTasks, members }: TasksTabProps) {
  const [tasks, setTasks] = useState(initialTasks);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [createOpen, setCreateOpen] = useState(false);

  async function refresh(filter: StatusFilter = statusFilter) {
    const filters =
      filter === "all"
        ? {}
        : filter === "overdue"
          ? { overdueOnly: true }
          : { status: filter };
    setTasks(await listTasks(workspaceId, filters));
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional: refresh() reloads tasks on filter change
    void refresh(statusFilter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
          <SelectTrigger className="h-8 w-44 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas</SelectItem>
            <SelectItem value="overdue">Vencidas</SelectItem>
            {(Object.keys(TASK_STATUS_LABELS) as TaskStatus[]).map((s) => (
              <SelectItem key={s} value={s}>
                {TASK_STATUS_LABELS[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button
          size="sm"
          className="h-8 text-xs gap-1.5 ml-auto"
          onClick={() => setCreateOpen(true)}
        >
          <Plus className="h-3.5 w-3.5" />
          Nueva tarea
        </Button>
      </div>

      <div className="rounded-md border border-border/40">
        {tasks.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-6">
            ✅ Todavía no tienes tareas
          </p>
        )}
        {tasks.map((task) => (
          <TaskRow
            key={task.id}
            task={task}
            members={members}
            onChanged={() => refresh()}
          />
        ))}
      </div>

      <TaskFormDialog
        open={createOpen}
        workspaceId={workspaceId}
        onClose={() => setCreateOpen(false)}
        onCreated={() => refresh()}
      />
    </div>
  );
}
