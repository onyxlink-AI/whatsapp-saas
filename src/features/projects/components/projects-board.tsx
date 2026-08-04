"use client";

import { useMemo, useState, useTransition } from "react";
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, LayoutGrid, Rows3 } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  PROJECT_STATUSES,
  type ProjectActiveFilter,
  type ProjectProgressRow,
  type ProjectStatus,
  type ProjectWithContact,
} from "@/features/projects/types";
import {
  moveProjectStatus,
  reorderProjects,
  type WorkspaceMember,
} from "@/features/projects/services/project-actions";
import { useProjectsFiltersStore } from "@/features/projects/store/projects-filters-store";
import { ProjectColumn } from "./project-column";
import { ProjectBentoGrid } from "./project-bento-grid";
import { ProjectDetailDialog } from "./project-detail-dialog";
import { CreateProjectDialog } from "./create-project-dialog";

interface ProjectsBoardProps {
  workspaceId: string;
  initialProjects: ProjectWithContact[];
  members: WorkspaceMember[];
  initialSelectedProjectId?: string | null;
  progressMap: Record<string, ProjectProgressRow>;
}

const ACTIVE_FILTER_LABELS: Record<ProjectActiveFilter, string> = {
  active: "Activos",
  inactive: "Inactivos",
  all: "Todos",
};

export function ProjectsBoard({
  workspaceId,
  initialProjects,
  members,
  initialSelectedProjectId,
  progressMap,
}: ProjectsBoardProps) {
  const [projects, setProjects] = useState(initialProjects);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(
    initialSelectedProjectId ?? null,
  );
  const [createOpen, setCreateOpen] = useState(false);
  const [, startTransition] = useTransition();

  const search = useProjectsFiltersStore((s) => s.search);
  const setSearch = useProjectsFiltersStore((s) => s.setSearch);
  const activeFilter = useProjectsFiltersStore((s) => s.activeFilter);
  const setActiveFilter = useProjectsFiltersStore((s) => s.setActiveFilter);
  const viewMode = useProjectsFiltersStore((s) => s.viewMode);
  const setViewMode = useProjectsFiltersStore((s) => s.setViewMode);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  );

  const filteredProjects = useMemo(() => {
    let list = projects;
    if (activeFilter === "active") list = list.filter((p) => p.is_active);
    else if (activeFilter === "inactive") list = list.filter((p) => !p.is_active);

    if (!search.trim()) return list;
    const q = search.trim().toLowerCase();
    return list.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.contact?.name?.toLowerCase().includes(q) ||
        p.contact?.phone?.includes(q),
    );
  }, [projects, search, activeFilter]);

  const projectsByStatus = useMemo(() => {
    const map = new Map<ProjectStatus, ProjectWithContact[]>();
    for (const status of PROJECT_STATUSES) map.set(status, []);
    for (const project of filteredProjects) {
      map.get(project.status)?.push(project);
    }
    return map;
  }, [filteredProjects]);

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over) return;

    const activeProject = projects.find((p) => p.id === active.id);
    if (!activeProject) return;

    const overIsColumn = PROJECT_STATUSES.includes(over.id as ProjectStatus);
    const targetStatus = overIsColumn
      ? (over.id as ProjectStatus)
      : projects.find((p) => p.id === over.id)?.status;

    if (!targetStatus) return;

    const columnProjects = projects
      .filter((p) => p.status === targetStatus && p.id !== active.id)
      .sort((a, b) => a.position - b.position);

    const overIndex = overIsColumn
      ? columnProjects.length
      : columnProjects.findIndex((p) => p.id === over.id);

    const insertIndex = overIndex === -1 ? columnProjects.length : overIndex;
    columnProjects.splice(insertIndex, 0, {
      ...activeProject,
      status: targetStatus,
    });

    const reordered = columnProjects.map((p, index) => ({ ...p, position: index }));

    setProjects((prev) => {
      const others = prev.filter((p) => p.status !== targetStatus && p.id !== active.id);
      return [...others, ...reordered];
    });

    const sameColumn = activeProject.status === targetStatus;
    const orderedIds = reordered.map((p) => p.id);

    startTransition(async () => {
      const result = sameColumn
        ? await reorderProjects({ status: targetStatus, ordered_ids: orderedIds })
        : await moveProjectStatus(
            active.id as string,
            targetStatus,
            reordered.findIndex((p) => p.id === active.id),
          );

      if (!result.ok) {
        toast.error(result.error ?? "Error al mover el proyecto");
        setProjects(initialProjects);
      }
    });
  }

  function handleProjectSaved(updated: ProjectWithContact) {
    setProjects((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
  }

  function handleProjectCreated(created: ProjectWithContact) {
    setProjects((prev) => [...prev, created]);
    setSelectedProjectId(created.id);
  }

  function handleProjectDeleted(projectId: string) {
    setProjects((prev) => prev.filter((p) => p.id !== projectId));
  }

  return (
    <div className="flex flex-col gap-3 h-full">
      <div className="flex items-center gap-3 flex-wrap">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Busca un proyecto..."
          className="h-9 w-64 text-xs"
        />

        <Select value={activeFilter} onValueChange={(v) => setActiveFilter(v as ProjectActiveFilter)}>
          <SelectTrigger className="h-9 w-32 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(ACTIVE_FILTER_LABELS) as ProjectActiveFilter[]).map((f) => (
              <SelectItem key={f} value={f}>
                {ACTIVE_FILTER_LABELS[f]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="flex items-center rounded-md border border-border/60 p-0.5">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className={cn("h-8 w-8", viewMode === "board" && "bg-muted")}
            onClick={() => setViewMode("board")}
            aria-label="Vista de tablero"
            aria-pressed={viewMode === "board"}
          >
            <Rows3 className="h-3.5 w-3.5" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className={cn("h-8 w-8", viewMode === "bento" && "bg-muted")}
            onClick={() => setViewMode("bento")}
            aria-label="Vista Bento"
            aria-pressed={viewMode === "bento"}
          >
            <LayoutGrid className="h-3.5 w-3.5" />
          </Button>
        </div>

        <Button
          size="sm"
          className="ml-auto h-9 gap-1.5 text-xs"
          onClick={() => setCreateOpen(true)}
        >
          <Plus className="h-3.5 w-3.5" />
          Nuevo proyecto
        </Button>
      </div>

      {viewMode === "board" ? (
        <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
          <div className="flex gap-3 overflow-x-auto pb-2 flex-1">
            {PROJECT_STATUSES.map((status) => (
              <ProjectColumn
                key={status}
                status={status}
                projects={(projectsByStatus.get(status) ?? []).sort(
                  (a, b) => a.position - b.position,
                )}
                onSelectProject={setSelectedProjectId}
                progressMap={progressMap}
                members={members}
              />
            ))}
          </div>
        </DndContext>
      ) : (
        <ProjectBentoGrid
          projects={filteredProjects}
          progressMap={progressMap}
          members={members}
          onSelectProject={setSelectedProjectId}
        />
      )}

      {selectedProjectId && (
        <ProjectDetailDialog
          projectId={selectedProjectId}
          members={members}
          workspaceId={workspaceId}
          onClose={() => setSelectedProjectId(null)}
          onSaved={handleProjectSaved}
          onDeleted={handleProjectDeleted}
        />
      )}

      <CreateProjectDialog
        open={createOpen}
        workspaceId={workspaceId}
        members={members}
        onClose={() => setCreateOpen(false)}
        onCreated={handleProjectCreated}
      />
    </div>
  );
}
