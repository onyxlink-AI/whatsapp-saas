"use client";

import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { Undo2, History } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { listCancelledAgendaTasks, restoreAgendaTask } from "@/features/projects/services/agenda-actions";
import type { AgendaTaskRow } from "@/features/projects/types";

interface AgendaCancelledPanelProps {
  workspaceId: string;
}

/**
 * Fase 4B: vista de recuperación de tareas de Agenda canceladas
 * (cancelled_at) — listAgendaTasksForDay/Week y searchAgendaTasks ya las
 * ocultan de los listados normales; esta es la única vía para volver a
 * verlas y restaurarlas. Cancelar en sí solo ocurre a través del flujo de
 * confirmación del Asistente de Ayuda — este panel es puramente de lectura
 * + restaurar, nunca cancela nada.
 */
export function AgendaCancelledPanel({ workspaceId }: AgendaCancelledPanelProps) {
  const [open, setOpen] = useState(false);
  const [tasks, setTasks] = useState<AgendaTaskRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [isPending, startTransition] = useTransition();

  async function refresh() {
    const data = await listCancelledAgendaTasks(workspaceId);
    setTasks(data);
    setLoaded(true);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carga las canceladas la primera vez que se abre el panel.
    if (open && !loaded) void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function handleRestore(task: AgendaTaskRow) {
    startTransition(async () => {
      const result = await restoreAgendaTask(workspaceId, task.id);
      if (!result.ok) {
        toast.error(result.error ?? "Error al restaurar la tarea");
        return;
      }
      toast.success(`"${task.title}" restaurada`);
      setTasks((prev) => prev.filter((t) => t.id !== task.id));
    });
  }

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        className="h-8 text-xs gap-1.5 shrink-0"
        onClick={() => setOpen(true)}
      >
        <History className="h-3.5 w-3.5" />
        Canceladas
      </Button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent className="flex w-full flex-col sm:max-w-sm">
          <SheetHeader>
            <SheetTitle>Tareas de Agenda canceladas</SheetTitle>
            <SheetDescription>
              Canceladas por el Asistente de Ayuda con confirmación del usuario. No se han borrado — puedes restaurarlas.
            </SheetDescription>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto space-y-2 mt-2">
            {loaded && tasks.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-8">No hay tareas canceladas</p>
            )}
            {tasks.map((task) => (
              <div
                key={task.id}
                className="flex items-start gap-2 rounded-md border border-border/40 px-3 py-2.5"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{task.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {task.scheduled_date ? `Cancelada — era del ${task.scheduled_date}` : "Cancelada"}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs gap-1 shrink-0"
                  onClick={() => handleRestore(task)}
                  disabled={isPending}
                  aria-label={`Restaurar "${task.title}"`}
                >
                  <Undo2 className="h-3.5 w-3.5" />
                  Restaurar
                </Button>
              </div>
            ))}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
