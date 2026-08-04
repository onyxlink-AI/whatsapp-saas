import { tool, zodSchema } from "ai";
import { z } from "zod";
import {
  listWhiteboards,
  createWhiteboard,
  renameWhiteboard,
} from "@/features/whiteboard/services/whiteboard-actions";
import { logAudit } from "@/features/audit/services/audit-log";
import type { HelpActionContext } from "../../types";

/**
 * Action tools for Pizarra — create/rename boards only. Deliberately does
 * NOT touch a board's drawn content (scene_data): @excalidraw/excalidraw is
 * a browser-only package (canvas/rough.js internals) that hangs/fails when
 * imported in a server context, so generating shapes/notes server-side
 * isn't reliable. The client draws; the assistant just manages the list of
 * boards. No delete tool exists here on purpose — see the plan doc.
 */

const SearchWhiteboardsSchema = z.object({
  query: z.string().min(1).describe("Nombre del tablero a buscar"),
});

const CreateWhiteboardSchema = z.object({
  name: z.string().optional().describe("Nombre del tablero — opcional, por defecto 'Sin título'"),
});

const RenameWhiteboardSchema = z.object({
  whiteboard_id: z.string().uuid(),
  name: z.string().min(1),
});

export function buildWhiteboardTools(ctx: HelpActionContext) {
  return {
    search_whiteboards: tool({
      description:
        "Busca tableros de Pizarra por nombre. Úsalo antes de renombrar uno para obtener su whiteboard_id.",
      inputSchema: zodSchema(SearchWhiteboardsSchema),
      execute: async ({ query }: z.infer<typeof SearchWhiteboardsSchema>) => {
        const boards = await listWhiteboards(ctx.workspaceId);
        const q = query.toLowerCase();
        return boards
          .filter((b) => b.name.toLowerCase().includes(q))
          .slice(0, 10)
          .map((b) => ({ whiteboard_id: b.id, name: b.name, updated_at: b.updated_at }));
      },
    }),

    create_whiteboard: tool({
      description:
        "Crea un tablero nuevo y vacío en Pizarra. El dibujo (formas, notas, flechas) lo hace el cliente después en el navegador — tú solo creas el tablero con un nombre, nunca dibujas contenido dentro.",
      inputSchema: zodSchema(CreateWhiteboardSchema),
      execute: async ({ name }: z.infer<typeof CreateWhiteboardSchema>) => {
        const result = await createWhiteboard(ctx.workspaceId, name);
        if (!result.ok) return { ok: false, error: result.error };

        void logAudit({
          workspaceId: ctx.workspaceId,
          actorUserId: ctx.actorUserId,
          action: "help_assistant.create_whiteboard",
          targetType: "whiteboard",
          targetId: result.data.id,
          summary: `Asistente de Ayuda creó el tablero "${name || "Sin título"}"`,
        });

        return { ok: true, whiteboard_id: result.data.id };
      },
    }),

    rename_whiteboard: tool({
      description:
        "Renombra un tablero existente de Pizarra. Necesitas su whiteboard_id — búscalo antes con search_whiteboards si no lo tienes.",
      inputSchema: zodSchema(RenameWhiteboardSchema),
      execute: async ({ whiteboard_id, name }: z.infer<typeof RenameWhiteboardSchema>) => {
        const result = await renameWhiteboard(whiteboard_id, name);
        if (!result.ok) return { ok: false, error: result.error };

        void logAudit({
          workspaceId: ctx.workspaceId,
          actorUserId: ctx.actorUserId,
          action: "help_assistant.rename_whiteboard",
          targetType: "whiteboard",
          targetId: whiteboard_id,
          summary: `Asistente de Ayuda renombró un tablero a "${name}"`,
        });

        return { ok: true, whiteboard_id };
      },
    }),
  };
}
