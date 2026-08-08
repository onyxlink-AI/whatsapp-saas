import { tool, zodSchema } from "ai";
import { z } from "zod";
import {
  searchContentItems,
  getContentItem,
  createContentItem,
  updateContentItem,
  moveContentStatus,
} from "@/features/content/services/content-actions";
import { generateContentScript } from "@/features/content/services/content-script-ai";
import { logAudit } from "@/features/audit/services/audit-log";
import { assertHelpActionAccess, assistantAccessErrorMessage } from "../assistant-access";
import type { HelpActionContext } from "../../types";

/**
 * Action tools for Contenido — Fase 4A. generate_content_script NUNCA
 * guarda el resultado — solo devuelve una propuesta; aplicarla de verdad
 * requiere una llamada aparte a update_content_script, así que el modelo
 * tiene que pedir confirmación al usuario entre medias (ver ACTION_RULES en
 * system-prompt.ts). Como máximo una generación por ejecución de esta
 * función — generationUsedThisRequest vive en el cierre de
 * buildContentTools, que se crea una vez por cada mensaje del usuario
 * (askHelpAssistant llama a buildActionTools una vez por petición), así que
 * nunca se encadenan generaciones dentro de la misma conversación en curso.
 */

const StatusEnum = z.enum(["idea", "in_production", "ready_to_publish", "published"]);
const OrientationEnum = z.enum(["vertical", "horizontal"]);

const SearchContentSchema = z.object({
  query: z.string().min(1).describe("Título o idea principal a buscar"),
});

const CreateContentIdeaSchema = z.object({
  title: z.string().min(1),
  main_idea: z.string().optional(),
});

const UpdateContentGeneralSchema = z.object({
  content_item_id: z.string().uuid(),
  title: z.string().min(1).optional(),
  main_idea: z.string().optional(),
  description: z.string().optional(),
  content_type: z.string().optional(),
  platform: z.string().optional(),
  orientation: OrientationEnum.optional(),
  duration_estimate: z.string().optional(),
  scheduled_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

const ReferenceLinkSchema = z.object({ label: z.string(), url: z.string().url() });

const UpdateContentScriptSchema = z.object({
  content_item_id: z.string().uuid(),
  hook: z.string().optional(),
  body: z.string().optional(),
  closing: z.string().optional(),
  cta: z.string().optional(),
  bullet_points: z.array(z.string()).optional(),
  links: z.array(ReferenceLinkSchema).optional(),
  lighting: z.string().optional(),
  music: z.string().optional(),
  notes: z.string().optional(),
});

const MoveContentStatusSchema = z.object({
  content_item_id: z.string().uuid(),
  status: StatusEnum,
});

const UpdateContentMetricsSchema = z.object({
  content_item_id: z.string().uuid(),
  metric_views: z.number().int().nonnegative().optional(),
  metric_reach: z.number().int().nonnegative().optional(),
  metric_likes: z.number().int().nonnegative().optional(),
  metric_comments: z.number().int().nonnegative().optional(),
  metric_shares: z.number().int().nonnegative().optional(),
  metric_saves: z.number().int().nonnegative().optional(),
  metric_clicks: z.number().int().nonnegative().optional(),
  metric_leads: z.number().int().nonnegative().optional(),
  metric_notes: z.string().optional(),
});

const GenerateContentScriptSchema = z.object({
  content_item_id: z.string().uuid().describe("La pieza de contenido cuyo guion se va a proponer — usa su información de General ya guardada"),
});

export function buildContentTools(ctx: HelpActionContext) {
  let generationUsedThisRequest = false;

  return {
    search_content: tool({
      description: "Busca ideas/guiones de Contenido por título o idea principal. Úsalo antes de editar, mover de estado o generar un guion para obtener su content_item_id.",
      inputSchema: zodSchema(SearchContentSchema),
      execute: async ({ query }: z.infer<typeof SearchContentSchema>) => {
        const access = await assertHelpActionAccess(ctx, "content");
        if (!access.ok) return { ok: false, error: assistantAccessErrorMessage(access.reason) };

        const results = await searchContentItems(ctx.workspaceId, query);
        return results.map((c) => ({ content_item_id: c.id, title: c.title, status: c.status }));
      },
    }),

    create_content_idea: tool({
      description: "Crea una idea nueva en Contenido. Siempre empieza en estado 'idea' — usa move_content_status después para avanzarla.",
      inputSchema: zodSchema(CreateContentIdeaSchema),
      execute: async (args: z.infer<typeof CreateContentIdeaSchema>) => {
        const access = await assertHelpActionAccess(ctx, "content");
        if (!access.ok) return { ok: false, error: assistantAccessErrorMessage(access.reason) };

        const result = await createContentItem(ctx.workspaceId, args);
        if (!result.ok) return { ok: false, error: result.error };

        void logAudit({
          workspaceId: ctx.workspaceId,
          actorUserId: ctx.actorUserId,
          action: "help_assistant.create_content_idea",
          targetType: "content_item",
          targetId: result.data.id,
          summary: `Asistente de Ayuda creó la idea de contenido "${args.title}"`,
        });

        return { ok: true, content_item_id: result.data.id };
      },
    }),

    update_content_general: tool({
      description: "Actualiza los campos de General (título, idea, descripción, tipo, red social, formato, duración, fecha) de una pieza de contenido existente. Necesitas su content_item_id — búscalo antes con search_content.",
      inputSchema: zodSchema(UpdateContentGeneralSchema),
      execute: async ({ content_item_id, ...patch }: z.infer<typeof UpdateContentGeneralSchema>) => {
        const access = await assertHelpActionAccess(ctx, "content");
        if (!access.ok) return { ok: false, error: assistantAccessErrorMessage(access.reason) };

        const result = await updateContentItem(ctx.workspaceId, content_item_id, patch);
        if (!result.ok) return { ok: false, error: result.error };

        void logAudit({
          workspaceId: ctx.workspaceId,
          actorUserId: ctx.actorUserId,
          action: "help_assistant.update_content_general",
          targetType: "content_item",
          targetId: content_item_id,
          summary: "Asistente de Ayuda actualizó los datos generales de un contenido",
        });

        return { ok: true, content_item_id };
      },
    }),

    update_content_script: tool({
      description:
        "Actualiza el guion (hook, desarrollo, cierre, CTA, bullet points, enlaces, luces, música, notas) de una pieza de contenido. Úsalo también para APLICAR una propuesta de generate_content_script después de que el usuario la confirme — nunca la apliques sin que el usuario la haya visto y aprobado.",
      inputSchema: zodSchema(UpdateContentScriptSchema),
      execute: async ({ content_item_id, ...patch }: z.infer<typeof UpdateContentScriptSchema>) => {
        const access = await assertHelpActionAccess(ctx, "content");
        if (!access.ok) return { ok: false, error: assistantAccessErrorMessage(access.reason) };

        const result = await updateContentItem(ctx.workspaceId, content_item_id, {
          script_hook: patch.hook,
          script_body: patch.body,
          script_closing: patch.closing,
          script_cta: patch.cta,
          bullet_points: patch.bullet_points,
          reference_links: patch.links,
          lighting_notes: patch.lighting,
          music_notes: patch.music,
          notes: patch.notes,
        });
        if (!result.ok) return { ok: false, error: result.error };

        void logAudit({
          workspaceId: ctx.workspaceId,
          actorUserId: ctx.actorUserId,
          action: "help_assistant.update_content_script",
          targetType: "content_item",
          targetId: content_item_id,
          summary: "Asistente de Ayuda actualizó el guion de un contenido",
        });

        return { ok: true, content_item_id };
      },
    }),

    move_content_status: tool({
      description: "Cambia el estado de una pieza de contenido en el pipeline (idea, en producción, listo para publicar, publicado). Necesitas su content_item_id.",
      inputSchema: zodSchema(MoveContentStatusSchema),
      execute: async ({ content_item_id, status }: z.infer<typeof MoveContentStatusSchema>) => {
        const access = await assertHelpActionAccess(ctx, "content");
        if (!access.ok) return { ok: false, error: assistantAccessErrorMessage(access.reason) };

        const result = await moveContentStatus(ctx.workspaceId, content_item_id, status, 0);
        if (!result.ok) return { ok: false, error: result.error };

        void logAudit({
          workspaceId: ctx.workspaceId,
          actorUserId: ctx.actorUserId,
          action: "help_assistant.move_content_status",
          targetType: "content_item",
          targetId: content_item_id,
          summary: `Asistente de Ayuda movió un contenido a "${status}"`,
        });

        return { ok: true, content_item_id, status };
      },
    }),

    update_content_metrics: tool({
      description: "Registra métricas manuales (vistas, alcance, me gusta, comentarios, compartidos, guardados, clics, leads, observaciones) de una pieza de contenido publicada. Necesitas su content_item_id.",
      inputSchema: zodSchema(UpdateContentMetricsSchema),
      execute: async ({ content_item_id, ...metrics }: z.infer<typeof UpdateContentMetricsSchema>) => {
        const access = await assertHelpActionAccess(ctx, "content");
        if (!access.ok) return { ok: false, error: assistantAccessErrorMessage(access.reason) };

        const result = await updateContentItem(ctx.workspaceId, content_item_id, metrics);
        if (!result.ok) return { ok: false, error: result.error };

        void logAudit({
          workspaceId: ctx.workspaceId,
          actorUserId: ctx.actorUserId,
          action: "help_assistant.update_content_metrics",
          targetType: "content_item",
          targetId: content_item_id,
          summary: "Asistente de Ayuda registró métricas de un contenido",
        });

        return { ok: true, content_item_id };
      },
    }),

    generate_content_script: tool({
      description:
        "Genera UNA propuesta de guion (hook, desarrollo, cierre, CTA, bullets, luces, música, notas) para una pieza de contenido, a partir de su información de General ya guardada — SOLO cuando el usuario lo pida explícitamente. Nunca la guarda: devuelve la propuesta para que la muestres al usuario, y solo si la confirma, aplícala con update_content_script. Como máximo una llamada por petición del usuario — nunca la repitas para 'mejorar' el resultado sin que el usuario lo pida de nuevo.",
      inputSchema: zodSchema(GenerateContentScriptSchema),
      execute: async ({ content_item_id }: z.infer<typeof GenerateContentScriptSchema>) => {
        const access = await assertHelpActionAccess(ctx, "content");
        if (!access.ok) return { ok: false, error: assistantAccessErrorMessage(access.reason) };

        if (generationUsedThisRequest) {
          return {
            ok: false,
            error: "Ya se generó un guion en esta misma petición. Pide al usuario que confirme antes de generar otro.",
          };
        }
        generationUsedThisRequest = true;

        const item = await getContentItem(content_item_id);
        if (!item || item.workspace_id !== ctx.workspaceId) {
          return { ok: false, error: "No encontré esa pieza de contenido en esta empresa" };
        }

        const result = await generateContentScript(ctx.workspaceId, {
          mainIdea: item.main_idea ?? "",
          description: item.description ?? "",
          contentType: item.content_type ?? "",
          platform: item.platform ?? "",
          orientation: item.orientation ?? null,
          durationEstimate: item.duration_estimate ?? "",
          responsibleId: item.responsible_id,
          scheduledDate: item.scheduled_date,
        });
        if (!result.ok) return { ok: false, error: result.error };

        void logAudit({
          workspaceId: ctx.workspaceId,
          actorUserId: ctx.actorUserId,
          action: "help_assistant.generate_content_script",
          targetType: "content_item",
          targetId: content_item_id,
          summary: "Asistente de Ayuda generó una propuesta de guion (sin guardar)",
        });

        return {
          ok: true,
          content_item_id,
          proposal: result.data,
          note: "Esto es solo una propuesta, todavía no se ha guardado. Muéstrasela al usuario y solo si la confirma, aplícala con update_content_script.",
        };
      },
    }),
  };
}
