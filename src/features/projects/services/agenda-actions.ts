"use server";

/**
 * agenda-actions.ts — Server actions for the "Agenda" day/week task planner.
 * `agenda_tasks` is deliberately separate from the pipeline `tasks` table
 * (which requires a deal_id or contact_id) — these are free-standing team
 * planning items.
 */

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import type { AgendaTaskRow } from "@/features/projects/types";

export type ActionResult<T> =
  | { ok: true; data: T; error?: never }
  | { ok: false; data?: never; error: string };

// Revisión correctiva: "día o semana, nunca ambos" es un XOR, no un "al
// menos uno" — Boolean(a) !== Boolean(b) solo es true cuando EXACTAMENTE
// uno de los dos está presente.
const AgendaTaskInputSchema = z
  .object({
    title: z.string().min(1, "El título es requerido"),
    notes: z.string().optional().or(z.literal("")),
    scheduled_date: z.string().optional().or(z.literal("")),
    scheduled_week_start: z.string().optional().or(z.literal("")),
    assigned_to: z.string().uuid().nullable().optional(),
  })
  .refine((v) => Boolean(v.scheduled_date) !== Boolean(v.scheduled_week_start), {
    message: "Elige exactamente un día o una semana, nunca los dos",
  });

export type AgendaTaskInput = z.infer<typeof AgendaTaskInputSchema>;

// Actualización parcial: no exige que venga un día/semana (se puede
// actualizar solo el título), pero si vienen los dos a la vez en la misma
// llamada, rechaza — nunca ambos simultáneamente.
const UpdateAgendaTaskSchema = z
  .object({
    title: z.string().min(1, "El título es requerido").optional(),
    notes: z.string().optional().or(z.literal("")),
    scheduled_date: z.string().optional().or(z.literal("")),
    scheduled_week_start: z.string().optional().or(z.literal("")),
    assigned_to: z.string().uuid().nullable().optional(),
  })
  .refine((v) => !(Boolean(v.scheduled_date) && Boolean(v.scheduled_week_start)), {
    message: "Elige un día o una semana, nunca los dos",
  });

// Revisión correctiva: assigned_to debe pertenecer a una membership ACTIVA
// del mismo workspace — nunca "existir" como usuario sin más. Un error de
// BD nunca se confunde con "no pertenece" (mensaje transitorio distinto).
async function assertResponsibleBelongsToWorkspace(
  supabase: Awaited<ReturnType<typeof createClient>>,
  workspaceId: string,
  userId: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from("memberships")
    .select("user_id")
    .eq("user_id", userId)
    .eq("workspace_id", workspaceId)
    .eq("is_active", true)
    .maybeSingle();

  if (error) {
    console.error("[agenda-actions] error comprobando membership del responsable:", error.message);
    return "No se pudo comprobar tu acceso en este momento. Inténtalo de nuevo en unos segundos.";
  }
  if (!data) {
    return "El responsable no pertenece a la empresa activa";
  }
  return null;
}

// ──────────────────────────────────────────────────────────────────────────────
// listAgendaTasksForDay / listAgendaTasksForWeek
// ──────────────────────────────────────────────────────────────────────────────
export async function listAgendaTasksForDay(
  workspaceId: string,
  date: string,
): Promise<AgendaTaskRow[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return [];

  const { data, error } = await supabase
    .from("agenda_tasks")
    .select("*")
    .eq("workspace_id", workspaceId)
    .eq("scheduled_date", date)
    .order("created_at", { ascending: true });

  if (error || !data) {
    console.error("[listAgendaTasksForDay] Supabase error:", error?.message);
    return [];
  }

  return data as AgendaTaskRow[];
}

export async function listAgendaTasksForWeek(
  workspaceId: string,
  weekStart: string,
): Promise<AgendaTaskRow[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return [];

  // A task assigned to a single day (scheduled_date set, scheduled_week_start
  // NULL) never matched `.eq("scheduled_week_start", weekStart)` — it simply
  // vanished from Semana even for the exact week containing its day. Also
  // catch any day-mode task whose date falls in this week, in addition to
  // week-mode tasks assigned directly to this week's Monday.
  const weekEnd = addDaysToIsoDate(weekStart, 6);

  const { data, error } = await supabase
    .from("agenda_tasks")
    .select("*")
    .eq("workspace_id", workspaceId)
    .or(
      `scheduled_week_start.eq.${weekStart},and(scheduled_date.gte.${weekStart},scheduled_date.lte.${weekEnd})`,
    )
    .order("created_at", { ascending: true });

  if (error || !data) {
    console.error("[listAgendaTasksForWeek] Supabase error:", error?.message);
    return [];
  }

  return data as AgendaTaskRow[];
}

// ──────────────────────────────────────────────────────────────────────────────
// searchAgendaTasks — Fase 4A: búsqueda por título, para el Asistente de
// Ayuda (search_agenda_items). No existía ninguna búsqueda por texto libre
// antes — listAgendaTasksForDay/Week solo filtran por rango de fechas.
// ──────────────────────────────────────────────────────────────────────────────
export async function searchAgendaTasks(
  workspaceId: string,
  query: string,
): Promise<AgendaTaskRow[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return [];

  const { data, error } = await supabase
    .from("agenda_tasks")
    .select("*")
    .eq("workspace_id", workspaceId)
    .ilike("title", `%${query}%`)
    .order("scheduled_date", { ascending: true, nullsFirst: false })
    .limit(10);

  if (error || !data) {
    console.error("[searchAgendaTasks] Supabase error:", error?.message);
    return [];
  }

  return data as AgendaTaskRow[];
}

function addDaysToIsoDate(isoDate: string, days: number): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  const utc = new Date(Date.UTC(year, month - 1, day + days));
  return utc.toISOString().slice(0, 10);
}

// ──────────────────────────────────────────────────────────────────────────────
// createAgendaTask
// ──────────────────────────────────────────────────────────────────────────────
export async function createAgendaTask(
  workspaceId: string,
  data: AgendaTaskInput,
): Promise<ActionResult<{ id: string }>> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { ok: false, error: "No autorizado" };
  }

  const parsed = AgendaTaskInputSchema.safeParse(data);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Datos inválidos",
    };
  }

  if (parsed.data.assigned_to) {
    const responsibleError = await assertResponsibleBelongsToWorkspace(supabase, workspaceId, parsed.data.assigned_to);
    if (responsibleError) return { ok: false, error: responsibleError };
  }

  const { data: inserted, error: insertError } = await supabase
    .from("agenda_tasks")
    .insert({
      workspace_id: workspaceId,
      title: parsed.data.title,
      notes: parsed.data.notes || null,
      scheduled_date: parsed.data.scheduled_date || null,
      scheduled_week_start: parsed.data.scheduled_week_start || null,
      assigned_to: parsed.data.assigned_to || null,
      created_by: user.id,
    })
    .select("id")
    .single();

  if (insertError || !inserted) {
    console.error("[createAgendaTask] Supabase error:", insertError?.message);
    return { ok: false, error: "Error al crear la tarea" };
  }

  return { ok: true, data: { id: inserted.id as string } };
}

// ──────────────────────────────────────────────────────────────────────────────
// updateAgendaTask — Fase 4A: workspaceId ahora es obligatorio y se filtra en
// la propia UPDATE (nunca solo confiar en RLS), con .select() + comprobación
// de una única fila afectada — 0 filas nunca se trata como éxito, se
// distingue de un error real de BD con "not_found_or_forbidden".
// ──────────────────────────────────────────────────────────────────────────────
export async function updateAgendaTask(
  workspaceId: string,
  taskId: string,
  data: Partial<AgendaTaskInput>,
): Promise<ActionResult<{ id: string }>> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { ok: false, error: "No autorizado" };
  }

  const parsed = UpdateAgendaTaskSchema.safeParse(data);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }

  if (parsed.data.assigned_to) {
    const responsibleError = await assertResponsibleBelongsToWorkspace(supabase, workspaceId, parsed.data.assigned_to);
    if (responsibleError) return { ok: false, error: responsibleError };
  }

  const patch: Record<string, unknown> = {
    ...parsed.data,
    updated_at: new Date().toISOString(),
  };
  // Día y semana son mutuamente excluyentes: al establecer uno, se limpia
  // el otro explícitamente — aunque el caller no lo mencione, para que una
  // tarea en modo semana no arrastre un scheduled_week_start obsoleto al
  // pasar a modo día (y viceversa). El refine de arriba ya garantiza que
  // esta misma llamada nunca trae los dos a la vez con valor.
  if (parsed.data.scheduled_date !== undefined) {
    patch.scheduled_date = parsed.data.scheduled_date || null;
    if (parsed.data.scheduled_date) patch.scheduled_week_start = null;
  }
  if (parsed.data.scheduled_week_start !== undefined) {
    patch.scheduled_week_start = parsed.data.scheduled_week_start || null;
    if (parsed.data.scheduled_week_start) patch.scheduled_date = null;
  }

  const { data: updated, error: updateError } = await supabase
    .from("agenda_tasks")
    .update(patch)
    .eq("id", taskId)
    .eq("workspace_id", workspaceId)
    .select("id")
    .maybeSingle();

  if (updateError) {
    console.error("[updateAgendaTask] Supabase error:", updateError.message);
    return { ok: false, error: "Error al actualizar la tarea" };
  }
  if (!updated) {
    return { ok: false, error: "not_found_or_forbidden" };
  }

  return { ok: true, data: { id: updated.id as string } };
}

// ──────────────────────────────────────────────────────────────────────────────
// toggleAgendaTaskDone — Fase 4A: mismo endurecimiento que updateAgendaTask.
// ──────────────────────────────────────────────────────────────────────────────
export async function toggleAgendaTaskDone(
  workspaceId: string,
  taskId: string,
  done: boolean,
): Promise<ActionResult<null>> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { ok: false, error: "No autorizado" };
  }

  const { data: updated, error } = await supabase
    .from("agenda_tasks")
    .update({
      done,
      completed_at: done ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", taskId)
    .eq("workspace_id", workspaceId)
    .select("id")
    .maybeSingle();

  if (error) {
    console.error("[toggleAgendaTaskDone] Supabase error:", error.message);
    return { ok: false, error: "Error al actualizar la tarea" };
  }
  if (!updated) {
    return { ok: false, error: "not_found_or_forbidden" };
  }

  return { ok: true, data: null };
}

// ──────────────────────────────────────────────────────────────────────────────
// deleteAgendaTask
// ──────────────────────────────────────────────────────────────────────────────
export async function deleteAgendaTask(
  taskId: string,
): Promise<ActionResult<null>> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { ok: false, error: "No autorizado" };
  }

  const { error } = await supabase.from("agenda_tasks").delete().eq("id", taskId);

  if (error) {
    console.error("[deleteAgendaTask] Supabase error:", error.message);
    return { ok: false, error: "Error al eliminar la tarea" };
  }

  return { ok: true, data: null };
}
