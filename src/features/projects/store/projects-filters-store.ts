import { create } from "zustand";

interface ProjectsFiltersState {
  search: string;
  setSearch: (search: string) => void;
}

export const useProjectsFiltersStore = create<ProjectsFiltersState>((set) => ({
  search: "",
  setSearch: (search) => set({ search }),
}));
