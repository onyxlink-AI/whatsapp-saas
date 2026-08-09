import { tool, zodSchema } from "ai";
import { z } from "zod";
import {
  searchAgendaTasks,
  createAgendaTask,
  updateAgendaTask,
  toggleAgendaTaskDone,
  getAgendaTaskById,
  restoreAgendaTask,
} from "@/features/projects/services/agenda-actions";
import { logAudit } from "@/features/audit/services/audit-log";
import { assertHelpActionAccess, assistantAccessErrorMessage } from "../assistant-access";
import { prepareConfirmableAction, type PendingConfirmationSlot } from "../pending-actions";
import type { HelpActionContext } from "../../types";

/**
 * Action tools for Agenda — Fase 4A + Fase 4B. Sin eliminación física, sin
 * Zoom ni sincronización con Google Calendar (eso solo existe hoy dentro de
 * Oficina Virtual, con su propio consentimiento — no se toca ni se
 * reutiliza aquí).
 *
 * Fase 4B: cancel_agenda_item añade una cancelación REVERSIBLE
 * (agenda_tasks.cancelled_at/cancelled_by) — nunca borra la fila. Como es
 * una acción "borrar/archivar en lote" en términos de §6.3, no ejecuta
 * directamente: valida, construye el resumen desde la fila real, y
 * PREPARA una acción pendiente (pending-actions.ts) que solo se ejecuta si
 * el usuario confirma desde la tarjeta del panel — nunca desde este mismo
 * turno de conversación. restore_agenda_item, en cambio, deshace una
 * cancelación (una operación reversible sobre algo ya reversible) y se
 * ejecuta directamente, igual que el resto de mutaciones de Fase 4A.
 */

const AGENDA_TIME_LABEL = (task: { scheduled_date: string | null; scheduled_week_start: string | null }): string => {
  if (task.scheduled_date) return `prevista para el ${task.scheduled_date}`;
  if (task.scheduled_week_start) return `prevista para la semana del ${task.scheduled_week_start}`;
  return "sin fecha programada";
};

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

const CancelAgendaItemSchema = z.object({
  agenda_item_id: z.string().uuid(),
});

const RestoreAgendaItemSchema = z.object({
  agenda_item_id: z.string().uuid(),
});

export function buildAgendaTools(ctx: HelpActionContext, confirmationSlot: PendingConfirmationSlot) {
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
        "Actualiza o reprograma una tarea de Agenda existente. Necesitas su agenda_item_id — búscalo antes con search_agenda_items. Para quitarla del calendario sin borrarla, usa cancel_agenda_item (pide confirmación) en vez de esta herramienta.",
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

    cancel_agenda_item: tool({
      description:
        "Cancela una tarea de Agenda de forma REVERSIBLE (no la borra — queda oculta de los listados normales, se puede restaurar con restore_agenda_item). Requiere confirmación explícita del usuario: esta herramienta solo PREPARA la cancelación, nunca la ejecuta directamente — el usuario debe confirmarla en la tarjeta que le aparece antes de que ocurra de verdad. Necesitas su agenda_item_id — búscalo antes con search_agenda_items. Como máximo una cancelación pendiente de confirmación por respuesta.",
      inputSchema: zodSchema(CancelAgendaItemSchema),
      execute: async ({ agenda_item_id }: z.infer<typeof CancelAgendaItemSchema>) => {
        const access = await assertHelpActionAccess(ctx, "agenda");
        if (!access.ok) return { ok: false, error: assistantAccessErrorMessage(access.reason) };

        if (confirmationSlot.remaining <= 0) {
          return {
            ok: false,
            error: "Ya hay otra acción esperando confirmación en esta respuesta. Resuélvela (confirma o cancela) antes de pedir otra.",
          };
        }

        const task = await getAgendaTaskById(ctx.workspaceId, agenda_item_id);
        if (!task) return { ok: false, error: "No encontré esa tarea de agenda en esta empresa" };
        if (task.cancelled_at) return { ok: false, error: "Esa tarea ya está cancelada" };

        // Plantilla fija con datos reales de la fila — nunca el texto que
        // el modelo quiera componer. Es el mismo texto que se le muestra
        // al usuario y el que queda guardado para auditoría (§8 del
        // diagnóstico aprobado) — nunca puede divergir.
        const summary = `Vas a cancelar «${task.title}», ${AGENDA_TIME_LABEL(task)}. Podrás restaurarla después.`;

        const prepared = await prepareConfirmableAction({
          workspaceId: ctx.workspaceId,
          actorUserId: ctx.actorUserId,
          actionType: "cancel_agenda_item",
          payload: { agenda_task_id: task.id },
          summary,
        });
        if (!prepared) return { ok: false, error: "No se pudo preparar la cancelación. Inténtalo de nuevo." };

        confirmationSlot.remaining -= 1;
        // El token NUNCA vuelve al modelo — solo summary/expiresInSeconds.
        // help-assistant-service.ts lo lee de confirmationSlot.prepared
        // después de que termine generateText(), fuera del texto que
        // pasó por OpenRouter.
        confirmationSlot.prepared = { token: prepared.token, expiresInSeconds: prepared.expiresInSeconds, summary };

        // targetId es el ID de la fila pendiente, no el de la tarea de
        // agenda — es el identificador común que comparten las 3
        // auditorías de este flujo (prepared aquí; executed/cancelled en
        // la ruta de confirmación). El ID de Agenda queda solo en metadata.
        void logAudit({
          workspaceId: ctx.workspaceId,
          actorUserId: ctx.actorUserId,
          action: "help_assistant.action_prepared",
          targetType: "assistant_pending_action",
          targetId: prepared.pendingActionId,
          summary: `Asistente de Ayuda preparó la cancelación de la tarea de agenda "${task.title}", pendiente de confirmación`,
          metadata: { action_type: "cancel_agenda_item", agenda_task_id: task.id },
        });

        return { ok: true, requiresConfirmation: true, summary, expiresInSeconds: prepared.expiresInSeconds };
      },
    }),

    restore_agenda_item: tool({
      description:
        "Restaura una tarea de Agenda previamente cancelada — vuelve a aparecer en los listados normales. Es una acción reversible (deshace una cancelación reversible), se ejecuta directamente sin pedir confirmación. Necesitas su agenda_item_id.",
      inputSchema: zodSchema(RestoreAgendaItemSchema),
      execute: async ({ agenda_item_id }: z.infer<typeof RestoreAgendaItemSchema>) => {
        const access = await assertHelpActionAccess(ctx, "agenda");
        if (!access.ok) return { ok: false, error: assistantAccessErrorMessage(access.reason) };

        const result = await restoreAgendaTask(ctx.workspaceId, agenda_item_id);
        if (!result.ok) {
          return {
            ok: false,
            error: result.error === "not_found_or_forbidden" ? "No encontré esa tarea de agenda cancelada en esta empresa" : result.error,
          };
        }

        void logAudit({
          workspaceId: ctx.workspaceId,
          actorUserId: ctx.actorUserId,
          action: "help_assistant.restore_agenda_item",
          targetType: "agenda_task",
          targetId: agenda_item_id,
          summary: "Asistente de Ayuda restauró una tarea de agenda cancelada",
        });

        return { ok: true, agenda_item_id };
      },
    }),
  };
}
