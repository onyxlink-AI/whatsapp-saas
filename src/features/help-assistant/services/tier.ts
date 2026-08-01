import type { HelpAssistantTier, HelpAssistantTierInfo, WorkspacePlanFlags } from "../types";

const TIER_TABLE: Record<HelpAssistantTier, HelpAssistantTierInfo> = {
  gestion: { tier: "gestion", label: "Onyxlink Gestión", weeklyLimit: 30 },
  completo: { tier: "completo", label: "Panel completo", weeklyLimit: 70 },
  oficina: { tier: "oficina", label: "Gestión + Oficina Virtual", weeklyLimit: 150 },
};

/**
 * Weekly question quota tier for a workspace, derived from its 3 independent
 * plan flags — there's no plan-tier table/enum anywhere else in the app, so
 * this is the one place that ladder is defined. Monotonic: each add-on can
 * only raise the tier, never lower it. Per explicit user direction, having
 * the WhatsApp agent (with or without Gestión) already counts as "Panel
 * completo" — this also covers legacy workspaces that predate Gestión and
 * only ever had the agent (whatsapp_agent_enabled defaults to true).
 */
export function resolveHelpAssistantTier(flags: WorkspacePlanFlags): HelpAssistantTierInfo {
  const gestion = flags.gestion_enabled === true;
  const whatsapp = flags.whatsapp_agent_enabled !== false;
  const office = flags.office_virtual_enabled === true;

  if (office) return TIER_TABLE.oficina;
  if (whatsapp) return TIER_TABLE.completo;
  if (gestion) return TIER_TABLE.gestion;
  return TIER_TABLE.gestion;
}
