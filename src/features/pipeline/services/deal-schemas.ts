/**
 * deal-schemas.ts — Zod validation schemas for deal actions, kept in a plain
 * (non "use server") module so they can be unit-tested directly.
 */

import { z } from "zod";
import { DEAL_STAGES } from "@/features/pipeline/types";
import type { DealStage } from "@/features/pipeline/types";

export const DealStageEnum = z.enum(DEAL_STAGES as [DealStage, ...DealStage[]]);

export const DealInputSchema = z.object({
  contact_id: z.string().uuid(),
  title: z.string().min(1, "El título es requerido"),
  value: z.number().min(0, "El valor no puede ser negativo").optional(),
  currency: z.string().length(3, "Moneda inválida").optional(),
  owner_id: z.string().uuid().optional(),
  expected_close_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida")
    .optional(),
  notes: z.string().optional(),
});

export type CreateDealInput = z.infer<typeof DealInputSchema>;

export const UpdateDealSchema = DealInputSchema.partial().extend({
  stage: DealStageEnum.optional(),
  lost_reason: z.string().optional(),
});

export type UpdateDealInput = z.infer<typeof UpdateDealSchema>;

export const ReorderSchema = z.object({
  stage: DealStageEnum,
  ordered_ids: z.array(z.string().uuid()).min(1),
});

export const CLOSED_STAGES: DealStage[] = ["cliente", "lost"];
