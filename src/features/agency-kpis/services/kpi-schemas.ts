/**
 * kpi-schemas.ts — Zod validation for agency_client_relationships and
 * agency_sales_meetings, kept in a plain (non "use server") module so it can
 * be unit-tested directly. Mirrors features/agency-goals/services/
 * goal-schemas.ts.
 */

import { z } from "zod";
import { isMatch } from "date-fns";
import { MEETING_STATUSES, MEETING_OUTCOMES, type MeetingStatus, type MeetingOutcome } from "../types";

export const MeetingStatusEnum = z.enum(MEETING_STATUSES as [MeetingStatus, ...MeetingStatus[]]);
export const MeetingOutcomeEnum = z.enum(MEETING_OUTCOMES as [MeetingOutcome, ...MeetingOutcome[]]);

// Mismo parseo estricto que goal-schemas.ts (TAREA 2B): la regex sola
// aceptaba fechas de calendario imposibles porque el constructor Date de JS
// las normaliza en silencio. isMatch de date-fns hace ida y vuelta real.
const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida")
  .refine((value) => isMatch(value, "yyyy-MM-dd"), "Fecha inválida");

// ──────────────────────────────────────────────────────────────────────────
// agency_client_relationships
// ──────────────────────────────────────────────────────────────────────────

const feeSchema = z.number().nonnegative("La cuota mensual no puede ser negativa").nullable().optional();

export const RelationshipCreateSchema = z
  .object({
    workspace_id: z.string().uuid("Empresa inválida"),
    service_started_on: isoDateSchema,
    service_ended_on: isoDateSchema.nullable().optional(),
    monthly_fee: feeSchema,
  })
  .superRefine((data, ctx) => {
    if (data.service_ended_on && data.service_ended_on < data.service_started_on) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "La fecha de finalización no puede ser anterior al inicio",
        path: ["service_ended_on"],
      });
    }
  });

export type RelationshipCreateInput = z.infer<typeof RelationshipCreateSchema>;

// workspace_id no es editable — identifica la relación (UNIQUE). Cambiar de
// empresa significa borrar y crear una nueva, no un PATCH.
export const RelationshipUpdateSchema = z
  .object({
    service_started_on: isoDateSchema.optional(),
    service_ended_on: isoDateSchema.nullable().optional(),
    monthly_fee: feeSchema,
  })
  .superRefine((data, ctx) => {
    if (data.service_started_on && data.service_ended_on && data.service_ended_on < data.service_started_on) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "La fecha de finalización no puede ser anterior al inicio",
        path: ["service_ended_on"],
      });
    }
  });

export type RelationshipUpdateInput = z.infer<typeof RelationshipUpdateSchema>;

export const RelationshipIdSchema = z.string().uuid("Identificador de relación inválido");

// ──────────────────────────────────────────────────────────────────────────
// agency_sales_meetings
// ──────────────────────────────────────────────────────────────────────────

function refineStatusOutcome(
  data: { status: MeetingStatus; outcome?: MeetingOutcome | null },
  ctx: z.RefinementCtx,
) {
  const outcome = data.outcome ?? null;
  if (data.status === "held") {
    if (outcome === null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Una reunión realizada necesita un resultado (ganada, perdida o pendiente)",
        path: ["outcome"],
      });
    }
  } else if (outcome !== null) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Solo una reunión realizada puede tener un resultado",
      path: ["outcome"],
    });
  }
}

const meetingBaseSchema = z.object({
  lead_name: z.string().trim().min(1, "El nombre del lead es obligatorio"),
  scheduled_at: z.string().datetime({ message: "Fecha y hora inválidas" }),
  status: MeetingStatusEnum,
  outcome: MeetingOutcomeEnum.nullable().optional(),
  notes: z.string().trim().optional().or(z.literal("")),
});

export const MeetingCreateSchema = meetingBaseSchema.superRefine(refineStatusOutcome);
export type MeetingCreateInput = z.infer<typeof MeetingCreateSchema>;

export const MeetingUpdateSchema = meetingBaseSchema.superRefine(refineStatusOutcome);
export type MeetingUpdateInput = z.infer<typeof MeetingUpdateSchema>;

export const MeetingIdSchema = z.string().uuid("Identificador de reunión inválido");
