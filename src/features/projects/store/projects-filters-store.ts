import { create } from "zustand";
import type { ProjectActiveFilter, ProjectViewMode } from "@/features/projects/types";

interface ProjectsFiltersState {
  search: string;
  setSearch: (search: string) => void;
  /** Fase 2: Activos/Inactivos/Todos, independiente del status de kanban. */
  activeFilter: ProjectActiveFilter;
  setActiveFilter: (filter: ProjectActiveFilter) => void;
  /** Fase 2: tablero (kanban) o Bento grid. */
  viewMode: ProjectViewMode;
  setViewMode: (mode: ProjectViewMode) => void;
}

export const useProjectsFiltersStore = create<ProjectsFiltersState>((set) => ({
  search: "",
  setSearch: (search) => set({ search }),
  activeFilter: "active",
  setActiveFilter: (activeFilter) => set({ activeFilter }),
  viewMode: "board",
  setViewMode: (viewMode) => set({ viewMode }),
}));
