"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { CalendarClock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { motionClasses } from "@/features/ui-kit/motion";
import type { ProjectProgressRow, ProjectWithContact } from "@/features/projects/types";
import type { WorkspaceMember } from "@/features/projects/services/project-actions";
import { getProjectCoverUrl } from "@/features/projects/lib/cover-image";

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

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
}

interface ProjectCardProps {
  project: ProjectWithContact;
  onClick: () => void;
  index?: number;
  progress?: ProjectProgressRow;
  responsible?: WorkspaceMember;
}

export function ProjectCard({ project, onClick, index = 0, progress, responsible }: ProjectCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: project.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    animationDelay: `${Math.min(index * 30, 300)}ms`,
  };

  const dueDate = formatShortDate(project.due_date);
  const coverUrl = getProjectCoverUrl(project.cover_image_path);
  const totalItems = (progress?.task_count ?? 0) + (progress?.subtask_count ?? 0);

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={onClick}
      className={cn(
        "overflow-hidden rounded-md border border-border/50 bg-background/60 cursor-grab active:cursor-grabbing hover:border-[hsl(var(--electric-lime)/0.4)] transition-colors",
        motionClasses.fadeInUp,
        isDragging && "opacity-50",
        !project.is_active && "opacity-60",
      )}
    >
      {coverUrl && (
        // eslint-disable-next-line @next/next/no-img-element -- cover thumbnails are small, dynamic, per-project Storage objects; next/image's optimizer adds no value here.
        <img src={coverUrl} alt="" className="h-20 w-full object-cover" />
      )}

      <div className="p-3 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm font-semibold leading-snug line-clamp-2">
            {project.name}
          </p>
          {responsible && (
            <span
              className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[9px] font-semibold text-primary"
              title={responsible.full_name}
            >
              {getInitials(responsible.full_name)}
            </span>
          )}
        </div>

        {project.contact && (
          <p className="text-xs text-muted-foreground truncate">
            {project.contact.name || project.contact.phone}
          </p>
        )}

        {totalItems > 0 && (
          <div className="space-y-1">
            <div className="h-1 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary transition-[width]"
                style={{ width: `${progress?.progress_pct ?? 0}%` }}
              />
            </div>
            <p className="text-[10px] text-muted-foreground">
              {(progress?.task_done_count ?? 0) + (progress?.subtask_done_count ?? 0)}/{totalItems} completado
            </p>
          </div>
        )}

        <div className="flex items-center justify-between text-[10px]">
          <div className="flex items-center gap-1.5">
            <Badge
              variant="outline"
              className={cn("text-[9px] px-1.5 py-0 h-4", PRIORITY_BADGE[project.priority])}
            >
              {PRIORITY_LABEL[project.priority]}
            </Badge>
            {!project.is_active && (
              <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4 text-muted-foreground">
                Inactivo
              </Badge>
            )}
          </div>
          {dueDate && (
            <span className="flex items-center gap-1 text-muted-foreground">
              <CalendarClock className="h-3 w-3" />
              {dueDate}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
