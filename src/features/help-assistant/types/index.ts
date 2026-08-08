import type { ProductPackage } from "@/features/entitlements/resolve";

export type HelpAssistantTier = "gestion" | "completo" | "oficina";

export interface HelpAssistantTierInfo {
  tier: HelpAssistantTier;
  label: string;
  weeklyLimit: number;
}

/**
 * What the system prompt needs to know about THIS workspace's plan, so it
 * only describes features the client actually has — and briefly declines
 * (never explains in detail) anything they don't, instead of assuming every
 * client has every module.
 */
export interface HelpAssistantPlanContext {
  /** Fase 4A: fuente única para reconstruir WorkspaceEntitlements y llamar a canUseAssistantActions() — nunca recalcular "canWrite" a mano en un segundo sitio. */
  package: ProductPackage;
  gestionEnabled: boolean;
  whatsappAgentEnabled: boolean;
  officeVirtualEnabled: boolean;
  hasVoiceAgent: boolean;
  whiteboardEnabled: boolean;
}

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

/**
 * Server-anchored identity for action tools — mirrors the "SEC-01" property
 * of the shared Forge Tool system's ToolContext (src/features/tools/core/tool.ts):
 * built once from the already-authenticated request, never from the LLM's
 * own tool-call arguments, so a tool can never be tricked into writing to a
 * different workspace or attributing an action to a different user.
 */
export interface HelpActionContext {
  workspaceId: string;
  actorUserId: string;
}
