export type HelpAssistantTier = "gestion" | "completo" | "oficina";

export interface HelpAssistantTierInfo {
  tier: HelpAssistantTier;
  label: string;
  weeklyLimit: number;
}

/** The subset of `workspaces` columns tier resolution needs. */
export interface WorkspacePlanFlags {
  gestion_enabled: boolean | null;
  whatsapp_agent_enabled: boolean | null;
  office_virtual_enabled: boolean | null;
}

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}
