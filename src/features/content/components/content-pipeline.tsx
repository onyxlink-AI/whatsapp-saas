"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  DndContext,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  CONTENT_STATUSES,
  CONTENT_STATUS_LABELS,
  type ContentItemRow,
  type ContentStatus,
} from "@/features/content/types";
import type { WorkspaceMember } from "@/features/projects/services/project-actions";
import { moveContentStatus, reorderContentItems } from "@/features/content/services/content-actions";
import { ContentCard } from "./content-card";

const STATUS_COLORS: Record<ContentStatus, { text: string; dot: string; header: string }> = {
  idea: { text: "text-sky-400", dot: "bg-sky-400", header: "bg-sky-500/15" },
  in_production: { text: "text-amber-400", dot: "bg-amber-400", header: "bg-amber-500/15" },
  ready_to_publish: { text: "text-orange-400", dot: "bg-orange-400", header: "bg-orange-500/15" },
  published: { text: "text-emerald-400", dot: "bg-emerald-400", header: "bg-emerald-500/15" },
};

interface ContentPipelineProps {
  workspaceId: string;
  items: ContentItemRow[];
  members: WorkspaceMember[];
}

function ContentColumn({
  status,
  items,
  members,
  onSelect,
}: {
  status: ContentStatus;
  items: ContentItemRow[];
  members: WorkspaceMember[];
  onSelect: (id: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  const colors = STATUS_COLORS[status];

  return (
    <div className="surface-subtle flex w-72 shrink-0 flex-col overflow-hidden">
      <div className="border-b border-border/70 bg-card px-3 py-3">
        <div className="flex items-center justify-between">
          <span className={cn("flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider", colors.text)}>
            <span className={cn("h-1.5 w-1.5 rounded-full", colors.dot)} aria-hidden="true" />
            {CONTENT_STATUS_LABELS[status]}
          </span>
          <span className="text-[10px] text-muted-foreground font-mono">{items.length}</span>
        </div>
      </div>
      <div
        ref={setNodeRef}
        className={cn("min-h-[120px] flex-1 space-y-2 overflow-y-auto p-2 transition-colors", isOver && colors.header)}
      >
        <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
          {items.map((item) => (
            <ContentCard
              key={item.id}
              item={item}
              responsible={members.find((m) => m.user_id === item.responsible_id)}
              onClick={() => onSelect(item.id)}
            />
          ))}
        </SortableContext>
        {items.length === 0 && (
          <p className="text-[10px] text-muted-foreground text-center py-4">Sin contenido</p>
        )}
      </div>
    </div>
  );
}

export function ContentPipeline({ workspaceId, items: initialItems, members }: ContentPipelineProps) {
  const router = useRouter();
  const [items, setItems] = useState(initialItems);
  const [, startTransition] = useTransition();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  const byStatus = useMemo(() => {
    const map = new Map<ContentStatus, ContentItemRow[]>();
    for (const s of CONTENT_STATUSES) map.set(s, []);
    for (const item of items) map.get(item.status)?.push(item);
    for (const s of CONTENT_STATUSES) map.get(s)?.sort((a, b) => a.position - b.position);
    return map;
  }, [items]);

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over) return;

    const activeItem = items.find((i) => i.id === active.id);
    if (!activeItem) return;

    const overIsColumn = (CONTENT_STATUSES as string[]).includes(over.id as string);
    const targetStatus = overIsColumn ? (over.id as ContentStatus) : items.find((i) => i.id === over.id)?.status;
    if (!targetStatus) return;

    const columnItems = items
      .filter((i) => i.status === targetStatus && i.id !== active.id)
      .sort((a, b) => a.position - b.position);

    const overIndex = overIsColumn ? columnItems.length : columnItems.findIndex((i) => i.id === over.id);
    const insertIndex = overIndex === -1 ? columnItems.length : overIndex;
    columnItems.splice(insertIndex, 0, { ...activeItem, status: targetStatus });

    const reordered = columnItems.map((i, index) => ({ ...i, position: index }));

    setItems((prev) => {
      const others = prev.filter((i) => i.status !== targetStatus && i.id !== active.id);
      return [...others, ...reordered];
    });

    const sameColumn = activeItem.status === targetStatus;
    const orderedIds = reordered.map((i) => i.id);

    startTransition(async () => {
      const result = sameColumn
        ? await reorderContentItems(workspaceId, targetStatus, orderedIds)
        : await moveContentStatus(workspaceId, active.id as string, targetStatus, reordered.findIndex((i) => i.id === active.id));

      if (!result.ok) {
        toast.error(result.error ?? "Error al mover el contenido");
        setItems(initialItems);
      }
    });
  }

  return (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
      <div className="flex gap-3 overflow-x-auto pb-2 flex-1">
        {CONTENT_STATUSES.map((status) => (
          <ContentColumn
            key={status}
            status={status}
            items={byStatus.get(status) ?? []}
            members={members}
            onSelect={(id) => router.push(`/contenido/${id}`)}
          />
        ))}
      </div>
    </DndContext>
  );
}
