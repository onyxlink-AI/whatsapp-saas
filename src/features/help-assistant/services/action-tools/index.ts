import { buildClientTools } from "./client-tools";
import { buildPipelineTools } from "./pipeline-tools";
import { buildProjectTools } from "./project-tools";
import { buildWhiteboardTools } from "./whiteboard-tools";
import type { HelpActionContext, HelpAssistantPlanContext } from "../../types";

/**
 * Assembles the exact set of action tools this workspace's plan allows —
 * same "don't offer what they don't have contracted" rule already applied
 * to the text-only system prompt (see system-prompt.ts), now also applied
 * to what the assistant is even ABLE to do, not just what it talks about.
 */
export function buildActionTools(ctx: HelpActionContext, plan: HelpAssistantPlanContext) {
  return {
    ...(plan.gestionEnabled ? buildClientTools(ctx) : {}),
    ...(plan.gestionEnabled || plan.whatsappAgentEnabled ? buildPipelineTools(ctx) : {}),
    ...(plan.gestionEnabled ? buildProjectTools(ctx) : {}),
    ...(plan.gestionEnabled && plan.whiteboardEnabled ? buildWhiteboardTools(ctx) : {}),
  };
}
