"use server";

/**
 * subtask-actions.ts — Server actions for subtasks (a simple checklist under
 * a task). Workspace is resolved from the parent task, mirroring how
 * task-actions.ts resolves workspace_id from the parent project.
 */

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import type { SubtaskRow } from "@/features/projects/types";

export type ActionResult<T> =
  | { ok: true; data: T; error?: never }
  | { ok: false; data?: never; error: string };

// ──────────────────────────────────────────────────────────────────────────────
// listSubtasks
// ──────────────────────────────────────────────────────────────────────────────
export async function listSubtasks(taskId: string): Promise<SubtaskRow[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return [];

  const { data, error } = await supabase
    .from("subtasks")
    .select("*")
    .eq("task_id", taskId)
    .order("position", { ascending: true });

  if (error || !data) {
    console.error("[listSubtasks] Supabase error:", error?.message);
    return [];
  }

  return data as SubtaskRow[];
}

// ──────────────────────────────────────────────────────────────────────────────
// createSubtask
// ──────────────────────────────────────────────────────────────────────────────
const CreateSubtaskSchema = z.object({
  task_id: z.string().uuid(),
  title: z.string().min(1, "El título es requerido"),
});

export async function createSubtask(
  input: z.infer<typeof CreateSubtaskSchema>,
): Promise<ActionResult<{ id: string }>> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { ok: false, error: "No autorizado" };
  }

  const parsed = CreateSubtaskSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Datos inválidos",
    };
  }

  const { data: task, error: taskError } = await supabase
    .from("tasks")
    .select("workspace_id")
    .eq("id", parsed.data.task_id)
    .single();

  if (taskError || !task) {
    return { ok: false, error: "Tarea no encontrada" };
  }

  const { count } = await supabase
    .from("subtasks")
    .select("id", { count: "exact", head: true })
    .eq("task_id", parsed.data.task_id);

  const { data: inserted, error: insertError } = await supabase
    .from("subtasks")
    .insert({
      task_id: parsed.data.task_id,
      workspace_id: (task as { workspace_id: string }).workspace_id,
      title: parsed.data.title,
      position: count ?? 0,
    })
    .select("id")
    .single();

  if (insertError || !inserted) {
    console.error("[createSubtask] Supabase error:", insertError?.message);
    return { ok: false, error: "Error al crear la subtarea" };
  }

  return { ok: true, data: { id: inserted.id as string } };
}

// ──────────────────────────────────────────────────────────────────────────────
// toggleSubtask
// ──────────────────────────────────────────────────────────────────────────────
export async function toggleSubtask(
  subtaskId: string,
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
    .from("subtasks")
    .update({ done, updated_at: new Date().toISOString() })
    .eq("id", subtaskId);

  if (error) {
    console.error("[toggleSubtask] Supabase error:", error.message);
    return { ok: false, error: "Error al actualizar la subtarea" };
  }

  return { ok: true, data: null };
}

// ──────────────────────────────────────────────────────────────────────────────
// deleteSubtask
// ──────────────────────────────────────────────────────────────────────────────
export async function deleteSubtask(
  subtaskId: string,
): Promise<ActionResult<null>> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { ok: false, error: "No autorizado" };
  }

  const { error } = await supabase.from("subtasks").delete().eq("id", subtaskId);

  if (error) {
    console.error("[deleteSubtask] Supabase error:", error.message);
    return { ok: false, error: "Error al eliminar la subtarea" };
  }

  return { ok: true, data: null };
}

// ──────────────────────────────────────────────────────────────────────────────
// updateSubtask — Fase 2: título, responsable y fecha opcionales.
// ──────────────────────────────────────────────────────────────────────────────
const UpdateSubtaskSchema = z.object({
  title: z.string().min(1).optional(),
  assigned_to: z.string().uuid().nullable().optional(),
  due_at: z.string().nullable().optional(),
});

export async function updateSubtask(
  subtaskId: string,
  input: z.infer<typeof UpdateSubtaskSchema>,
): Promise<ActionResult<null>> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { ok: false, error: "No autorizado" };
  }

  const parsed = UpdateSubtaskSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }

  const { error } = await supabase
    .from("subtasks")
    .update({ ...parsed.data, updated_at: new Date().toISOString() })
    .eq("id", subtaskId);

  if (error) {
    console.error("[updateSubtask] Supabase error:", error.message);
    return { ok: false, error: "Error al actualizar la subtarea" };
  }

  return { ok: true, data: null };
}

// ──────────────────────────────────────────────────────────────────────────────
// reorderSubtasks — persist a full order after a drag settles, same pattern
// as reorderProjects in project-actions.ts.
// ──────────────────────────────────────────────────────────────────────────────
const ReorderSubtasksSchema = z.object({
  task_id: z.string().uuid(),
  ordered_ids: z.array(z.string().uuid()),
});

export async function reorderSubtasks(
  input: z.infer<typeof ReorderSubtasksSchema>,
): Promise<ActionResult<null>> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { ok: false, error: "No autorizado" };
  }

  const parsed = ReorderSubtasksSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }

  const results = await Promise.all(
    parsed.data.ordered_ids.map((id, index) =>
      supabase.from("subtasks").update({ position: index }).eq("id", id).eq("task_id", parsed.data.task_id),
    ),
  );

  const failed = results.find((r) => r.error);
  if (failed?.error) {
    console.error("[reorderSubtasks] Supabase error:", failed.error.message);
    return { ok: false, error: "Error al reordenar las subtareas" };
  }

  return { ok: true, data: null };
}
