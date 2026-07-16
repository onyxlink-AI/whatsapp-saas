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
import { Plus } from "lucide-react";
import {
  PROJECT_STATUSES,
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
import { ProjectDetailDialog } from "./project-detail-dialog";
import { CreateProjectDialog } from "./create-project-dialog";

interface ProjectsBoardProps {
  workspaceId: string;
  initialProjects: ProjectWithContact[];
  members: WorkspaceMember[];
  initialSelectedProjectId?: string | null;
}

export function ProjectsBoard({
  workspaceId,
  initialProjects,
  members,
  initialSelectedProjectId,
}: ProjectsBoardProps) {
  const [projects, setProjects] = useState(initialProjects);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(
    initialSelectedProjectId ?? null,
  );
  const [createOpen, setCreateOpen] = useState(false);
  const [, startTransition] = useTransition();

  const search = useProjectsFiltersStore((s) => s.search);
  const setSearch = useProjectsFiltersStore((s) => s.setSearch);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  );

  const filteredProjects = useMemo(() => {
    if (!search.trim()) return projects;
    const q = search.trim().toLowerCase();
    return projects.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.contact?.name?.toLowerCase().includes(q) ||
        p.contact?.phone?.includes(q),
    );
  }, [projects, search]);

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
          placeholder="Buscar proyecto o cliente..."
          className="h-8 w-56 text-xs"
        />
        <Button
          size="sm"
          className="h-8 text-xs gap-1.5 ml-auto"
          onClick={() => setCreateOpen(true)}
        >
          <Plus className="h-3.5 w-3.5" />
          Nuevo proyecto
        </Button>
      </div>

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
            />
          ))}
        </div>
      </DndContext>

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
