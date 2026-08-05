"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { CalendarClock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { ContentItemRow } from "@/features/content/types";
import type { WorkspaceMember } from "@/features/projects/services/project-actions";

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
}

function formatShortDate(date: string | null) {
  if (!date) return null;
  return new Intl.DateTimeFormat("es-MX", { day: "2-digit", month: "short" }).format(new Date(date));
}

interface ContentCardProps {
  item: ContentItemRow;
  responsible?: WorkspaceMember;
  onClick: () => void;
}

export function ContentCard({ item, responsible, onClick }: ContentCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
  });

  const style = { transform: CSS.Transform.toString(transform), transition };
  const dueDate = formatShortDate(item.scheduled_date);
  const hasMetrics = item.status === "published" && (item.metric_views ?? 0) > 0;

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={onClick}
      className={cn(
        "rounded-md border border-border/50 bg-background/60 p-3 space-y-2 cursor-grab active:cursor-grabbing hover:border-[hsl(var(--electric-lime)/0.4)] transition-colors",
        isDragging && "opacity-50",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-semibold leading-snug line-clamp-2">{item.title}</p>
        {responsible && (
          <span
            className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[9px] font-semibold text-primary"
            title={responsible.full_name}
          >
            {getInitials(responsible.full_name)}
          </span>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
        {item.platform && (
          <Badge variant="outline" className="px-1.5 py-0 h-4">
            {item.platform}
          </Badge>
        )}
        {item.orientation && (
          <Badge variant="outline" className="px-1.5 py-0 h-4">
            {item.orientation === "vertical" ? "Vertical" : "Horizontal"}
          </Badge>
        )}
      </div>

      <div className="flex items-center justify-between text-[10px] text-muted-foreground">
        {dueDate && (
          <span className="flex items-center gap-1">
            <CalendarClock className="h-3 w-3" />
            {dueDate}
          </span>
        )}
        {hasMetrics && <span>{item.metric_views} vistas</span>}
      </div>
    </div>
  );
}
