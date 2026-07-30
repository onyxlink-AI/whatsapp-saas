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

const AgendaTaskInputSchema = z
  .object({
    title: z.string().min(1, "El título es requerido"),
    notes: z.string().optional().or(z.literal("")),
    scheduled_date: z.string().optional().or(z.literal("")),
    scheduled_week_start: z.string().optional().or(z.literal("")),
    assigned_to: z.string().uuid().nullable().optional(),
  })
  .refine((v) => Boolean(v.scheduled_date) || Boolean(v.scheduled_week_start), {
    message: "Elige un día o una semana",
  });

export type AgendaTaskInput = z.infer<typeof AgendaTaskInputSchema>;

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
// updateAgendaTask
// ──────────────────────────────────────────────────────────────────────────────
export async function updateAgendaTask(
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

  const patch: Record<string, unknown> = {
    ...data,
    updated_at: new Date().toISOString(),
  };
  if (data.scheduled_date !== undefined) patch.scheduled_date = data.scheduled_date || null;
  if (data.scheduled_week_start !== undefined) {
    patch.scheduled_week_start = data.scheduled_week_start || null;
  }

  const { data: updated, error: updateError } = await supabase
    .from("agenda_tasks")
    .update(patch)
    .eq("id", taskId)
    .select("id")
    .single();

  if (updateError || !updated) {
    console.error("[updateAgendaTask] Supabase error:", updateError?.message);
    return { ok: false, error: "Error al actualizar la tarea" };
  }

  return { ok: true, data: { id: updated.id as string } };
}

// ──────────────────────────────────────────────────────────────────────────────
// toggleAgendaTaskDone
// ──────────────────────────────────────────────────────────────────────────────
export async function toggleAgendaTaskDone(
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

  const { error } = await supabase
    .from("agenda_tasks")
    .update({
      done,
      completed_at: done ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", taskId);

  if (error) {
    console.error("[toggleAgendaTaskDone] Supabase error:", error.message);
    return { ok: false, error: "Error al actualizar la tarea" };
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
