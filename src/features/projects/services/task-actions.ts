"use server";

/**
 * task-actions.ts — Server actions for the Proyectos "Tareas" tab: follow-up
 * task CRUD, completion, and reassignment. Operates on the same shared
 * `tasks` table pipeline/clients used to (a task links to a deal, a contact,
 * and/or now a project).
 */

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import type { TaskRow, TaskStatus } from "@/features/projects/types";
import {
  BatchTaskRowSchema,
  CreateTaskSchema,
  UpdateTaskSchema,
  type BatchTaskRow,
  type CreateTaskInput,
  type UpdateTaskInput,
} from "./task-schemas";

export type ActionResult<T> =
  | { ok: true; data: T; error?: never }
  | { ok: false; data?: never; error: string };

export interface TaskFilters {
  status?: TaskStatus;
  assignedTo?: string;
  projectId?: string;
  overdueOnly?: boolean;
}

// ──────────────────────────────────────────────────────────────────────────────
// createTask — Fase 2: ya no exige project_id. workspaceId llega explícito
// del caller (igual que createProject), no se deriva del proyecto — así una
// tarea puede crearse suelta, sin ningún proyecto.
// ──────────────────────────────────────────────────────────────────────────────
export async function createTask(
  workspaceId: string,
  data: CreateTaskInput,
): Promise<ActionResult<{ id: string }>> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { ok: false, error: "No autorizado" };
  }

  const parsed = CreateTaskSchema.safeParse(data);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Datos inválidos",
    };
  }

  if (parsed.data.project_id) {
    const { data: project, error: projectError } = await supabase
      .from("projects")
      .select("workspace_id")
      .eq("id", parsed.data.project_id)
      .single();

    if (projectError || !project || (project as { workspace_id: string }).workspace_id !== workspaceId) {
      return { ok: false, error: "Proyecto no encontrado" };
    }
  }

  const { data: inserted, error: insertError } = await supabase
    .from("tasks")
    .insert({
      ...parsed.data,
      project_id: parsed.data.project_id ?? null,
      workspace_id: workspaceId,
      created_by: user.id,
    })
    .select("id")
    .single();

  if (insertError || !inserted) {
    console.error("[createTask] Supabase error:", insertError?.message);
    return { ok: false, error: "Error al crear la tarea" };
  }

  return { ok: true, data: { id: inserted.id as string } };
}

// ──────────────────────────────────────────────────────────────────────────────
// createTasksBatch — Fase 2: creación en lote. Cada fila se valida por
// separado (BatchTaskRowSchema) para poder reportar fallos parciales de
// validación con su índice; las filas válidas se insertan en una sola
// sentencia. Un fallo a nivel de base de datos (p.ej. FK inexistente que
// pasó la validación de forma) afecta al lote completo — Postgres no
// permite commitear un INSERT multi-fila a medias — así que ese caso se
// reporta como un único error de lote, no fila por fila.
// ──────────────────────────────────────────────────────────────────────────────
export interface BatchTaskResult {
  created: number;
  failed: { index: number; error: string }[];
}

export async function createTasksBatch(
  workspaceId: string,
  rows: BatchTaskRow[],
): Promise<ActionResult<BatchTaskResult>> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { ok: false, error: "No autorizado" };
  }

  if (rows.length === 0) {
    return { ok: false, error: "No hay filas para crear" };
  }
  if (rows.length > 200) {
    return { ok: false, error: "Máximo 200 tareas por lote" };
  }

  const valid: { index: number; row: BatchTaskRow }[] = [];
  const failed: { index: number; error: string }[] = [];

  rows.forEach((row, index) => {
    const parsed = BatchTaskRowSchema.safeParse(row);
    if (!parsed.success) {
      failed.push({
        index,
        error: parsed.error.issues[0]?.message ?? "Datos inválidos",
      });
      return;
    }
    valid.push({ index, row: parsed.data });
  });

  if (valid.length === 0) {
    return { ok: true, data: { created: 0, failed } };
  }

  const { data: inserted, error: insertError } = await supabase
    .from("tasks")
    .insert(
      valid.map(({ row }) => ({
        title: row.title,
        project_id: row.project_id ?? null,
        assigned_to: row.assigned_to ?? null,
        task_type: row.task_type ?? "follow_up",
        due_at: row.due_at ?? null,
        workspace_id: workspaceId,
        created_by: user.id,
      })),
    )
    .select("id");

  if (insertError || !inserted) {
    console.error("[createTasksBatch] Supabase error:", insertError?.message);
    return {
      ok: true,
      data: {
        created: 0,
        failed: [
          ...failed,
          ...valid.map(({ index }) => ({ index, error: "Error al guardar en el lote" })),
        ],
      },
    };
  }

  return { ok: true, data: { created: inserted.length, failed } };
}

// ──────────────────────────────────────────────────────────────────────────────
// updateTask
// ──────────────────────────────────────────────────────────────────────────────
export async function updateTask(
  taskId: string,
  data: UpdateTaskInput,
): Promise<ActionResult<{ id: string }>> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { ok: false, error: "No autorizado" };
  }

  const parsed = UpdateTaskSchema.safeParse(data);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Datos inválidos",
    };
  }

  if (Object.keys(parsed.data).length === 0) {
    return { ok: false, error: "No se proporcionaron campos a actualizar" };
  }

  const patch: Record<string, unknown> = {
    ...parsed.data,
    updated_at: new Date().toISOString(),
  };

  if (parsed.data.status === "done") {
    patch.completed_at = new Date().toISOString();
  } else if (parsed.data.status) {
    patch.completed_at = null;
  }

  const { data: updated, error: updateError } = await supabase
    .from("tasks")
    .update(patch)
    .eq("id", taskId)
    .select("id")
    .single();

  if (updateError || !updated) {
    console.error("[updateTask] Supabase error:", updateError?.message);
    return { ok: false, error: "Error al actualizar la tarea" };
  }

  return { ok: true, data: { id: updated.id as string } };
}

// ──────────────────────────────────────────────────────────────────────────────
// completeTask
// ──────────────────────────────────────────────────────────────────────────────
export async function completeTask(
  taskId: string,
): Promise<ActionResult<{ id: string }>> {
  return updateTask(taskId, { status: "done" });
}

// ──────────────────────────────────────────────────────────────────────────────
// reassignTask
// ──────────────────────────────────────────────────────────────────────────────
export async function reassignTask(
  taskId: string,
  userId: string,
): Promise<ActionResult<{ id: string }>> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { ok: false, error: "No autorizado" };
  }

  const parsedUserId = z.string().uuid().safeParse(userId);
  if (!parsedUserId.success) {
    return { ok: false, error: "Usuario inválido" };
  }

  const { data: updated, error } = await supabase
    .from("tasks")
    .update({
      assigned_to: parsedUserId.data,
      updated_at: new Date().toISOString(),
    })
    .eq("id", taskId)
    .select("id")
    .single();

  if (error || !updated) {
    console.error("[reassignTask] Supabase error:", error?.message);
    return { ok: false, error: "Error al reasignar la tarea" };
  }

  return { ok: true, data: { id: updated.id as string } };
}

// ──────────────────────────────────────────────────────────────────────────────
// deleteTask
// ──────────────────────────────────────────────────────────────────────────────
export async function deleteTask(taskId: string): Promise<ActionResult<null>> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { ok: false, error: "No autorizado" };
  }

  const { error } = await supabase.from("tasks").delete().eq("id", taskId);

  if (error) {
    console.error("[deleteTask] Supabase error:", error.message);
    return { ok: false, error: "Error al eliminar la tarea" };
  }

  return { ok: true, data: null };
}

// ──────────────────────────────────────────────────────────────────────────────
// listTasks — workspace-wide (flat Tareas tab) or scoped to one project
// ──────────────────────────────────────────────────────────────────────────────
const TASK_SELECT = "*, project:projects(id,name)";

export async function listTasks(
  workspaceId: string,
  filters: TaskFilters = {},
): Promise<(TaskRow & { project: { id: string; name: string } | null })[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return [];

  let query = supabase
    .from("tasks")
    .select(TASK_SELECT)
    .eq("workspace_id", workspaceId)
    .order("due_at", { ascending: true, nullsFirst: false });

  if (filters.status) query = query.eq("status", filters.status);
  if (filters.assignedTo) query = query.eq("assigned_to", filters.assignedTo);
  if (filters.projectId) query = query.eq("project_id", filters.projectId);
  if (filters.overdueOnly) {
    query = query
      .in("status", ["pending", "in_progress"])
      .lt("due_at", new Date().toISOString());
  }

  const { data, error } = await query;

  if (error || !data) {
    console.error("[listTasks] Supabase error:", error?.message);
    return [];
  }

  // Same nested-select type-sync caveat as project-actions.ts: keep this
  // cast aligned with TASK_SELECT by hand.
  return data as unknown as (TaskRow & { project: { id: string; name: string } | null })[];
}
