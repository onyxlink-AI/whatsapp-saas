import { tool, zodSchema } from "ai";
import { z } from "zod";
import {
  searchNotes,
  createNote,
  updateNote,
  setNoteArchived,
} from "@/features/notes/services/note-actions";
import { logAudit } from "@/features/audit/services/audit-log";
import { assertHelpActionAccess, assistantAccessErrorMessage } from "../assistant-access";
import type { HelpActionContext } from "../../types";
import type { NoteContent } from "@/features/projects/types";

/**
 * Action tools for Anotaciones — Fase 4A. Sin eliminación física: solo
 * archive_note (archivar/restaurar) — igual que el resto de herramientas de
 * esta fase, ninguna borra nada de verdad.
 */

const SearchNotesSchema = z.object({
  query: z.string().min(1).describe("Título de la anotación a buscar"),
});

const CreateNoteSchema = z.object({
  title: z.string().optional().describe("Título — opcional, por defecto 'Sin título'"),
  content_text: z.string().optional().describe("Contenido inicial en texto plano, opcional"),
});

const UpdateNoteSchema = z
  .object({
    note_id: z.string().uuid(),
    title: z.string().min(1).optional(),
    content_text: z.string().optional().describe("Sustituye TODO el contenido del documento por este texto plano — no es un añadido parcial"),
  })
  .refine((v) => v.title !== undefined || v.content_text !== undefined, {
    message: "Indica al menos title o content_text",
  });

const ArchiveNoteSchema = z.object({
  note_id: z.string().uuid(),
  archived: z.boolean().describe("true para archivar, false para restaurar"),
});

/** Envuelve texto plano en el documento Tiptap mínimo válido que exige ContentSchema en note-actions.ts. */
function plainTextToNoteContent(text: string): NoteContent {
  return { type: "doc", content: [{ type: "paragraph", content: text ? [{ type: "text", text }] : [] }] } as NoteContent;
}

export function buildNoteTools(ctx: HelpActionContext) {
  return {
    search_notes: tool({
      description: "Busca anotaciones por título (nunca incluye archivadas). Úsalo antes de editar o archivar una para obtener su note_id.",
      inputSchema: zodSchema(SearchNotesSchema),
      execute: async ({ query }: z.infer<typeof SearchNotesSchema>) => {
        const access = await assertHelpActionAccess(ctx, "notes");
        if (!access.ok) return { ok: false, error: assistantAccessErrorMessage(access.reason) };

        const results = await searchNotes(ctx.workspaceId, query);
        return results.map((n) => ({ note_id: n.id, title: n.title, updated_at: n.updated_at }));
      },
    }),

    create_note: tool({
      description: "Crea una anotación nueva. El contenido (si lo das) se guarda como texto plano en un párrafo — el usuario puede darle formato después en el editor.",
      inputSchema: zodSchema(CreateNoteSchema),
      execute: async ({ title, content_text }: z.infer<typeof CreateNoteSchema>) => {
        const access = await assertHelpActionAccess(ctx, "notes");
        if (!access.ok) return { ok: false, error: assistantAccessErrorMessage(access.reason) };

        const result = await createNote(ctx.workspaceId, {
          title,
          content: content_text ? plainTextToNoteContent(content_text) : undefined,
        });
        if (!result.ok) return { ok: false, error: result.error };

        void logAudit({
          workspaceId: ctx.workspaceId,
          actorUserId: ctx.actorUserId,
          action: "help_assistant.create_note",
          targetType: "note",
          targetId: result.data.id,
          summary: `Asistente de Ayuda creó la anotación "${title || "Sin título"}"`,
        });

        return { ok: true, note_id: result.data.id };
      },
    }),

    update_note: tool({
      description:
        "Actualiza el título y/o TODO el contenido de una anotación existente (content_text reemplaza el documento completo, no lo añade). Necesitas su note_id — búscalo antes con search_notes.",
      inputSchema: zodSchema(UpdateNoteSchema),
      execute: async ({ note_id, title, content_text }: z.infer<typeof UpdateNoteSchema>) => {
        const access = await assertHelpActionAccess(ctx, "notes");
        if (!access.ok) return { ok: false, error: assistantAccessErrorMessage(access.reason) };

        // Revisión correctiva: título y contenido se guardan en UNA sola
        // sentencia (updateNote) — nunca dos escrituras separadas que
        // pudieran dejar una modificación a medias si la segunda fallara.
        const result = await updateNote(ctx.workspaceId, note_id, {
          title,
          content: content_text !== undefined ? plainTextToNoteContent(content_text) : undefined,
        });
        if (!result.ok) {
          return { ok: false, error: result.error === "not_found_or_forbidden" ? "No encontré esa anotación en esta empresa" : result.error };
        }

        // Solo audita tras el éxito COMPLETO de la actualización combinada.
        void logAudit({
          workspaceId: ctx.workspaceId,
          actorUserId: ctx.actorUserId,
          action: "help_assistant.update_note",
          targetType: "note",
          targetId: note_id,
          summary: "Asistente de Ayuda actualizó una anotación",
        });

        return { ok: true, note_id };
      },
    }),

    archive_note: tool({
      description:
        "Archiva o restaura una anotación — NUNCA la borra de verdad, no existe ninguna herramienta de borrado físico. Necesitas su note_id.",
      inputSchema: zodSchema(ArchiveNoteSchema),
      execute: async ({ note_id, archived }: z.infer<typeof ArchiveNoteSchema>) => {
        const access = await assertHelpActionAccess(ctx, "notes");
        if (!access.ok) return { ok: false, error: assistantAccessErrorMessage(access.reason) };

        const result = await setNoteArchived(ctx.workspaceId, note_id, archived);
        if (!result.ok) {
          return { ok: false, error: result.error === "not_found_or_forbidden" ? "No encontré esa anotación en esta empresa" : result.error };
        }

        void logAudit({
          workspaceId: ctx.workspaceId,
          actorUserId: ctx.actorUserId,
          action: "help_assistant.archive_note",
          targetType: "note",
          targetId: note_id,
          summary: archived ? "Asistente de Ayuda archivó una anotación" : "Asistente de Ayuda restauró una anotación",
        });

        return { ok: true, note_id };
      },
    }),
  };
}
