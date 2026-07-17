"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { CalendarClock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { motionClasses } from "@/features/ui-kit/motion";
import type { ProjectWithContact } from "@/features/projects/types";

const PRIORITY_BADGE: Record<string, string> = {
  baja: "bg-sky-500/15 text-sky-400 border-sky-500/40",
  media: "bg-amber-500/15 text-amber-400 border-amber-500/40",
  alta: "bg-rose-500/15 text-rose-400 border-rose-500/40",
};

const PRIORITY_LABEL: Record<string, string> = {
  baja: "Baja",
  media: "Media",
  alta: "Alta",
};

function formatShortDate(date: string | null) {
  if (!date) return null;
  return new Intl.DateTimeFormat("es-MX", {
    day: "2-digit",
    month: "short",
  }).format(new Date(date));
}

interface ProjectCardProps {
  project: ProjectWithContact;
  onClick: () => void;
  index?: number;
}

export function ProjectCard({ project, onClick, index = 0 }: ProjectCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: project.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    animationDelay: `${Math.min(index * 30, 300)}ms`,
  };

  const dueDate = formatShortDate(project.due_date);

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
      <p className="text-sm font-semibold leading-snug line-clamp-2">
        {project.name}
      </p>

      {project.contact && (
        <p className="text-xs text-muted-foreground truncate">
          {project.contact.name || project.contact.phone}
        </p>
      )}

      <div className="flex items-center justify-between text-[10px]">
        <Badge
          variant="outline"
          className={cn("text-[9px] px-1.5 py-0 h-4", PRIORITY_BADGE[project.priority])}
        >
          {PRIORITY_LABEL[project.priority]}
        </Badge>
        {dueDate && (
          <span className="flex items-center gap-1 text-muted-foreground">
            <CalendarClock className="h-3 w-3" />
            {dueDate}
          </span>
        )}
      </div>
    </div>
  );
}
