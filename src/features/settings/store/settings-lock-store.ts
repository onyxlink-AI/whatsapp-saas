import { create } from "zustand";
import { persist } from "zustand/middleware";

// A local (per-browser) preference, same tier as light/dark mode — not tied
// to the workspace or any particular user, just "this device is locked out
// of Ajustes right now" so nobody browsing here accidentally flips a
// superadmin toggle or touches an integration credential.
interface SettingsLockState {
  locked: boolean;
  toggle: () => void;
}

export const useSettingsLockStore = create<SettingsLockState>()(
  persist(
    (set) => ({
      locked: false,
      toggle: () => set((state) => ({ locked: !state.locked })),
    }),
    { name: "onyxlink-settings-lock" },
  ),
);
