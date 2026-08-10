import { buildClientTools } from "./client-tools";
import { buildPipelineTools } from "./pipeline-tools";
import { buildProjectTools } from "./project-tools";
import { buildWhiteboardTools } from "./whiteboard-tools";
import { buildBoardTools } from "./board-tools";
import { buildAgendaTools } from "./agenda-tools";
import { buildNoteTools } from "./note-tools";
import { buildContentTools } from "./content-tools";
import { resolveEntitlements, canUseAssistantActions } from "@/features/entitlements/resolve";
import { createPendingConfirmationSlot, type PendingConfirmationSlot } from "../pending-actions";
import type { HelpActionContext, HelpAssistantPlanContext } from "../../types";

/**
 * Assembles the exact set of action tools this workspace's plan allows —
 * same "don't offer what they don't have contracted" rule already applied
 * to the text-only system prompt (see system-prompt.ts), now also applied
 * to what the assistant is even ABLE to do, not just what it talks about.
 *
 * Fase 4A: canWrite ya NO se recalcula a mano aquí — se deriva de
 * canUseAssistantActions() (src/features/entitlements/resolve.ts), la
 * misma función que usa system-prompt.ts y que cada tool vuelve a
 * comprobar por su cuenta en assertHelpActionAccess(). Esto es solo un
 * filtro de "qué tools construir/ofrecer al modelo" — la autorización real
 * y definitiva ocurre dentro de cada tool, en cada ejecución.
 *
 * Fase 4B: confirmationSlot es un único objeto mutable compartido por
 * TODAS las tools confirmables construidas para esta petición — impone
 * "máximo una preparación confirmable por petición" y es el canal por el
 * que el token en claro sale hacia help-assistant-service.ts sin pasar
 * nunca por el propio texto del modelo (ver pending-actions.ts).
 */
export function buildActionTools(ctx: HelpActionContext, plan: HelpAssistantPlanContext, actionsEnabled: boolean) {
  const entitlements = resolveEntitlements({ product_package: plan.package });
  const canWrite = canUseAssistantActions(actionsEnabled, entitlements);
  const confirmationSlot = createPendingConfirmationSlot();

  const tools = {
    ...(canWrite ? buildClientTools(ctx) : {}),
    ...(canWrite ? buildPipelineTools(ctx) : {}),
    ...(canWrite ? buildProjectTools(ctx) : {}),
    ...(canWrite ? buildAgendaTools(ctx, confirmationSlot) : {}),
    ...(canWrite ? buildNoteTools(ctx) : {}),
    // Fase 4: comparte el MISMO confirmationSlot — sustituir contenido ya
    // existente pide confirmación igual que Board/Agenda, con el mismo
    // límite de "máximo una preparación por petición" entre todas.
    ...(canWrite ? buildContentTools(ctx, confirmationSlot) : {}),
    ...(canWrite && plan.whiteboardEnabled ? buildWhiteboardTools(ctx) : {}),
    // Fase 4C: edición interna de Board — mismo gate que las tools de
    // tablero de 4A (canWrite && whiteboardEnabled), comparte el MISMO
    // confirmationSlot que Agenda para que "máximo una preparación
    // confirmable por petición" sea real entre TODAS las capacidades, no
    // solo dentro de Board.
    ...(canWrite && plan.whiteboardEnabled ? buildBoardTools(ctx, confirmationSlot) : {}),
  };

  return { tools, confirmationSlot };
}

export type { PendingConfirmationSlot };
