// capabilities.ts — principio de composición del dashboard adaptativo
// (§4.1): un único lugar que decide qué bloques monta la página, para que
// dashboard/page.tsx nunca tenga que repetir la lógica de qué consultar.

import type { WorkspaceEntitlements } from "@/features/entitlements/resolve";

export interface DashboardAddonState {
  teamChatEnabled: boolean;
  hasVapiAssistant: boolean;
}

export type DashboardVariant = "none" | "gestion" | "combined";

export interface DashboardCapabilities {
  variant: DashboardVariant;
  showOfficeSummary: boolean;
  showTeamChatWidget: boolean;
  showVapiWidget: boolean;
}

export function resolveDashboardCapabilities(
  entitlements: WorkspaceEntitlements,
  addons: DashboardAddonState,
): DashboardCapabilities {
  const variant: DashboardVariant =
    entitlements.package === "none" ? "none" : entitlements.hasWhatsappAgent ? "combined" : "gestion";

  return {
    variant,
    showOfficeSummary: entitlements.hasOfficeVirtual,
    showTeamChatWidget: addons.teamChatEnabled,
    showVapiWidget: addons.hasVapiAssistant,
  };
}
