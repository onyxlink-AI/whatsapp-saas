import { create } from "zustand";
import type { ClientStatus } from "@/features/clients/types";

interface ClientsFiltersState {
  search: string;
  status: ClientStatus | "all";
  setSearch: (search: string) => void;
  setStatus: (status: ClientStatus | "all") => void;
}

export const useClientsFiltersStore = create<ClientsFiltersState>((set) => ({
  search: "",
  status: "all",
  setSearch: (search) => set({ search }),
  setStatus: (status) => set({ status }),
}));
