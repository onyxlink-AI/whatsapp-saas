import { tool, zodSchema } from "ai";
import { z } from "zod";
import {
  searchAgendaTasks,
  createAgendaTask,
  updateAgendaTask,
  toggleAgendaTaskDone,
} from "@/features/projects/services/agenda-actions";
import { logAudit } from "@/features/audit/services/audit-log";
import { assertHelpActionAccess, assistantAccessErrorMessage } from "../assistant-access";
import type { HelpActionContext } from "../../types";

/**
 * Action tools for Agenda — Fase 4A. Sin eliminación física, sin Zoom ni
 * sincronización con Google Calendar (eso solo existe hoy dentro de Oficina
 * Virtual, con su propio consentimiento — no se toca ni se reutiliza aquí).
 * No existe ninguna herramienta de "cancelar": agenda_tasks no tiene un
 * estado de cancelación distinto de "done"/eliminar, así que no se inventa
 * uno nuevo en silencio — complete_agenda_item(done:false) es lo más
 * cercano que existe hoy.
 */

const SearchAgendaItemsSchema = z.object({
  query: z.string().min(1).describe("Título de la tarea de agenda a buscar"),
});

const CreateAgendaItemSchema = z
  .object({
    title: z.string().min(1),
    notes: z.string().optional(),
    scheduled_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe("Fecha exacta (YYYY-MM-DD) — usa esto o scheduled_week_start, no ambos"),
    scheduled_week_start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe("Lunes de la semana (YYYY-MM-DD) para una tarea sin día exacto"),
    assigned_to: z.string().uuid().optional(),
  })
  .refine((v) => Boolean(v.scheduled_date) || Boolean(v.scheduled_week_start), {
    message: "Indica scheduled_date o scheduled_week_start",
  });

const UpdateAgendaItemSchema = z.object({
  agenda_item_id: z.string().uuid(),
  title: z.string().min(1).optional(),
  notes: z.string().optional(),
  scheduled_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  scheduled_week_start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  assigned_to: z.string().uuid().optional(),
});

const CompleteAgendaItemSchema = z.object({
  agenda_item_id: z.string().uuid(),
  done: z.boolean().describe("true para marcarla completada, false para desmarcarla"),
});

export function buildAgendaTools(ctx: HelpActionContext) {
  return {
    search_agenda_items: tool({
      description: "Busca tareas de Agenda por título. Úsalo antes de actualizar o completar una para obtener su agenda_item_id.",
      inputSchema: zodSchema(SearchAgendaItemsSchema),
      execute: async ({ query }: z.infer<typeof SearchAgendaItemsSchema>) => {
        const access = await assertHelpActionAccess(ctx, "agenda");
        if (!access.ok) return { ok: false, error: assistantAccessErrorMessage(access.reason) };

        const results = await searchAgendaTasks(ctx.workspaceId, query);
        return results.map((t) => ({
          agenda_item_id: t.id,
          title: t.title,
          scheduled_date: t.scheduled_date,
          scheduled_week_start: t.scheduled_week_start,
          done: t.done,
        }));
      },
    }),

    create_agenda_item: tool({
      description:
        "Crea una tarea de Agenda. Necesita un día (scheduled_date) o una semana (scheduled_week_start) — nunca ambos. No crea reuniones de Zoom ni la sincroniza con Google Calendar.",
      inputSchema: zodSchema(CreateAgendaItemSchema),
      execute: async (args: z.infer<typeof CreateAgendaItemSchema>) => {
        const access = await assertHelpActionAccess(ctx, "agenda");
        if (!access.ok) return { ok: false, error: assistantAccessErrorMessage(access.reason) };

        const result = await createAgendaTask(ctx.workspaceId, args);
        if (!result.ok) return { ok: false, error: result.error };

        void logAudit({
          workspaceId: ctx.workspaceId,
          actorUserId: ctx.actorUserId,
          action: "help_assistant.create_agenda_item",
          targetType: "agenda_task",
          targetId: result.data.id,
          summary: `Asistente de Ayuda creó la tarea de agenda "${args.title}"`,
        });

        return { ok: true, agenda_item_id: result.data.id };
      },
    }),

    update_agenda_item: tool({
      description:
        "Actualiza o reprograma una tarea de Agenda existente. Necesitas su agenda_item_id — búscalo antes con search_agenda_items. No existe una acción de 'cancelar' — para eso, usa complete_agenda_item o explica que debe borrarse desde el panel.",
      inputSchema: zodSchema(UpdateAgendaItemSchema),
      execute: async ({ agenda_item_id, ...patch }: z.infer<typeof UpdateAgendaItemSchema>) => {
        const access = await assertHelpActionAccess(ctx, "agenda");
        if (!access.ok) return { ok: false, error: assistantAccessErrorMessage(access.reason) };

        const result = await updateAgendaTask(ctx.workspaceId, agenda_item_id, patch);
        if (!result.ok) {
          return { ok: false, error: result.error === "not_found_or_forbidden" ? "No encontré esa tarea de agenda en esta empresa" : result.error };
        }

        void logAudit({
          workspaceId: ctx.workspaceId,
          actorUserId: ctx.actorUserId,
          action: "help_assistant.update_agenda_item",
          targetType: "agenda_task",
          targetId: agenda_item_id,
          summary: "Asistente de Ayuda actualizó una tarea de agenda",
        });

        return { ok: true, agenda_item_id };
      },
    }),

    complete_agenda_item: tool({
      description: "Marca (o desmarca) una tarea de Agenda como completada. Necesitas su agenda_item_id.",
      inputSchema: zodSchema(CompleteAgendaItemSchema),
      execute: async ({ agenda_item_id, done }: z.infer<typeof CompleteAgendaItemSchema>) => {
        const access = await assertHelpActionAccess(ctx, "agenda");
        if (!access.ok) return { ok: false, error: assistantAccessErrorMessage(access.reason) };

        const result = await toggleAgendaTaskDone(ctx.workspaceId, agenda_item_id, done);
        if (!result.ok) {
          return { ok: false, error: result.error === "not_found_or_forbidden" ? "No encontré esa tarea de agenda en esta empresa" : result.error };
        }

        void logAudit({
          workspaceId: ctx.workspaceId,
          actorUserId: ctx.actorUserId,
          action: "help_assistant.complete_agenda_item",
          targetType: "agenda_task",
          targetId: agenda_item_id,
          summary: done ? "Asistente de Ayuda completó una tarea de agenda" : "Asistente de Ayuda desmarcó una tarea de agenda",
        });

        return { ok: true, agenda_item_id };
      },
    }),
  };
}
