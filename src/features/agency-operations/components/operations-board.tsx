"use client";

import { useCallback, useEffect, useState } from "react";
import { TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/page-header";
import { ScheduleGrid } from "./schedule-grid";
import { ScheduleFormSheet } from "./schedule-form-sheet";
import { listScheduleBlocks, listScheduleResponsibles } from "../services/schedule-actions";
import type { AgencyScheduleBlockWithResponsible, ResponsiblesDirectoryState, ScheduleWeekday } from "../types";

export function OperationsBoard() {
  const [blocks, setBlocks] = useState<AgencyScheduleBlockWithResponsible[] | null>(null);
  const [blocksLoading, setBlocksLoading] = useState(true);
  const [blocksError, setBlocksError] = useState<string | null>(null);

  // TAREA 4B.1: estado REAL (loading/ready/error), nunca solo una lista +
  // un error aparte — así ScheduleFormSheet puede distinguir "todavía
  // cargando" de "ya sabemos que este responsable no está", ver su prop
  // responsiblesDirectory.
  const [responsiblesState, setResponsiblesState] = useState<ResponsiblesDirectoryState>({ status: "loading" });

  const [formOpen, setFormOpen] = useState(false);
  const [editingBlock, setEditingBlock] = useState<AgencyScheduleBlockWithResponsible | null>(null);
  const [targetCell, setTargetCell] = useState<{ weekday: ScheduleWeekday; hour: number }>({ weekday: 1, hour: 9 });

  const loadBlocks = useCallback(async () => {
    setBlocksLoading(true);
    setBlocksError(null);
    const result = await listScheduleBlocks();
    if (result.ok) setBlocks(result.data);
    else setBlocksError(result.error);
    setBlocksLoading(false);
  }, []);

  const loadResponsibles = useCallback(async () => {
    setResponsiblesState({ status: "loading" });
    const result = await listScheduleResponsibles();
    setResponsiblesState(result.ok ? { status: "ready", responsibles: result.data } : { status: "error", error: result.error });
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data fetch on mount, same established pattern as kpi-board.tsx/objetivos-board.tsx
    loadBlocks();
    loadResponsibles();
  }, [loadBlocks, loadResponsibles]);

  function handleCreate(weekday: ScheduleWeekday, hour: number) {
    setEditingBlock(null);
    setTargetCell({ weekday, hour });
    setFormOpen(true);
  }

  function handleEdit(block: AgencyScheduleBlockWithResponsible) {
    setEditingBlock(block);
    setTargetCell({ weekday: block.weekday, hour: block.hour });
    setFormOpen(true);
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        eyebrow="Dirección · Operaciones"
        title="Operaciones"
        description="Horario semanal interno de conexión y trabajo del equipo de OnyxLink."
      />

      {responsiblesState.status === "error" && (
        <div role="status" className="flex items-center gap-2 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning">
          <TriangleAlert className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          No se pudo cargar el directorio de responsables. Puedes seguir usando el horario sin asignar responsable.
        </div>
      )}

      {blocksError ? (
        <div className="surface-card flex flex-col items-center gap-3 px-5 py-14 text-center">
          <p className="text-sm font-medium text-destructive">No se pudo cargar el horario</p>
          <p className="text-xs text-muted-foreground">{blocksError}</p>
          <Button variant="outline" size="sm" onClick={loadBlocks}>
            Reintentar
          </Button>
        </div>
      ) : blocksLoading && blocks === null ? (
        <div role="status" aria-live="polite" className="surface-card space-y-2 p-4">
          <span className="sr-only">Cargando horario…</span>
          {[0, 1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-10 w-full rounded-lg" />
          ))}
        </div>
      ) : (
        <div className="surface-card space-y-3 p-4">
          {(blocks ?? []).length === 0 && <p className="text-xs text-muted-foreground">Pulsa una hora para añadir el primer bloque.</p>}
          <ScheduleGrid blocks={blocks ?? []} onCreate={handleCreate} onEdit={handleEdit} />
        </div>
      )}

      <ScheduleFormSheet
        open={formOpen}
        onOpenChange={setFormOpen}
        block={editingBlock}
        initialWeekday={targetCell.weekday}
        initialHour={targetCell.hour}
        responsiblesDirectory={responsiblesState}
        onSaved={loadBlocks}
        onDeleted={loadBlocks}
      />
    </div>
  );
}
