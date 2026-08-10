import { tool, zodSchema } from "ai";
import { z } from "zod";
import {
  searchContentItems,
  getContentItem,
  createContentItem,
  updateContentItem,
  updateContentItemFieldsCas,
  moveContentStatus,
  type ContentItemPatch,
} from "@/features/content/services/content-actions";
import { generateContentScript } from "@/features/content/services/content-script-ai";
import { logAudit } from "@/features/audit/services/audit-log";
import { assertHelpActionAccess, assistantAccessErrorMessage } from "../assistant-access";
import { prepareConfirmableAction, type PendingConfirmationSlot } from "../pending-actions";
import type { HelpActionContext } from "../../types";
import type { ContentItemRow } from "@/features/content/types";

/**
 * Action tools for Contenido — Fase 4 (Agente de Contenido conectado con
 * Guiones). Reutiliza el mismo modelo de autorización y CAS que Gestión:
 *
 * - Cada escritura de General/Guion pasa por `updateContentItemFieldsCas`
 *   (comparar-y-cambiar real, ver migración 20260811000000) — nunca a
 *   ciegas. El modelo necesita `expected_version`, obtenida con
 *   `get_content_item`/`search_content` justo antes.
 * - Rellenar un campo VACÍO es directo. Sustituir un campo que YA tenía
 *   contenido exige confirmación de dos pasos, reutilizando la MISMA
 *   infraestructura de `assistant_pending_actions` que Board/Agenda
 *   (mismo `confirmationSlot`, máximo una preparación por petición entre
 *   TODAS las capacidades).
 * - `responsible_id` nunca se confía tal cual: la función SQL revalida
 *   que pertenece al mismo workspace antes de guardar nada.
 * - `generate_content_script` NUNCA guarda — solo devuelve una propuesta;
 *   aplicarla de verdad requiere una llamada aparte a
 *   `update_content_script`, que sigue exactamente la misma regla de
 *   confirmación que cualquier otra sustitución de campo con contenido.
 * - move_content_status/update_content_metrics no forman parte del
 *   flujo de sustituir contenido narrativo (estado de flujo / datos
 *   aditivos de métricas) — siguen usando `updateContentItem` tal cual,
 *   sin CAS ni confirmación, alcance explícitamente acotado.
 */

const StatusEnum = z.enum(["idea", "in_production", "ready_to_publish", "published"]);
const OrientationEnum = z.enum(["vertical", "horizontal"]);

const SearchContentSchema = z.object({
  query: z.string().min(1).describe("Título o idea principal a buscar"),
});

const GetContentItemSchema = z.object({
  content_item_id: z.string().uuid(),
});

const CreateContentIdeaSchema = z.object({
  title: z.string().min(1),
  main_idea: z.string().optional(),
});

const UpdateContentGeneralSchema = z.object({
  content_item_id: z.string().uuid(),
  expected_version: z.number().int().positive().describe("La versión actual del contenido — obtenla con get_content_item o search_content justo antes"),
  title: z.string().min(1).optional(),
  main_idea: z.string().optional(),
  description: z.string().optional(),
  content_type: z.string().optional(),
  platform: z.string().optional(),
  orientation: OrientationEnum.optional(),
  duration_estimate: z.string().optional(),
  scheduled_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  responsible_id: z.string().uuid().optional().describe("ID de un miembro activo del MISMO workspace — se revalida en el servidor, nunca te fíes de que sea correcto"),
});

const ReferenceLinkSchema = z.object({ label: z.string(), url: z.string().url() });

const UpdateContentScriptSchema = z.object({
  content_item_id: z.string().uuid(),
  expected_version: z.number().int().positive().describe("La versión actual del contenido — obtenla con get_content_item justo antes"),
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

const CONFLICT_MESSAGES: Record<string, string> = {
  not_found: "No encontré esa pieza de contenido en esta empresa.",
  conflict: "Ese contenido cambió desde la última vez que lo leíste. Vuelve a leerlo con get_content_item antes de reintentar.",
  invalid_responsible: "Ese responsable no pertenece a esta empresa — revisa el ID e inténtalo de nuevo.",
  internal_error: "No se pudo guardar el cambio en este momento. Inténtalo de nuevo.",
};

/** Campos de texto/lista — "vacío" es el único caso que puede rellenarse sin confirmar. */
function isEmptyCurrentValue(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === "string") return value.trim().length === 0;
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

function valuesDiffer(current: unknown, next: unknown): boolean {
  return JSON.stringify(current ?? null) !== JSON.stringify(next ?? null);
}

const FIELD_LABELS_ES: Record<string, string> = {
  title: "título",
  main_idea: "idea principal",
  description: "breve descripción",
  content_type: "tipo de contenido",
  platform: "red social",
  orientation: "formato",
  duration_estimate: "duración",
  scheduled_date: "fecha prevista",
  responsible_id: "responsable",
  script_hook: "Hook",
  script_body: "desarrollo",
  script_closing: "cierre",
  script_cta: "CTA",
  bullet_points: "bullet points",
  reference_links: "enlaces/referencias",
  lighting_notes: "luces",
  music_notes: "música",
  notes: "notas",
};

/**
 * Compara el parche propuesto contra el estado real leído justo antes de
 * escribir (nunca el que el modelo recuerde de una llamada anterior).
 * Un campo exige confirmación solo si YA tenía contenido Y va a cambiar de
 * verdad — nunca por rellenar algo vacío ni por "cambiarlo" al mismo valor.
 */
function planContentPatch(item: ContentItemRow, patch: Record<string, unknown>): { fieldsNeedingConfirmation: string[] } {
  const fieldsNeedingConfirmation: string[] = [];
  for (const [key, next] of Object.entries(patch)) {
    if (next === undefined) continue;
    const current = (item as unknown as Record<string, unknown>)[key];
    if (!isEmptyCurrentValue(current) && valuesDiffer(current, next)) {
      fieldsNeedingConfirmation.push(key);
    }
  }
  return { fieldsNeedingConfirmation };
}

export type WriteOutcome =
  | { kind: "written"; version: number }
  | { kind: "requires_confirmation"; summary: string; expiresInSeconds: number; token: string }
  | { kind: "error"; error: string };

/**
 * Único punto de escritura de General/Guion — lee el estado real, decide si
 * hace falta confirmación (comparando contra ESE estado, no contra lo que
 * el modelo diga), y si no hace falta, escribe directo vía CAS. Si hace
 * falta, prepara la confirmación (nunca escribe) y consume un hueco del
 * `confirmationSlot` compartido entre todas las tools de esta petición.
 *
 * Exportada — reutilizada tal cual (sin duplicar la lógica de diff/CAS/
 * confirmación) por el especialista "Creador de Contenido" de la Oficina
 * Virtual (`office-virtual/server/office-content-ports.ts`), que comparte
 * exactamente esta misma pieza de infraestructura con el Asistente de
 * Ayuda — `ctx` solo necesita `{ workspaceId, actorUserId }`.
 */
export async function writeContentFieldsWithConfirmation(
  ctx: HelpActionContext,
  confirmationSlot: PendingConfirmationSlot,
  contentItemId: string,
  expectedVersion: number,
  patch: ContentItemPatch,
): Promise<WriteOutcome> {
  const item = await getContentItem(contentItemId);
  if (!item || item.workspace_id !== ctx.workspaceId) {
    return { kind: "error", error: CONFLICT_MESSAGES.not_found };
  }
  if (item.version !== expectedVersion) {
    return { kind: "error", error: CONFLICT_MESSAGES.conflict };
  }

  const { fieldsNeedingConfirmation } = planContentPatch(item, patch);

  if (fieldsNeedingConfirmation.length === 0) {
    const result = await updateContentItemFieldsCas(ctx.workspaceId, contentItemId, expectedVersion, patch);
    if (!result.ok) return { kind: "error", error: CONFLICT_MESSAGES.internal_error };
    if (result.data.result === "updated") return { kind: "written", version: result.data.version };
    if (result.data.result === "invalid_responsible") return { kind: "error", error: CONFLICT_MESSAGES.invalid_responsible };
    if (result.data.result === "not_found_or_forbidden") return { kind: "error", error: CONFLICT_MESSAGES.not_found };
    return { kind: "error", error: CONFLICT_MESSAGES.conflict };
  }

  if (confirmationSlot.remaining <= 0) {
    return { kind: "error", error: "Ya hay otra acción esperando confirmación en esta respuesta. Resuélvela (confirma o cancela) antes de pedir otra." };
  }

  const fieldLabels = fieldsNeedingConfirmation.map((key) => FIELD_LABELS_ES[key] ?? key).join(", ");
  const summary = `Vas a sustituir en «${item.title}» el contenido ya guardado de: ${fieldLabels}. Podrás revisarlo antes de confirmar.`;

  const prepared = await prepareConfirmableAction({
    workspaceId: ctx.workspaceId,
    actorUserId: ctx.actorUserId,
    actionType: "update_content_item",
    payload: { content_item_id: contentItemId, expected_version: expectedVersion, patch },
    summary,
  });
  if (!prepared) return { kind: "error", error: "No se pudo preparar la confirmación. Inténtalo de nuevo." };

  confirmationSlot.remaining -= 1;
  confirmationSlot.prepared = { token: prepared.token, expiresInSeconds: prepared.expiresInSeconds, summary };

  void logAudit({
    workspaceId: ctx.workspaceId,
    actorUserId: ctx.actorUserId,
    action: "help_assistant.action_prepared",
    targetType: "assistant_pending_action",
    targetId: prepared.pendingActionId,
    summary: "Asistente de Ayuda preparó la sustitución de contenido ya existente, pendiente de confirmación",
    metadata: { action_type: "update_content_item", content_item_id: contentItemId, fields: fieldsNeedingConfirmation },
  });

  return { kind: "requires_confirmation", summary, expiresInSeconds: prepared.expiresInSeconds, token: prepared.token };
}

export function buildContentTools(ctx: HelpActionContext, confirmationSlot: PendingConfirmationSlot) {
  let generationUsedThisRequest = false;

  return {
    search_content: tool({
      description: "Busca ideas/guiones de Contenido por título o idea principal. Úsalo antes de editar, mover de estado o generar un guion para obtener su content_item_id y su versión actual.",
      inputSchema: zodSchema(SearchContentSchema),
      execute: async ({ query }: z.infer<typeof SearchContentSchema>) => {
        const access = await assertHelpActionAccess(ctx, "content");
        if (!access.ok) return { ok: false, error: assistantAccessErrorMessage(access.reason) };

        const results = await searchContentItems(ctx.workspaceId, query);
        return results.map((c) => ({ content_item_id: c.id, title: c.title, status: c.status, element_version: c.version }));
      },
    }),

    get_content_item: tool({
      description: "Lee el contenido completo (General + Guion) de una pieza concreta, incluida su versión actual — necesaria para cualquier actualización posterior. Nunca hace falta adivinar el estado actual, léelo siempre aquí antes de editar.",
      inputSchema: zodSchema(GetContentItemSchema),
      execute: async ({ content_item_id }: z.infer<typeof GetContentItemSchema>) => {
        const access = await assertHelpActionAccess(ctx, "content");
        if (!access.ok) return { ok: false, error: assistantAccessErrorMessage(access.reason) };

        const item = await getContentItem(content_item_id);
        if (!item || item.workspace_id !== ctx.workspaceId) return { ok: false, error: CONFLICT_MESSAGES.not_found };

        return {
          ok: true,
          content_item_id: item.id,
          element_version: item.version,
          title: item.title,
          main_idea: item.main_idea,
          description: item.description,
          content_type: item.content_type,
          platform: item.platform,
          orientation: item.orientation,
          duration_estimate: item.duration_estimate,
          scheduled_date: item.scheduled_date,
          responsible_id: item.responsible_id,
          status: item.status,
          script_hook: item.script_hook,
          script_body: item.script_body,
          script_closing: item.script_closing,
          script_cta: item.script_cta,
          bullet_points: item.bullet_points,
          reference_links: item.reference_links,
          lighting_notes: item.lighting_notes,
          music_notes: item.music_notes,
          notes: item.notes,
        };
      },
    }),

    create_content_idea: tool({
      description: "Crea una idea nueva en Contenido. Siempre empieza en estado 'idea' — usa move_content_status después para avanzarla. Ejecución directa, nunca requiere confirmación (es una fila nueva, no sustituye nada).",
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
      description:
        "Actualiza los campos de General (título, idea, descripción, tipo, red social, formato, duración, fecha, responsable) de una pieza de contenido existente. Necesitas content_item_id y expected_version — obtenlos con get_content_item justo antes. Rellenar un campo vacío es directo; sustituir uno que ya tenía contenido pide confirmación al usuario.",
      inputSchema: zodSchema(UpdateContentGeneralSchema),
      execute: async ({ content_item_id, expected_version, ...patch }: z.infer<typeof UpdateContentGeneralSchema>) => {
        const access = await assertHelpActionAccess(ctx, "content");
        if (!access.ok) return { ok: false, error: assistantAccessErrorMessage(access.reason) };

        const outcome = await writeContentFieldsWithConfirmation(ctx, confirmationSlot, content_item_id, expected_version, patch);
        if (outcome.kind === "error") return { ok: false, error: outcome.error };
        if (outcome.kind === "requires_confirmation") {
          return { ok: true, requiresConfirmation: true, summary: outcome.summary, expiresInSeconds: outcome.expiresInSeconds };
        }

        void logAudit({
          workspaceId: ctx.workspaceId,
          actorUserId: ctx.actorUserId,
          action: "help_assistant.update_content_general",
          targetType: "content_item",
          targetId: content_item_id,
          summary: "Asistente de Ayuda actualizó los datos generales de un contenido",
        });

        return { ok: true, content_item_id, element_version: outcome.version };
      },
    }),

    update_content_script: tool({
      description:
        "Actualiza el guion (hook, desarrollo, cierre, CTA, bullet points, enlaces, luces, música, notas) de una pieza de contenido. Úsalo también para APLICAR una propuesta de generate_content_script después de que el usuario la confirme. Necesitas content_item_id y expected_version — obtenlos con get_content_item justo antes. Rellenar un campo vacío es directo; sustituir uno que ya tenía contenido pide confirmación al usuario.",
      inputSchema: zodSchema(UpdateContentScriptSchema),
      execute: async ({ content_item_id, expected_version, ...patch }: z.infer<typeof UpdateContentScriptSchema>) => {
        const access = await assertHelpActionAccess(ctx, "content");
        if (!access.ok) return { ok: false, error: assistantAccessErrorMessage(access.reason) };

        const mappedPatch: ContentItemPatch = {
          script_hook: patch.hook,
          script_body: patch.body,
          script_closing: patch.closing,
          script_cta: patch.cta,
          bullet_points: patch.bullet_points,
          reference_links: patch.links,
          lighting_notes: patch.lighting,
          music_notes: patch.music,
          notes: patch.notes,
        };

        const outcome = await writeContentFieldsWithConfirmation(ctx, confirmationSlot, content_item_id, expected_version, mappedPatch);
        if (outcome.kind === "error") return { ok: false, error: outcome.error };
        if (outcome.kind === "requires_confirmation") {
          return { ok: true, requiresConfirmation: true, summary: outcome.summary, expiresInSeconds: outcome.expiresInSeconds };
        }

        void logAudit({
          workspaceId: ctx.workspaceId,
          actorUserId: ctx.actorUserId,
          action: "help_assistant.update_content_script",
          targetType: "content_item",
          targetId: content_item_id,
          summary: "Asistente de Ayuda actualizó el guion de un contenido",
        });

        return { ok: true, content_item_id, element_version: outcome.version };
      },
    }),

    move_content_status: tool({
      description: "Cambia el estado de una pieza de contenido en el pipeline (idea, en producción, listo para publicar, publicado). Necesitas su content_item_id. Ejecución directa — es un cambio de flujo, no una sustitución de contenido narrativo.",
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
      description: "Registra métricas manuales (vistas, alcance, me gusta, comentarios, compartidos, guardados, clics, leads, observaciones) de una pieza de contenido publicada. Necesitas su content_item_id. Ejecución directa — son datos aditivos, no contenido narrativo que sustituir.",
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
        "Genera UNA propuesta de guion (hook, desarrollo, cierre, CTA, bullets, luces, música, notas) para una pieza de contenido, a partir de su información de General ya guardada — SOLO cuando el usuario lo pida explícitamente. Usa ÚNICAMENTE la integración OpenRouter del propio cliente (nunca una clave de plataforma) y respeta su límite de generaciones por hora — si no está conectada o se alcanzó el límite, lo dice claramente, nunca lo intenta con otra clave. Nunca la guarda: devuelve la propuesta para que la muestres al usuario, y solo si la confirma, aplícala con update_content_script. Como máximo una llamada por petición del usuario — nunca la repitas para 'mejorar' el resultado sin que el usuario lo pida de nuevo.",
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
          element_version: item.version,
          proposal: result.data,
          note: "Esto es solo una propuesta, todavía no se ha guardado. Muéstrasela al usuario y solo si la confirma, aplícala con update_content_script (usando la misma expected_version de más arriba, salvo que hayas vuelto a leer el contenido mientras tanto).",
        };
      },
    }),
  };
}
