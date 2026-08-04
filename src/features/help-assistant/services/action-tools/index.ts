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
  // Fase 1 del roadmap comercial: el "asistente de gestión" (con
  // herramientas de escritura) es exclusivo de Paquete 2+ (Gestión +
  // WhatsApp). Paquete 1 (Gestión sin WhatsApp) es el "asistente
  // informativo": responde preguntas, nunca recibe herramientas de
  // escritura, sin importar el toggle de superadmin actionsEnabled.
  const canWrite = plan.gestionEnabled && plan.whatsappAgentEnabled;
  return {
    ...(canWrite ? buildClientTools(ctx) : {}),
    ...(canWrite ? buildPipelineTools(ctx) : {}),
    ...(canWrite ? buildProjectTools(ctx) : {}),
    ...(canWrite && plan.whiteboardEnabled ? buildWhiteboardTools(ctx) : {}),
  };
}
