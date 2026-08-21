/**
 * schedule-schemas.ts — Zod validation for agency_schedule_blocks CRUD, kept
 * in a plain (non "use server") module so it can be unit-tested directly.
 * Mirrors the pattern in features/agency-goals/services/goal-schemas.ts.
 *
 * weekday/hour identify the cell (1=Monday..7=Sunday, hour 0-23); content is
 * always free text belonging to THIS table — it is never turned into a
 * public.tasks/public.agenda_tasks row anywhere in this feature.
 */

import { z } from "zod";
import { SCHEDULE_COLOR_KEYS, type ScheduleColorKey } from "../types";

export const ScheduleColorKeyEnum = z.enum(SCHEDULE_COLOR_KEYS as [ScheduleColorKey, ...ScheduleColorKey[]]);

export const CONTENT_MAX_LENGTH = 500;

const weekdaySchema = z
  .number()
  .int("El día debe ser un número entero")
  .min(1, "El día debe estar entre 1 (lunes) y 7 (domingo)")
  .max(7, "El día debe estar entre 1 (lunes) y 7 (domingo)");

const hourSchema = z
  .number()
  .int("La hora debe ser un número entero")
  .min(0, "La hora debe estar entre 0 y 23")
  .max(23, "La hora debe estar entre 0 y 23");

const contentSchema = z
  .string()
  .trim()
  .min(1, "El contenido es obligatorio")
  .max(CONTENT_MAX_LENGTH, `El contenido no puede superar los ${CONTENT_MAX_LENGTH} caracteres`);

const responsibleIdSchema = z.string().uuid("Responsable inválido").nullable().optional();

export const ScheduleBlockCreateSchema = z.object({
  weekday: weekdaySchema,
  hour: hourSchema,
  content: contentSchema,
  color_key: ScheduleColorKeyEnum,
  responsible_id: responsibleIdSchema,
});

export type ScheduleBlockCreateInput = z.infer<typeof ScheduleBlockCreateSchema>;

export const ScheduleBlockUpdateSchema = z.object({
  weekday: weekdaySchema.optional(),
  hour: hourSchema.optional(),
  content: contentSchema.optional(),
  color_key: ScheduleColorKeyEnum.optional(),
  responsible_id: responsibleIdSchema,
});

export type ScheduleBlockUpdateInput = z.infer<typeof ScheduleBlockUpdateSchema>;

export const ScheduleBlockIdSchema = z.string().uuid("Identificador de bloque inválido");
