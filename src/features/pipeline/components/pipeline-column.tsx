"use client";

import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { cn } from "@/lib/utils";
import { DEAL_STAGE_LABELS, type DealStage, type DealWithContact } from "@/features/pipeline/types";
import { DealCard } from "./deal-card";

interface PipelineColumnProps {
  stage: DealStage;
  deals: DealWithContact[];
  onSelectDeal: (dealId: string) => void;
}

const STAGE_COLORS: Record<
  DealStage,
  { header: string; border: string; text: string; dot: string }
> = {
  exploracion: {
    header: "bg-sky-500/15",
    border: "border-sky-500/40",
    text: "text-sky-400",
    dot: "bg-sky-400",
  },
  interes: {
    header: "bg-violet-500/15",
    border: "border-violet-500/40",
    text: "text-violet-400",
    dot: "bg-violet-400",
  },
  listo_para_comprar: {
    header: "bg-amber-500/15",
    border: "border-amber-500/40",
    text: "text-amber-400",
    dot: "bg-amber-400",
  },
  cliente: {
    header: "bg-emerald-500/15",
    border: "border-emerald-500/40",
    text: "text-emerald-400",
    dot: "bg-emerald-400",
  },
  lost: {
    header: "bg-rose-500/15",
    border: "border-rose-500/40",
    text: "text-rose-400",
    dot: "bg-rose-400",
  },
};

export function PipelineColumn({ stage, deals, onSelectDeal }: PipelineColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: stage });
  const colors = STAGE_COLORS[stage];

  const totalValue = deals.reduce((sum, d) => sum + d.value, 0);

  return (
    <div className={cn("flex flex-col w-72 shrink-0 rounded-lg border", colors.border)}>
      <div className={cn("px-3 py-2.5 border-b rounded-t-lg", colors.border, colors.header)}>
        <div className="flex items-center justify-between">
          <span className={cn("flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider", colors.text)}>
            <span className={cn("h-1.5 w-1.5 rounded-full", colors.dot)} aria-hidden="true" />
            {DEAL_STAGE_LABELS[stage]}
          </span>
          <span className="text-[10px] text-muted-foreground font-mono">
            {deals.length}
          </span>
        </div>
        {totalValue > 0 && (
          <p className="text-[10px] text-muted-foreground font-mono mt-0.5">
            {new Intl.NumberFormat("es-MX", {
              style: "currency",
              currency: deals[0]?.currency ?? "MXN",
              maximumFractionDigits: 0,
            }).format(totalValue)}
          </p>
        )}
      </div>

      <div
        ref={setNodeRef}
        className={cn(
          "flex-1 p-2 space-y-2 min-h-[120px] overflow-y-auto transition-colors rounded-b-lg",
          isOver && colors.header,
        )}
      >
        <SortableContext
          items={deals.map((d) => d.id)}
          strategy={verticalListSortingStrategy}
        >
          {deals.map((deal, index) => (
            <DealCard
              key={deal.id}
              deal={deal}
              index={index}
              onClick={() => onSelectDeal(deal.id)}
            />
          ))}
        </SortableContext>

        {deals.length === 0 && (
          <p className="text-[10px] text-muted-foreground text-center py-4">
            Sin negocios
          </p>
        )}
      </div>
    </div>
  );
}
