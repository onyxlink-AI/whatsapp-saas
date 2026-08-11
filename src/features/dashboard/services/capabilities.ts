// capabilities.ts — principio de composición del dashboard adaptativo
// (§4.1): un único lugar que decide qué bloques monta la página, para que
// dashboard/page.tsx nunca tenga que repetir la lógica de qué consultar.

import type { WorkspaceEntitlements } from "@/features/entitlements/resolve";

export interface DashboardAddonState {
  teamChatEnabled: boolean;
  hasVapiAssistant: boolean;
}

export type DashboardVariant = "none" | "gestion" | "combined" | "office";

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
  // Orden importa: hasWhatsappAgent primero (cualquier paquete con WhatsApp
  // usa el bloque combinado, tenga o no Gestión — combined ya trata
  // `gestion`/`office` como opcionales), luego hasGestion (Paquete 1),
  // y por último hasOfficeVirtual solo (Paquete 6: oficina, sin WhatsApp ni
  // Gestión) — el único caso que ninguno de los otros dos bloques sabe
  // renderizar. Todo paquete no-"none" tiene al menos una capacidad, así
  // que esta cadena siempre resuelve a algo distinto de "none" cuando
  // package !== "none".
  const variant: DashboardVariant =
    entitlements.package === "none"
      ? "none"
      : entitlements.hasWhatsappAgent
        ? "combined"
        : entitlements.hasGestion
          ? "gestion"
          : "office";

  return {
    variant,
    showOfficeSummary: entitlements.hasOfficeVirtual,
    showTeamChatWidget: addons.teamChatEnabled,
    showVapiWidget: addons.hasVapiAssistant,
  };
}
