/**
 * goal-schemas.ts — Zod validation for agency_goals CRUD, kept in a plain
 * (non "use server") module so it can be unit-tested directly. Mirrors the
 * pattern in features/pipeline/services/deal-schemas.ts.
 *
 * period_start/period_end are DELIBERATELY not accepted here — the client
 * only ever sends a semantic period selector (year, year+quarter,
 * year+month, or a reference date inside the target week); goal-actions.ts
 * turns that into canonical dates via period-calculator.ts. This schema's
 * job is shape/range validation only, never trusting exact period bounds
 * from the browser.
 */

import { z } from "zod";
import { isMatch } from "date-fns";
import { GOAL_PERIOD_TYPES, GOAL_STATUSES, type GoalPeriodType, type GoalStatus } from "../types";

export const GoalPeriodTypeEnum = z.enum(GOAL_PERIOD_TYPES as [GoalPeriodType, ...GoalPeriodType[]]);
export const GoalStatusEnum = z.enum(GOAL_STATUSES as [GoalStatus, ...GoalStatus[]]);

const YEAR_MIN = 2000;
const YEAR_MAX = 2100;
const yearSchema = z.number().int().min(YEAR_MIN).max(YEAR_MAX);
// TAREA 2B: la regex por sí sola aceptaba fechas que no existen (2026-02-31,
// 2025-02-29, 2026-13-10) porque el constructor Date de JS las normaliza en
// silencio (2026-02-31 -> 2026-03-03) en vez de rechazarlas. isMatch de
// date-fns hace un parseo estricto y solo da true si reformatear la fecha
// parseada reproduce exactamente el string original — así 2024-02-29 (año
// bisiesto real) se acepta y 2025-02-29 se rechaza.
const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida")
  .refine((value) => isMatch(value, "yyyy-MM-dd"), "Fecha inválida");

export const PeriodSelectorSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("annual"), year: yearSchema }),
  z.object({ type: z.literal("quarterly"), year: yearSchema, quarter: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]) }),
  z.object({ type: z.literal("monthly"), year: yearSchema, month: z.number().int().min(1).max(12) }),
  z.object({ type: z.literal("weekly"), referenceDate: isoDateSchema }),
]);

export type PeriodSelectorInput = z.infer<typeof PeriodSelectorSchema>;

const progressSchema = z
  .number()
  .int("El progreso debe ser un número entero")
  .min(0, "El progreso no puede ser menor de 0")
  .max(100, "El progreso no puede ser mayor de 100");

export const GoalCreateSchema = z.object({
  title: z.string().trim().min(1, "El título es obligatorio"),
  description: z.string().trim().optional().or(z.literal("")),
  period: PeriodSelectorSchema,
  owner_id: z.string().uuid("Responsable inválido").optional(),
  status: GoalStatusEnum.optional(),
  progress: progressSchema.optional(),
});

export type GoalCreateInput = z.infer<typeof GoalCreateSchema>;

export const GoalUpdateSchema = z.object({
  title: z.string().trim().min(1, "El título es obligatorio").optional(),
  description: z.string().trim().optional().or(z.literal("")),
  period: PeriodSelectorSchema.optional(),
  owner_id: z.string().uuid("Responsable inválido").nullable().optional(),
  status: GoalStatusEnum.optional(),
  progress: progressSchema.optional(),
});

export type GoalUpdateInput = z.infer<typeof GoalUpdateSchema>;

export const GoalIdSchema = z.string().uuid("Identificador de objetivo inválido");
