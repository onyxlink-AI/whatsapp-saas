/**
 * deal-schemas.ts — Zod validation schemas for deal actions, kept in a plain
 * (non "use server") module so they can be unit-tested directly.
 */

import { z } from "zod";
import { DEAL_STAGES } from "@/features/pipeline/types";
import type { DealStage } from "@/features/pipeline/types";

export const DealStageEnum = z.enum(DEAL_STAGES as [DealStage, ...DealStage[]]);

// Kept as a plain (non-refined) object so UpdateDealSchema below can still
// call .partial() on it — ZodEffects (the result of .refine()) doesn't
// support .partial(), so the "must have an identity" rule is layered on
// top only for the create schema, not reused for partial updates.
const DealBaseSchema = z.object({
  title: z.string().min(1, "El título es requerido"),
  // Set when creating a deal from an existing contact (e.g. the "Crear
  // negocio" shortcut from a contact's CRM panel, ?createFor=<id>) — links
  // directly instead of going through the inline-lead/promotion dance.
  contact_id: z.string().uuid().optional(),
  // Inline lead identity — lets an opportunity be logged with no existing
  // Contact at all. Required together only when contact_id isn't given (see
  // DealInputSchema's refine below); email/sector stay optional either way.
  lead_name: z.string().optional(),
  lead_phone: z.string().optional(),
  lead_email: z.string().email("Email inválido").optional().or(z.literal("")),
  lead_social: z.string().optional(),
  lead_contact_method: z.string().optional(),
  // Raw typed text — createDeal() finds-or-creates the matching `sectors` row.
  sector_name: z.string().optional().or(z.literal("")),
  value: z.number().min(0, "El valor no puede ser negativo").optional(),
  currency: z.string().length(3, "Moneda inválida").optional(),
  owner_id: z.string().uuid().optional(),
  expected_close_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida")
    .optional(),
  notes: z.string().optional(),
});

export const DealInputSchema = DealBaseSchema.refine(
  (data) => Boolean(data.contact_id) || Boolean(data.lead_name?.trim()),
  { message: "Indica un contacto existente o al menos el nombre del negocio/lead", path: ["lead_name"] },
);

export type CreateDealInput = z.infer<typeof DealInputSchema>;

export const UpdateDealSchema = DealBaseSchema.partial().extend({
  stage: DealStageEnum.optional(),
  lost_reason: z.string().optional(),
});

export type UpdateDealInput = z.infer<typeof UpdateDealSchema>;

export const ReorderSchema = z.object({
  stage: DealStageEnum,
  ordered_ids: z.array(z.string().uuid()).min(1),
});

export const CLOSED_STAGES: DealStage[] = ["cliente", "lost"];
