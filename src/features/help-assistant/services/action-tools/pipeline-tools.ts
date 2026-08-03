import { tool, zodSchema } from "ai";
import { z } from "zod";
import { createDeal, updateDeal, getDealsForBoard } from "@/features/pipeline/services/deal-actions";
import { DealStageEnum } from "@/features/pipeline/services/deal-schemas";
import { DEAL_PRODUCTS } from "@/features/pipeline/types";
import { logAudit } from "@/features/audit/services/audit-log";
import type { HelpActionContext } from "../../types";

/**
 * Action tools for Oportunidades/Pipeline — thin wrappers around
 * deal-actions.ts. update_deal wraps updateDeal(), which already triggers
 * promoteDealToContactIfWon() automatically when a deal moves to "cliente"
 * — that behavior is inherited for free, nothing to reimplement here. No
 * delete tool exists here on purpose — see the plan doc.
 */

const SearchDealsSchema = z.object({
  query: z.string().min(1).describe("Título, nombre o teléfono a buscar"),
});

// Exported so action-tools.test.ts can assert the validation message directly
// (the AI SDK's own input-schema check runs outside `execute`, so testing
// through `.execute()` alone wouldn't exercise this).
export const CreateDealSchema = z
  .object({
    title: z.enum(DEAL_PRODUCTS).describe("Producto: Herramienta, Panel completo, u Oficina Virtual"),
    contact_id: z.string().uuid().optional(),
    lead_name: z.string().optional().describe("Nombre del negocio/persona — OBLIGATORIO si no das contact_id"),
    lead_phone: z.string().optional().describe("Teléfono del lead, opcional"),
    lead_email: z.string().email().optional(),
    lead_social: z.string().optional().describe("Red social del lead (ej. Instagram), opcional"),
    lead_contact_method: z.string().optional().describe("Método de contacto preferido del lead, opcional"),
    sector_name: z.string().optional(),
    value: z.number().min(0).optional(),
    expected_close_date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
  })
  .refine((data) => Boolean(data.contact_id) || Boolean(data.lead_name?.trim()), {
    message:
      "Falta el nombre (lead_name) del negocio — indica un contact_id existente o al menos el nombre.",
    path: ["lead_name"],
  });

const UpdateDealSchema = z.object({
  deal_id: z.string().uuid(),
  stage: DealStageEnum.optional(),
  value: z.number().min(0).optional(),
  expected_close_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  lost_reason: z.string().optional(),
  notes: z.string().optional(),
});

export function buildPipelineTools(ctx: HelpActionContext) {
  return {
    search_deals: tool({
      description:
        "Busca oportunidades del Pipeline por título, o por nombre/teléfono del cliente o lead. Úsalo antes de actualizar un negocio para obtener su deal_id.",
      inputSchema: zodSchema(SearchDealsSchema),
      execute: async ({ query }: z.infer<typeof SearchDealsSchema>) => {
        const deals = await getDealsForBoard(ctx.workspaceId);
        const q = query.toLowerCase();
        return deals
          .filter((d) => {
            const contactName = (d.contact?.name ?? d.lead_name ?? "").toLowerCase();
            const contactPhone = (d.contact?.phone ?? d.lead_phone ?? "").toLowerCase();
            return (
              d.title.toLowerCase().includes(q) ||
              contactName.includes(q) ||
              contactPhone.includes(q)
            );
          })
          .slice(0, 10)
          .map((d) => ({
            deal_id: d.id,
            title: d.title,
            stage: d.stage,
            contact_name: d.contact?.name ?? d.lead_name ?? null,
            value: d.value,
          }));
      },
    }),

    create_deal: tool({
      description:
        "Crea una oportunidad nueva en el Pipeline. Necesitas identificar al cliente/lead de una de estas dos formas: (a) si ya existe como cliente, búscalo con search_clients y pasa su client_id como contact_id, o (b) si no existe, da al menos lead_name (el NOMBRE del negocio o persona) — teléfono, correo, red social y método de contacto son todos opcionales, usa los que el usuario te dé. El campo 'title' (Producto) es obligatorio — pregunta cuál de los tres si no lo dieron. Pregunta también el sector si no lo dieron.",
      inputSchema: zodSchema(CreateDealSchema),
      execute: async (args: z.infer<typeof CreateDealSchema>) => {
        const result = await createDeal(ctx.workspaceId, args);
        if (!result.ok) return { ok: false, error: result.error };

        void logAudit({
          workspaceId: ctx.workspaceId,
          actorUserId: ctx.actorUserId,
          action: "help_assistant.create_deal",
          targetType: "deal",
          targetId: result.data.id,
          summary: `Asistente de Ayuda creó la oportunidad "${args.title}"`,
        });

        return { ok: true, deal_id: result.data.id };
      },
    }),

    update_deal: tool({
      description:
        "Actualiza una oportunidad existente: mover de etapa, cambiar valor, fecha de cierre, motivo de pérdida o notas. Necesitas su deal_id — búscalo antes con search_deals si no lo tienes.",
      inputSchema: zodSchema(UpdateDealSchema),
      execute: async ({ deal_id, ...patch }: z.infer<typeof UpdateDealSchema>) => {
        const result = await updateDeal(deal_id, patch);
        if (!result.ok) return { ok: false, error: result.error };

        void logAudit({
          workspaceId: ctx.workspaceId,
          actorUserId: ctx.actorUserId,
          action: "help_assistant.update_deal",
          targetType: "deal",
          targetId: deal_id,
          summary: "Asistente de Ayuda actualizó una oportunidad del pipeline",
        });

        return { ok: true, deal_id };
      },
    }),
  };
}
