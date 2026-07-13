import { create } from "zustand";
import type { AgendaScheduleMode } from "@/features/projects/types";

interface AgendaViewState {
  viewMode: AgendaScheduleMode;
  selectedDate: string; // YYYY-MM-DD, anchor day (also used to derive the week)
  setViewMode: (mode: AgendaScheduleMode) => void;
  setSelectedDate: (date: string) => void;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export const useAgendaViewStore = create<AgendaViewState>((set) => ({
  viewMode: "day",
  selectedDate: todayIso(),
  setViewMode: (viewMode) => set({ viewMode }),
  setSelectedDate: (selectedDate) => set({ selectedDate }),
}));
