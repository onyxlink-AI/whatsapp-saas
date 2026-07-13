"use client";

import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { cn } from "@/lib/utils";
import {
  PROJECT_STATUS_LABELS,
  type ProjectStatus,
  type ProjectWithContact,
} from "@/features/projects/types";
import { ProjectCard } from "./project-card";

interface ProjectColumnProps {
  status: ProjectStatus;
  projects: ProjectWithContact[];
  onSelectProject: (projectId: string) => void;
}

const STATUS_COLORS: Record<
  ProjectStatus,
  { header: string; border: string; text: string; dot: string }
> = {
  pendiente: {
    header: "bg-sky-500/15",
    border: "border-sky-500/40",
    text: "text-sky-400",
    dot: "bg-sky-400",
  },
  en_preparacion: {
    header: "bg-violet-500/15",
    border: "border-violet-500/40",
    text: "text-violet-400",
    dot: "bg-violet-400",
  },
  en_proceso: {
    header: "bg-amber-500/15",
    border: "border-amber-500/40",
    text: "text-amber-400",
    dot: "bg-amber-400",
  },
  en_revision: {
    header: "bg-orange-500/15",
    border: "border-orange-500/40",
    text: "text-orange-400",
    dot: "bg-orange-400",
  },
  finalizado: {
    header: "bg-emerald-500/15",
    border: "border-emerald-500/40",
    text: "text-emerald-400",
    dot: "bg-emerald-400",
  },
};

export function ProjectColumn({ status, projects, onSelectProject }: ProjectColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  const colors = STATUS_COLORS[status];

  return (
    <div className={cn("flex flex-col w-72 shrink-0 rounded-lg border", colors.border)}>
      <div className={cn("px-3 py-2.5 border-b rounded-t-lg", colors.border, colors.header)}>
        <div className="flex items-center justify-between">
          <span className={cn("flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider", colors.text)}>
            <span className={cn("h-1.5 w-1.5 rounded-full", colors.dot)} aria-hidden="true" />
            {PROJECT_STATUS_LABELS[status]}
          </span>
          <span className="text-[10px] text-muted-foreground font-mono">
            {projects.length}
          </span>
        </div>
      </div>

      <div
        ref={setNodeRef}
        className={cn(
          "flex-1 p-2 space-y-2 min-h-[120px] overflow-y-auto transition-colors rounded-b-lg",
          isOver && colors.header,
        )}
      >
        <SortableContext
          items={projects.map((p) => p.id)}
          strategy={verticalListSortingStrategy}
        >
          {projects.map((project) => (
            <ProjectCard
              key={project.id}
              project={project}
              onClick={() => onSelectProject(project.id)}
            />
          ))}
        </SortableContext>

        {projects.length === 0 && (
          <p className="text-[10px] text-muted-foreground text-center py-4">
            Sin proyectos
          </p>
        )}
      </div>
    </div>
  );
}
