"use server";

/**
 * kpi-actions.ts — mutating Server Actions for agency_client_relationships /
 * agency_sales_meetings. Same conventions as
 * features/agency-goals/services/goal-actions.ts: requirePlatformStaff()
 * first, request-scoped createClient() (RLS-respecting, NEVER service_role).
 *
 * created_by is never read from input (the schemas don't even declare that
 * field) — it is set to the authenticated user's id here for clarity, and
 * enforced/made immutable at the database layer regardless
 * (enforce_agency_client_relationships_created_by() /
 * enforce_agency_sales_meetings_created_by(), 20260818120000_agency_kpis.sql).
 */

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requirePlatformStaff } from "@/lib/auth/platform-access";
import {
  RelationshipCreateSchema,
  RelationshipUpdateSchema,
  RelationshipIdSchema,
  MeetingCreateSchema,
  MeetingUpdateSchema,
  MeetingIdSchema,
  type RelationshipCreateInput,
  type RelationshipUpdateInput,
  type MeetingCreateInput,
  type MeetingUpdateInput,
} from "./kpi-schemas";
import type { ActionResult } from "./kpi-queries";

function revalidateKpiPages() {
  revalidatePath("/direccion");
  revalidatePath("/direccion/kpi");
}

// ──────────────────────────────────────────────────────────────────────────
// agency_client_relationships
// ──────────────────────────────────────────────────────────────────────────

export async function createClientRelationship(input: RelationshipCreateInput): Promise<ActionResult<{ id: string }>> {
  const auth = await requirePlatformStaff();
  if (!auth.ok) return { ok: false, error: "No autorizado" };

  const parsed = RelationshipCreateSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }

  const supabase = await createClient();
  const { data: inserted, error } = await supabase
    .from("agency_client_relationships")
    .insert({
      workspace_id: parsed.data.workspace_id,
      service_started_on: parsed.data.service_started_on,
      service_ended_on: parsed.data.service_ended_on ?? null,
      monthly_fee: parsed.data.monthly_fee ?? null,
      created_by: auth.userId,
    })
    .select("id")
    .single();

  if (error || !inserted) {
    console.error("[createClientRelationship] Supabase error:", error?.message);
    if (error?.code === "23505") {
      return { ok: false, error: "Esa empresa ya está registrada como cliente" };
    }
    return { ok: false, error: "Error al registrar el cliente" };
  }

  revalidateKpiPages();
  return { ok: true, data: { id: inserted.id as string } };
}

export async function updateClientRelationship(
  relationshipId: string,
  input: RelationshipUpdateInput,
): Promise<ActionResult<{ id: string }>> {
  const auth = await requirePlatformStaff();
  if (!auth.ok) return { ok: false, error: "No autorizado" };

  const parsedId = RelationshipIdSchema.safeParse(relationshipId);
  if (!parsedId.success) return { ok: false, error: "Identificador de cliente inválido" };

  const parsed = RelationshipUpdateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };

  if (Object.keys(parsed.data).length === 0) {
    return { ok: false, error: "No se proporcionaron campos a actualizar" };
  }

  const patch: Record<string, unknown> = {};
  if (parsed.data.service_started_on !== undefined) patch.service_started_on = parsed.data.service_started_on;
  if (parsed.data.service_ended_on !== undefined) patch.service_ended_on = parsed.data.service_ended_on;
  if (parsed.data.monthly_fee !== undefined) patch.monthly_fee = parsed.data.monthly_fee;

  const supabase = await createClient();
  // .eq("id", relationshipId) limita la escritura a UNA fila por su clave
  // primaria — nunca una actualización masiva sin filtrar por id.
  const { data: updated, error } = await supabase
    .from("agency_client_relationships")
    .update(patch)
    .eq("id", parsedId.data)
    .select("id")
    .maybeSingle();

  if (error) {
    console.error("[updateClientRelationship] Supabase error:", error.message);
    return { ok: false, error: "Error al actualizar el cliente" };
  }
  if (!updated) return { ok: false, error: "Cliente no encontrado" };

  revalidateKpiPages();
  return { ok: true, data: { id: updated.id as string } };
}

export async function deleteClientRelationship(relationshipId: string): Promise<ActionResult<null>> {
  const auth = await requirePlatformStaff();
  if (!auth.ok) return { ok: false, error: "No autorizado" };

  const parsedId = RelationshipIdSchema.safeParse(relationshipId);
  if (!parsedId.success) return { ok: false, error: "Identificador de cliente inválido" };

  const supabase = await createClient();
  const { error, count } = await supabase
    .from("agency_client_relationships")
    .delete({ count: "exact" })
    .eq("id", parsedId.data);

  if (error) {
    console.error("[deleteClientRelationship] Supabase error:", error.message);
    return { ok: false, error: "Error al eliminar el cliente" };
  }
  if (!count) return { ok: false, error: "Cliente no encontrado" };

  revalidateKpiPages();
  return { ok: true, data: null };
}

// ──────────────────────────────────────────────────────────────────────────
// agency_sales_meetings
// ──────────────────────────────────────────────────────────────────────────

function meetingPatch(parsed: MeetingCreateInput | MeetingUpdateInput) {
  return {
    lead_name: parsed.lead_name,
    scheduled_at: parsed.scheduled_at,
    status: parsed.status,
    outcome: parsed.outcome ?? null,
    notes: parsed.notes || null,
  };
}

export async function createSalesMeeting(input: MeetingCreateInput): Promise<ActionResult<{ id: string }>> {
  const auth = await requirePlatformStaff();
  if (!auth.ok) return { ok: false, error: "No autorizado" };

  const parsed = MeetingCreateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };

  const supabase = await createClient();
  const { data: inserted, error } = await supabase
    .from("agency_sales_meetings")
    .insert({ ...meetingPatch(parsed.data), created_by: auth.userId })
    .select("id")
    .single();

  if (error || !inserted) {
    console.error("[createSalesMeeting] Supabase error:", error?.message);
    return { ok: false, error: "Error al crear la reunión" };
  }

  revalidateKpiPages();
  return { ok: true, data: { id: inserted.id as string } };
}

export async function updateSalesMeeting(meetingId: string, input: MeetingUpdateInput): Promise<ActionResult<{ id: string }>> {
  const auth = await requirePlatformStaff();
  if (!auth.ok) return { ok: false, error: "No autorizado" };

  const parsedId = MeetingIdSchema.safeParse(meetingId);
  if (!parsedId.success) return { ok: false, error: "Identificador de reunión inválido" };

  const parsed = MeetingUpdateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };

  const supabase = await createClient();
  const { data: updated, error } = await supabase
    .from("agency_sales_meetings")
    .update(meetingPatch(parsed.data))
    .eq("id", parsedId.data)
    .select("id")
    .maybeSingle();

  if (error) {
    console.error("[updateSalesMeeting] Supabase error:", error.message);
    return { ok: false, error: "Error al actualizar la reunión" };
  }
  if (!updated) return { ok: false, error: "Reunión no encontrada" };

  revalidateKpiPages();
  return { ok: true, data: { id: updated.id as string } };
}

export async function deleteSalesMeeting(meetingId: string): Promise<ActionResult<null>> {
  const auth = await requirePlatformStaff();
  if (!auth.ok) return { ok: false, error: "No autorizado" };

  const parsedId = MeetingIdSchema.safeParse(meetingId);
  if (!parsedId.success) return { ok: false, error: "Identificador de reunión inválido" };

  const supabase = await createClient();
  const { error, count } = await supabase.from("agency_sales_meetings").delete({ count: "exact" }).eq("id", parsedId.data);

  if (error) {
    console.error("[deleteSalesMeeting] Supabase error:", error.message);
    return { ok: false, error: "Error al eliminar la reunión" };
  }
  if (!count) return { ok: false, error: "Reunión no encontrada" };

  revalidateKpiPages();
  return { ok: true, data: null };
}
