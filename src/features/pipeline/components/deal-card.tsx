"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { CalendarClock, ListTodo } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { motionClasses } from "@/features/ui-kit/motion";
import type { DealWithContact } from "@/features/pipeline/types";

function Initials({ name }: { name: string | null }) {
  const letters = name
    ? name
        .trim()
        .split(/\s+/)
        .slice(0, 2)
        .map((w) => w[0]?.toUpperCase() ?? "")
        .join("")
    : "?";

  return (
    <div className="h-6 w-6 rounded-full bg-[hsl(var(--electric-lime)/0.15)] border border-[hsl(var(--electric-lime)/0.3)] flex items-center justify-center shrink-0">
      <span className="text-[9px] font-semibold text-[hsl(var(--electric-lime))] font-mono">
        {letters}
      </span>
    </div>
  );
}

function formatCurrency(value: number, currency: string) {
  try {
    return new Intl.NumberFormat("es-MX", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(value);
  } catch {
    return `${value} ${currency}`;
  }
}

function formatShortDate(date: string | null) {
  if (!date) return null;
  return new Intl.DateTimeFormat("es-MX", {
    day: "2-digit",
    month: "short",
  }).format(new Date(date));
}

interface DealCardProps {
  deal: DealWithContact;
  onClick: () => void;
  index?: number;
}

export function DealCard({ deal, onClick, index = 0 }: DealCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: deal.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    animationDelay: `${Math.min(index * 30, 300)}ms`,
  };

  const closeDate = formatShortDate(deal.expected_close_date);

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={onClick}
      className={cn(
        "rounded-md border border-border/50 bg-background/60 p-3 space-y-2 cursor-grab active:cursor-grabbing hover:border-[hsl(var(--electric-lime)/0.4)] transition-colors",
        motionClasses.fadeInUp,
        isDragging && "opacity-50",
      )}
    >
      <div className="flex items-center gap-2">
        <Initials name={deal.contact?.name ?? deal.lead_name ?? null} />
        <p className="text-xs font-medium truncate flex-1">
          {deal.contact?.name ||
            deal.lead_name ||
            deal.contact?.phone ||
            deal.lead_phone ||
            "Sin contacto"}
        </p>
      </div>

      <p className="text-sm font-semibold leading-snug line-clamp-2">
        {deal.title}
      </p>

      <div className="flex items-center justify-between text-[10px] text-muted-foreground">
        <span className="font-mono">
          {formatCurrency(deal.value, deal.currency)}
        </span>
        {closeDate && (
          <span className="flex items-center gap-1">
            <CalendarClock className="h-3 w-3" />
            {closeDate}
          </span>
        )}
      </div>

      <div className="flex items-center gap-1.5 flex-wrap">
        {deal.sector && (
          <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4 w-fit">
            {deal.sector.name}
          </Badge>
        )}
        {deal.open_task_count > 0 && (
          <Badge
            variant="secondary"
            className="text-[9px] gap-1 px-1.5 py-0 h-4 w-fit"
          >
            <ListTodo className="h-2.5 w-2.5" />
            {deal.open_task_count}
          </Badge>
        )}
      </div>
    </div>
  );
}
