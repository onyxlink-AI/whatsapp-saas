"use client";

import { CalendarClock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  PROJECT_STATUS_LABELS,
  type ProjectProgressRow,
  type ProjectWithContact,
} from "@/features/projects/types";
import type { WorkspaceMember } from "@/features/projects/services/project-actions";
import { getProjectCoverUrl } from "@/features/projects/lib/cover-image";

const PRIORITY_BADGE: Record<string, string> = {
  baja: "bg-sky-500/15 text-sky-400 border-sky-500/40",
  media: "bg-amber-500/15 text-amber-400 border-amber-500/40",
  alta: "bg-rose-500/15 text-rose-400 border-rose-500/40",
};

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
}

function formatShortDate(date: string | null) {
  if (!date) return null;
  return new Intl.DateTimeFormat("es-MX", { day: "2-digit", month: "short" }).format(new Date(date));
}

interface ProjectBentoGridProps {
  projects: ProjectWithContact[];
  progressMap: Record<string, ProjectProgressRow>;
  members: WorkspaceMember[];
  onSelectProject: (projectId: string) => void;
}

export function ProjectBentoGrid({ projects, progressMap, members, onSelectProject }: ProjectBentoGridProps) {
  if (projects.length === 0) {
    return (
      <p className="text-xs text-muted-foreground text-center py-10">
        No hay proyectos que coincidan con el filtro actual
      </p>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-3 overflow-y-auto pb-2 sm:grid-cols-2 xl:grid-cols-3">
      {projects.map((project) => {
        const coverUrl = getProjectCoverUrl(project.cover_image_path);
        const progress = progressMap[project.id];
        const responsible = members.find((m) => m.user_id === project.responsible_id);
        const totalItems = (progress?.task_count ?? 0) + (progress?.subtask_count ?? 0);
        const dueDate = formatShortDate(project.due_date);

        return (
          <button
            key={project.id}
            type="button"
            onClick={() => onSelectProject(project.id)}
            className={cn(
              "surface-card flex flex-col overflow-hidden text-left transition-colors hover:border-[hsl(var(--electric-lime)/0.4)]",
              !project.is_active && "opacity-60",
            )}
          >
            {coverUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- see project-card.tsx
              <img src={coverUrl} alt="" className="h-28 w-full object-cover" />
            ) : (
              <div className="h-28 w-full bg-gradient-to-br from-primary/15 to-primary/5" aria-hidden="true" />
            )}

            <div className="flex flex-1 flex-col gap-2 p-4">
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-semibold leading-snug line-clamp-2">{project.name}</p>
                {responsible && (
                  <span
                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[10px] font-semibold text-primary"
                    title={responsible.full_name}
                  >
                    {getInitials(responsible.full_name)}
                  </span>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
                <Badge variant="outline" className="px-1.5 py-0 h-4">
                  {PROJECT_STATUS_LABELS[project.status]}
                </Badge>
                <Badge
                  variant="outline"
                  className={cn("px-1.5 py-0 h-4", PRIORITY_BADGE[project.priority])}
                >
                  {project.priority === "alta" ? "Alta" : project.priority === "media" ? "Media" : "Baja"}
                </Badge>
                {!project.is_active && (
                  <Badge variant="outline" className="px-1.5 py-0 h-4 text-muted-foreground">
                    Inactivo
                  </Badge>
                )}
              </div>

              {totalItems > 0 && (
                <div className="space-y-1">
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary transition-[width]"
                      style={{ width: `${progress?.progress_pct ?? 0}%` }}
                    />
                  </div>
                  <p className="text-[10px] text-muted-foreground">
                    {progress?.progress_pct ?? 0}% ·{" "}
                    {(progress?.task_done_count ?? 0) + (progress?.subtask_done_count ?? 0)}/{totalItems} completado
                  </p>
                </div>
              )}

              <div className="mt-auto flex items-center justify-between text-[10px] text-muted-foreground">
                <span>{progress?.task_count ?? 0} tarea{(progress?.task_count ?? 0) === 1 ? "" : "s"}</span>
                {dueDate && (
                  <span className="flex items-center gap-1">
                    <CalendarClock className="h-3 w-3" />
                    {dueDate}
                  </span>
                )}
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
