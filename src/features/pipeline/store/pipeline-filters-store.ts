import { create } from "zustand";

interface PipelineFiltersState {
  search: string;
  ownerId: string | null;
  showClosed: boolean;
  setSearch: (search: string) => void;
  setOwnerId: (ownerId: string | null) => void;
  toggleShowClosed: () => void;
}

export const usePipelineFiltersStore = create<PipelineFiltersState>(
  (set) => ({
    search: "",
    ownerId: null,
    showClosed: false,
    setSearch: (search) => set({ search }),
    setOwnerId: (ownerId) => set({ ownerId }),
    toggleShowClosed: () => set((s) => ({ showClosed: !s.showClosed })),
  }),
);
