import type { HelpAssistantTier, HelpAssistantTierInfo } from "../types";
import type { PackageCapabilities } from "@/features/entitlements/resolve";

const TIER_TABLE: Record<HelpAssistantTier, HelpAssistantTierInfo> = {
  gestion: { tier: "gestion", label: "Onyxlink Gestión", weeklyLimit: 30 },
  completo: { tier: "completo", label: "Panel completo", weeklyLimit: 70 },
  oficina: { tier: "oficina", label: "Gestión + Oficina Virtual", weeklyLimit: 150 },
};

/**
 * Weekly question quota tier for a workspace, derivado del paquete
 * comercial (Fase 2: antes se calculaba de 3 flags sueltos con su propia
 * lógica de "por defecto true"; ahora reutiliza directamente las
 * capacidades ya resueltas por resolveEntitlements()). Monotonic: cada
 * capacidad adicional solo puede subir el tier, nunca bajarlo. Un paquete
 * "none" no tiene tier propio — cae al mínimo (gestion), igual que el
 * comportamiento anterior.
 */
export function resolveHelpAssistantTier(capabilities: PackageCapabilities): HelpAssistantTierInfo {
  if (capabilities.hasOfficeVirtual) return TIER_TABLE.oficina;
  if (capabilities.hasWhatsappAgent) return TIER_TABLE.completo;
  return TIER_TABLE.gestion;
}
