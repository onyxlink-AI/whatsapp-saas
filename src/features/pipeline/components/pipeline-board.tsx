"use client";

import { useMemo, useState, useTransition } from "react";
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { arrayMove } from "@dnd-kit/sortable";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Plus } from "lucide-react";
import {
  DEAL_STAGES,
  type DealStage,
  type DealWithContact,
} from "@/features/pipeline/types";
import { moveDealStage, reorderDeals } from "@/features/pipeline/services/deal-actions";
import { usePipelineFiltersStore } from "@/features/pipeline/store/pipeline-filters-store";
import { PipelineColumn } from "./pipeline-column";
import { DealDetailDialog } from "./deal-detail-dialog";
import { CreateDealDialog } from "./create-deal-dialog";
import type { WorkspaceMember } from "@/features/pipeline/services/deal-actions";
import type { ContactSummary } from "@/features/pipeline/types";

const CLOSED_STAGES: DealStage[] = ["cliente", "lost"];
const OPEN_STAGES = DEAL_STAGES.filter((s) => !CLOSED_STAGES.includes(s));

interface PipelineBoardProps {
  workspaceId: string;
  initialDeals: DealWithContact[];
  members: WorkspaceMember[];
  initialContact?: ContactSummary | null;
  initialSelectedDealId?: string | null;
}

export function PipelineBoard({
  workspaceId,
  initialDeals,
  members,
  initialContact,
  initialSelectedDealId,
}: PipelineBoardProps) {
  const [deals, setDeals] = useState(initialDeals);
  const [selectedDealId, setSelectedDealId] = useState<string | null>(
    initialSelectedDealId ?? null,
  );
  const [createOpen, setCreateOpen] = useState(Boolean(initialContact));
  const [, startTransition] = useTransition();

  const search = usePipelineFiltersStore((s) => s.search);
  const showClosed = usePipelineFiltersStore((s) => s.showClosed);
  const setSearch = usePipelineFiltersStore((s) => s.setSearch);
  const toggleShowClosed = usePipelineFiltersStore((s) => s.toggleShowClosed);

  // Require a small drag distance before dnd-kit takes over the pointer,
  // otherwise it swallows plain clicks and the card's onClick never fires.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  );

  const visibleStages = showClosed ? DEAL_STAGES : OPEN_STAGES;

  const filteredDeals = useMemo(() => {
    if (!search.trim()) return deals;
    const q = search.trim().toLowerCase();
    return deals.filter(
      (d) =>
        d.title.toLowerCase().includes(q) ||
        d.contact?.name?.toLowerCase().includes(q) ||
        d.contact?.phone?.includes(q),
    );
  }, [deals, search]);

  const dealsByStage = useMemo(() => {
    const map = new Map<DealStage, DealWithContact[]>();
    for (const stage of DEAL_STAGES) map.set(stage, []);
    for (const deal of filteredDeals) {
      map.get(deal.stage)?.push(deal);
    }
    return map;
  }, [filteredDeals]);

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over) return;

    const activeDeal = deals.find((d) => d.id === active.id);
    if (!activeDeal) return;

    const overIsColumn = DEAL_STAGES.includes(over.id as DealStage);
    const targetStage = overIsColumn
      ? (over.id as DealStage)
      : deals.find((d) => d.id === over.id)?.stage;

    if (!targetStage) return;

    const columnDeals = deals
      .filter((d) => d.stage === targetStage && d.id !== active.id)
      .sort((a, b) => a.position - b.position);

    const overIndex = overIsColumn
      ? columnDeals.length
      : columnDeals.findIndex((d) => d.id === over.id);

    const insertIndex = overIndex === -1 ? columnDeals.length : overIndex;
    columnDeals.splice(insertIndex, 0, {
      ...activeDeal,
      stage: targetStage,
    });

    const reordered = columnDeals.map((d, index) => ({ ...d, position: index }));

    setDeals((prev) => {
      const others = prev.filter((d) => d.stage !== targetStage && d.id !== active.id);
      return [...others, ...reordered];
    });

    const sameColumn = activeDeal.stage === targetStage;
    const orderedIds = reordered.map((d) => d.id);

    startTransition(async () => {
      const result = sameColumn
        ? await reorderDeals({ stage: targetStage, ordered_ids: orderedIds })
        : await moveDealStage(
            active.id as string,
            targetStage,
            reordered.findIndex((d) => d.id === active.id),
          );

      if (!result.ok) {
        toast.error(result.error ?? "Error al mover el deal");
        setDeals(initialDeals);
      }
    });
  }

  function handleDealSaved(updated: DealWithContact) {
    setDeals((prev) => prev.map((d) => (d.id === updated.id ? updated : d)));
  }

  function handleDealCreated(created: DealWithContact) {
    setDeals((prev) => [...prev, created]);
    // Open the detail dialog right away so the user can immediately edit
    // fields or move it straight to cliente/lost without a second click.
    setSelectedDealId(created.id);
  }

  function handleDealDeleted(dealId: string) {
    setDeals((prev) => prev.filter((d) => d.id !== dealId));
  }

  return (
    <div className="flex flex-col gap-3 h-full">
      <div className="flex items-center gap-3 flex-wrap">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar oportunidad o contacto..."
          className="h-9 w-64 text-xs"
        />
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <Switch checked={showClosed} onCheckedChange={toggleShowClosed} />
          Mostrar cerrados
        </label>
        <Button
          size="sm"
          className="ml-auto h-9 gap-1.5 text-xs"
          onClick={() => setCreateOpen(true)}
        >
          <Plus className="h-3.5 w-3.5" />
          Nueva oportunidad
        </Button>
      </div>

      <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
        <div className="flex gap-3 overflow-x-auto pb-2 flex-1">
          {visibleStages.map((stage) => (
            <PipelineColumn
              key={stage}
              stage={stage}
              deals={(dealsByStage.get(stage) ?? []).sort(
                (a, b) => a.position - b.position,
              )}
              onSelectDeal={setSelectedDealId}
            />
          ))}
        </div>
      </DndContext>

      {selectedDealId && (
        <DealDetailDialog
          dealId={selectedDealId}
          members={members}
          onClose={() => setSelectedDealId(null)}
          onSaved={handleDealSaved}
          onDeleted={handleDealDeleted}
        />
      )}

      <CreateDealDialog
        open={createOpen}
        workspaceId={workspaceId}
        initialContact={initialContact ?? null}
        onClose={() => setCreateOpen(false)}
        onCreated={handleDealCreated}
      />
    </div>
  );
}
