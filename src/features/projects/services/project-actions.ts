"use server";

/**
 * project-actions.ts — Server actions for project CRUD, kanban status moves,
 * and within-column reordering. Mirrors pipeline's deal-actions.ts pattern.
 */

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import type {
  ProjectProgressRow,
  ProjectStatus,
  ProjectWithContact,
} from "@/features/projects/types";

const COVER_MAX_BYTES = 5 * 1024 * 1024;
const COVER_MIME_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

export type ActionResult<T> =
  | { ok: true; data: T; error?: never }
  | { ok: false; data?: never; error: string };

const ProjectStatusEnum = z.enum([
  "pendiente",
  "en_preparacion",
  "en_proceso",
  "en_revision",
  "finalizado",
]);

const ProjectInputSchema = z.object({
  name: z.string().min(1, "El nombre es requerido"),
  contact_id: z.string().uuid().nullable().optional(),
  responsible_id: z.string().uuid().nullable().optional(),
  due_date: z.string().optional().or(z.literal("")),
  priority: z.enum(["baja", "media", "alta"]).optional(),
  description: z.string().optional().or(z.literal("")),
  notes: z.string().optional().or(z.literal("")),
});

export type CreateProjectInput = z.infer<typeof ProjectInputSchema>;
export type UpdateProjectInput = Partial<CreateProjectInput> & {
  status?: ProjectStatus;
};

const PROJECT_SELECT = "*, contact:contacts(id,name,phone)";

// ──────────────────────────────────────────────────────────────────────────────
// createProject
// ──────────────────────────────────────────────────────────────────────────────
export async function createProject(
  workspaceId: string,
  data: CreateProjectInput,
): Promise<ActionResult<{ id: string }>> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { ok: false, error: "No autorizado" };
  }

  const parsed = ProjectInputSchema.safeParse(data);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Datos inválidos",
    };
  }

  const { count } = await supabase
    .from("projects")
    .select("id", { count: "exact", head: true })
    .eq("workspace_id", workspaceId)
    .eq("status", "pendiente");

  const { data: inserted, error: insertError } = await supabase
    .from("projects")
    .insert({
      workspace_id: workspaceId,
      name: parsed.data.name,
      contact_id: parsed.data.contact_id || null,
      responsible_id: parsed.data.responsible_id || null,
      due_date: parsed.data.due_date || null,
      priority: parsed.data.priority ?? "media",
      description: parsed.data.description || null,
      notes: parsed.data.notes || null,
      status: "pendiente",
      position: count ?? 0,
    })
    .select("id")
    .single();

  if (insertError || !inserted) {
    console.error("[createProject] Supabase error:", insertError?.message);
    return { ok: false, error: "Error al crear el proyecto" };
  }

  return { ok: true, data: { id: inserted.id as string } };
}

// ──────────────────────────────────────────────────────────────────────────────
// updateProject
// ──────────────────────────────────────────────────────────────────────────────
export async function updateProject(
  projectId: string,
  data: UpdateProjectInput,
): Promise<ActionResult<{ id: string }>> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { ok: false, error: "No autorizado" };
  }

  const parsed = ProjectInputSchema.partial().safeParse(data);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Datos inválidos",
    };
  }

  const patch: Record<string, unknown> = {
    ...parsed.data,
    due_date: parsed.data.due_date || null,
    updated_at: new Date().toISOString(),
  };

  if (data.status) {
    const parsedStatus = ProjectStatusEnum.safeParse(data.status);
    if (!parsedStatus.success) {
      return { ok: false, error: "Estado inválido" };
    }
    patch.status = parsedStatus.data;
  }

  const { data: updated, error: updateError } = await supabase
    .from("projects")
    .update(patch)
    .eq("id", projectId)
    .select("id")
    .single();

  if (updateError || !updated) {
    console.error("[updateProject] Supabase error:", updateError?.message);
    return { ok: false, error: "Error al actualizar el proyecto" };
  }

  return { ok: true, data: { id: updated.id as string } };
}

// ──────────────────────────────────────────────────────────────────────────────
// moveProjectStatus — single-card kanban drag across (or within) a column
// ──────────────────────────────────────────────────────────────────────────────
export async function moveProjectStatus(
  projectId: string,
  newStatus: ProjectStatus,
  newPosition: number,
): Promise<ActionResult<{ id: string }>> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { ok: false, error: "No autorizado" };
  }

  const parsedStatus = ProjectStatusEnum.safeParse(newStatus);
  if (!parsedStatus.success) {
    return { ok: false, error: "Estado inválido" };
  }

  const { data: updated, error: updateError } = await supabase
    .from("projects")
    .update({
      status: parsedStatus.data,
      position: newPosition,
      updated_at: new Date().toISOString(),
    })
    .eq("id", projectId)
    .select("id")
    .single();

  if (updateError || !updated) {
    console.error("[moveProjectStatus] Supabase error:", updateError?.message);
    return { ok: false, error: "Error al mover el proyecto" };
  }

  return { ok: true, data: { id: updated.id as string } };
}

// ──────────────────────────────────────────────────────────────────────────────
// reorderProjects — persist a full within-column order after a drag settles
// ──────────────────────────────────────────────────────────────────────────────
const ReorderSchema = z.object({
  status: ProjectStatusEnum,
  ordered_ids: z.array(z.string().uuid()),
});

export async function reorderProjects(
  input: z.infer<typeof ReorderSchema>,
): Promise<ActionResult<null>> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { ok: false, error: "No autorizado" };
  }

  const parsed = ReorderSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Datos inválidos",
    };
  }

  const results = await Promise.all(
    parsed.data.ordered_ids.map((id, index) =>
      supabase
        .from("projects")
        .update({ position: index, status: parsed.data.status })
        .eq("id", id),
    ),
  );

  const failed = results.find((r) => r.error);
  if (failed?.error) {
    console.error("[reorderProjects] Supabase error:", failed.error.message);
    return { ok: false, error: "Error al reordenar los proyectos" };
  }

  return { ok: true, data: null };
}

// ──────────────────────────────────────────────────────────────────────────────
// deleteProject
// ──────────────────────────────────────────────────────────────────────────────
export async function deleteProject(
  projectId: string,
): Promise<ActionResult<null>> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { ok: false, error: "No autorizado" };
  }

  const { error } = await supabase.from("projects").delete().eq("id", projectId);

  if (error) {
    console.error("[deleteProject] Supabase error:", error.message);
    return { ok: false, error: "Error al eliminar el proyecto" };
  }

  return { ok: true, data: null };
}

// ──────────────────────────────────────────────────────────────────────────────
// getProjectsForBoard / getProject
// ──────────────────────────────────────────────────────────────────────────────
export async function getProjectsForBoard(
  workspaceId: string,
): Promise<ProjectWithContact[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return [];

  const { data, error } = await supabase
    .from("projects")
    .select(PROJECT_SELECT)
    .eq("workspace_id", workspaceId)
    .order("status", { ascending: true })
    .order("position", { ascending: true });

  if (error || !data) {
    console.error("[getProjectsForBoard] Supabase error:", error?.message);
    return [];
  }

  // supabase-js doesn't infer the shape of nested-relation selects (PROJECT_SELECT
  // joins contacts/companies) — the cast must be kept in sync by hand with
  // PROJECT_SELECT's actual columns/joins; a drift between them fails silently
  // at runtime (undefined fields), not at compile time.
  return data as unknown as ProjectWithContact[];
}

export async function getProject(
  projectId: string,
): Promise<ProjectWithContact | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data, error } = await supabase
    .from("projects")
    .select(PROJECT_SELECT)
    .eq("id", projectId)
    .single();

  if (error || !data) {
    console.error("[getProject] error:", error?.message);
    return null;
  }

  // Same PROJECT_SELECT/type-sync caveat as getProjectsForBoard above.
  return data as unknown as ProjectWithContact;
}

// ──────────────────────────────────────────────────────────────────────────────
// listWorkspaceMembers — for the responsable picker
// ──────────────────────────────────────────────────────────────────────────────
export interface WorkspaceMember {
  user_id: string;
  full_name: string;
}

export async function listWorkspaceMembers(
  workspaceId: string,
): Promise<WorkspaceMember[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return [];

  const { data, error } = await supabase
    .from("memberships")
    .select("user_id, users(full_name)")
    .eq("workspace_id", workspaceId)
    .eq("is_active", true);

  if (error || !data) {
    console.error("[listWorkspaceMembers] Supabase error:", error?.message);
    return [];
  }

  // Same nested-select type-sync caveat: must match the "user_id, users(full_name)" select above.
  return (
    data as unknown as {
      user_id: string;
      users: { full_name: string | null } | null;
    }[]
  ).map((row) => ({
    user_id: row.user_id,
    full_name: row.users?.full_name ?? "Sin nombre",
  }));
}

// ──────────────────────────────────────────────────────────────────────────────
// toggleProjectActive — Fase 2: activo/inactivo, independiente del status de
// kanban (un proyecto "finalizado" puede seguir activo; uno "en_proceso"
// puede archivarse si se pausó).
// ──────────────────────────────────────────────────────────────────────────────
export async function toggleProjectActive(
  projectId: string,
  isActive: boolean,
): Promise<ActionResult<{ id: string }>> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { ok: false, error: "No autorizado" };
  }

  const { data: updated, error: updateError } = await supabase
    .from("projects")
    .update({ is_active: isActive, updated_at: new Date().toISOString() })
    .eq("id", projectId)
    .select("id")
    .single();

  if (updateError || !updated) {
    console.error("[toggleProjectActive] Supabase error:", updateError?.message);
    return { ok: false, error: "Error al cambiar el estado del proyecto" };
  }

  return { ok: true, data: { id: updated.id as string } };
}

// ──────────────────────────────────────────────────────────────────────────────
// uploadProjectCover / removeProjectCover — bucket público `project-covers`,
// path {workspaceId}/{projectId}/{timestamp}-{safeName}.{ext}. Sube con la
// sesión del usuario (no service role): la política RLS del bucket exige
// admin/manager/agent en ese workspace, así que un `viewer` o un usuario de
// otro workspace ya queda bloqueado por Postgres, no solo por este código.
// ──────────────────────────────────────────────────────────────────────────────
export async function uploadProjectCover(
  workspaceId: string,
  projectId: string,
  formData: FormData,
): Promise<ActionResult<{ path: string }>> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { ok: false, error: "No autorizado" };
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return { ok: false, error: "Archivo inválido" };
  }

  const ext = COVER_MIME_EXT[file.type];
  if (!ext) {
    return { ok: false, error: "Formato de imagen no soportado" };
  }
  if (file.size > COVER_MAX_BYTES) {
    return { ok: false, error: "La imagen supera el límite de 5 MB" };
  }

  const { data: current } = await supabase
    .from("projects")
    .select("cover_image_path")
    .eq("id", projectId)
    .maybeSingle();

  const path = `${workspaceId}/${projectId}/${Date.now()}.${ext}`;
  const buffer = new Uint8Array(await file.arrayBuffer());

  const { error: uploadError } = await supabase.storage
    .from("project-covers")
    .upload(path, buffer, { contentType: file.type, upsert: false });

  if (uploadError) {
    console.error("[uploadProjectCover] Storage error:", uploadError.message);
    return { ok: false, error: "Error al subir la imagen" };
  }

  const { error: updateError } = await supabase
    .from("projects")
    .update({ cover_image_path: path, updated_at: new Date().toISOString() })
    .eq("id", projectId);

  if (updateError) {
    console.error("[uploadProjectCover] Supabase error:", updateError.message);
    await supabase.storage.from("project-covers").remove([path]);
    return { ok: false, error: "Error al guardar la imagen del proyecto" };
  }

  const previousPath = (current as { cover_image_path: string | null } | null)
    ?.cover_image_path;
  if (previousPath && previousPath !== path) {
    await supabase.storage.from("project-covers").remove([previousPath]);
  }

  return { ok: true, data: { path } };
}

export async function removeProjectCover(
  projectId: string,
): Promise<ActionResult<null>> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { ok: false, error: "No autorizado" };
  }

  const { data: current } = await supabase
    .from("projects")
    .select("cover_image_path")
    .eq("id", projectId)
    .maybeSingle();

  const { error: updateError } = await supabase
    .from("projects")
    .update({ cover_image_path: null, updated_at: new Date().toISOString() })
    .eq("id", projectId);

  if (updateError) {
    console.error("[removeProjectCover] Supabase error:", updateError.message);
    return { ok: false, error: "Error al quitar la imagen" };
  }

  const previousPath = (current as { cover_image_path: string | null } | null)
    ?.cover_image_path;
  if (previousPath) {
    await supabase.storage.from("project-covers").remove([previousPath]);
  }

  return { ok: true, data: null };
}

// ──────────────────────────────────────────────────────────────────────────────
// getProjectsProgress — lee la vista `project_progress` (fórmula determinista
// documentada en la migración 20260806000003_project_progress_view.sql) y la
// entrega como mapa por project_id para que las tarjetas la consuman O(1).
// ──────────────────────────────────────────────────────────────────────────────
export async function getProjectsProgress(
  workspaceId: string,
): Promise<Record<string, ProjectProgressRow>> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return {};

  const { data, error } = await supabase
    .from("project_progress")
    .select("*")
    .eq("workspace_id", workspaceId);

  if (error || !data) {
    console.error("[getProjectsProgress] Supabase error:", error?.message);
    return {};
  }

  const rows = data as unknown as ProjectProgressRow[];
  return Object.fromEntries(rows.map((row) => [row.project_id, row]));
}

export async function getProjectProgress(
  projectId: string,
): Promise<ProjectProgressRow | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data, error } = await supabase
    .from("project_progress")
    .select("*")
    .eq("project_id", projectId)
    .maybeSingle();

  if (error || !data) return null;

  return data as unknown as ProjectProgressRow;
}
