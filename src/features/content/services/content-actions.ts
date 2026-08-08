"use server";

/**
 * content-actions.ts — Server actions for the Contenido module (Fase 3).
 * Mirrors project-actions.ts's shape (ActionResult<T>, kanban move/reorder).
 */

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import type { ContentItemRow, ContentStatus } from "@/features/content/types";

export type ActionResult<T> =
  | { ok: true; data: T; error?: never }
  | { ok: false; data?: never; error: string };

const ContentStatusEnum = z.enum(["idea", "in_production", "ready_to_publish", "published"]);
const OrientationEnum = z.enum(["vertical", "horizontal"]);

const ReferenceLinkSchema = z.object({ label: z.string(), url: z.string() });

const ContentInputSchema = z.object({
  title: z.string().min(1, "El título es requerido").optional(),
  status: ContentStatusEnum.optional(),
  main_idea: z.string().optional().or(z.literal("")),
  description: z.string().optional().or(z.literal("")),
  content_type: z.string().optional().or(z.literal("")),
  platform: z.string().optional().or(z.literal("")),
  orientation: OrientationEnum.nullable().optional(),
  project_id: z.string().uuid().nullable().optional(),
  responsible_id: z.string().uuid().nullable().optional(),
  script_hook: z.string().optional().or(z.literal("")),
  script_body: z.string().optional().or(z.literal("")),
  script_closing: z.string().optional().or(z.literal("")),
  script_cta: z.string().optional().or(z.literal("")),
  bullet_points: z.array(z.string()).optional(),
  reference_links: z.array(ReferenceLinkSchema).optional(),
  notes: z.string().optional().or(z.literal("")),
  lighting_notes: z.string().optional().or(z.literal("")),
  music_notes: z.string().optional().or(z.literal("")),
  duration_estimate: z.string().optional().or(z.literal("")),
  scheduled_date: z.string().nullable().optional(),
  published_at: z.string().nullable().optional(),
  metric_views: z.number().int().nonnegative().nullable().optional(),
  metric_reach: z.number().int().nonnegative().nullable().optional(),
  metric_likes: z.number().int().nonnegative().nullable().optional(),
  metric_comments: z.number().int().nonnegative().nullable().optional(),
  metric_shares: z.number().int().nonnegative().nullable().optional(),
  metric_saves: z.number().int().nonnegative().nullable().optional(),
  metric_clicks: z.number().int().nonnegative().nullable().optional(),
  metric_leads: z.number().int().nonnegative().nullable().optional(),
  metric_notes: z.string().optional().or(z.literal("")),
});

export type ContentInput = z.infer<typeof ContentInputSchema>;

const CONTENT_SELECT =
  "id, workspace_id, project_id, responsible_id, title, main_idea, description, content_type, platform, orientation, script_hook, script_body, script_closing, script_cta, bullet_points, reference_links, notes, lighting_notes, music_notes, duration_estimate, status, position, scheduled_date, published_at, metric_views, metric_reach, metric_likes, metric_comments, metric_shares, metric_saves, metric_clicks, metric_leads, metric_notes, created_by, created_at, updated_at";

async function validateWorkspaceRelations(
  supabase: Awaited<ReturnType<typeof createClient>>,
  workspaceId: string,
  input: ContentInput,
): Promise<string | null> {
  if (input.project_id) {
    const { data } = await supabase
      .from("projects")
      .select("id")
      .eq("id", input.project_id)
      .eq("workspace_id", workspaceId)
      .maybeSingle();
    if (!data) return "El proyecto no pertenece a la empresa activa";
  }

  if (input.responsible_id) {
    const { data } = await supabase
      .from("memberships")
      .select("id")
      .eq("user_id", input.responsible_id)
      .eq("workspace_id", workspaceId)
      .eq("is_active", true)
      .maybeSingle();
    if (!data) return "El responsable no pertenece a la empresa activa";
  }

  return null;
}

// ──────────────────────────────────────────────────────────────────────────────
// listContentItems
// ──────────────────────────────────────────────────────────────────────────────
export async function listContentItems(workspaceId: string): Promise<ContentItemRow[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return [];

  const { data, error } = await supabase
    .from("content_items")
    .select(CONTENT_SELECT)
    .eq("workspace_id", workspaceId)
    .order("status", { ascending: true })
    .order("position", { ascending: true });

  if (error || !data) {
    console.error("[listContentItems] Supabase error:", error?.message);
    return [];
  }

  return data as unknown as ContentItemRow[];
}

// ──────────────────────────────────────────────────────────────────────────────
// searchContentItems — Fase 4A: búsqueda por título/idea principal, para el
// Asistente de Ayuda (search_content).
// ──────────────────────────────────────────────────────────────────────────────
export async function searchContentItems(workspaceId: string, query: string): Promise<ContentItemRow[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return [];

  const { data, error } = await supabase
    .from("content_items")
    .select(CONTENT_SELECT)
    .eq("workspace_id", workspaceId)
    .or(`title.ilike.%${query}%,main_idea.ilike.%${query}%`)
    .order("updated_at", { ascending: false })
    .limit(10);

  if (error || !data) {
    console.error("[searchContentItems] Supabase error:", error?.message);
    return [];
  }

  return data as unknown as ContentItemRow[];
}

// ──────────────────────────────────────────────────────────────────────────────
// getContentItem
// ──────────────────────────────────────────────────────────────────────────────
export async function getContentItem(id: string): Promise<ContentItemRow | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data, error } = await supabase
    .from("content_items")
    .select(CONTENT_SELECT)
    .eq("id", id)
    .maybeSingle();

  if (error || !data) {
    console.error("[getContentItem] error:", error?.message);
    return null;
  }

  return data as unknown as ContentItemRow;
}

// ──────────────────────────────────────────────────────────────────────────────
// createContentItem — used both by "Idea rápida" and by full creation.
// ──────────────────────────────────────────────────────────────────────────────
export async function createContentItem(
  workspaceId: string,
  input: ContentInput,
): Promise<ActionResult<{ id: string }>> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { ok: false, error: "No autorizado" };
  }

  const parsed = ContentInputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }

  const relationError = await validateWorkspaceRelations(supabase, workspaceId, parsed.data);
  if (relationError) return { ok: false, error: relationError };

  const { count } = await supabase
    .from("content_items")
    .select("id", { count: "exact", head: true })
    .eq("workspace_id", workspaceId)
    .eq("status", "idea");

  const { data: inserted, error: insertError } = await supabase
    .from("content_items")
    .insert({
      workspace_id: workspaceId,
      title: parsed.data.title?.trim() || "Sin título",
      main_idea: parsed.data.main_idea || null,
      description: parsed.data.description || null,
      project_id: parsed.data.project_id ?? null,
      responsible_id: parsed.data.responsible_id ?? null,
      status: "idea",
      position: count ?? 0,
      created_by: user.id,
    })
    .select("id")
    .single();

  if (insertError || !inserted) {
    console.error("[createContentItem] Supabase error:", insertError?.message);
    return { ok: false, error: "Error al crear el contenido" };
  }

  return { ok: true, data: { id: inserted.id as string } };
}

// ──────────────────────────────────────────────────────────────────────────────
// updateContentItem — the full editor's save.
// ──────────────────────────────────────────────────────────────────────────────
export async function updateContentItem(
  workspaceId: string,
  id: string,
  input: ContentInput,
): Promise<ActionResult<null>> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { ok: false, error: "No autorizado" };
  }

  const parsed = ContentInputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }

  const relationError = await validateWorkspaceRelations(supabase, workspaceId, parsed.data);
  if (relationError) return { ok: false, error: relationError };

  const patch: Record<string, unknown> = { ...parsed.data, updated_at: new Date().toISOString() };
  if (patch.title === "") delete patch.title;
  for (const key of ["main_idea", "description", "content_type", "platform", "script_hook", "script_body", "script_closing", "script_cta", "notes", "lighting_notes", "music_notes", "duration_estimate", "metric_notes"]) {
    if (patch[key] === "") patch[key] = null;
  }
  if (parsed.data.status === "published") {
    patch.published_at = new Date().toISOString();
  }

  const { data, error } = await supabase
    .from("content_items")
    .update(patch)
    .eq("id", id)
    .eq("workspace_id", workspaceId)
    .select("id")
    .maybeSingle();

  if (error || !data) {
    console.error("[updateContentItem] Supabase error:", error?.message ?? "Contenido no encontrado");
    return { ok: false, error: "Error al guardar el contenido" };
  }

  return { ok: true, data: null };
}

// ──────────────────────────────────────────────────────────────────────────────
// moveContentStatus — single-card kanban drag across (or within) a column.
// ──────────────────────────────────────────────────────────────────────────────
export async function moveContentStatus(
  workspaceId: string,
  id: string,
  newStatus: ContentStatus,
  newPosition: number,
): Promise<ActionResult<null>> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { ok: false, error: "No autorizado" };
  }

  const parsedStatus = ContentStatusEnum.safeParse(newStatus);
  if (!parsedStatus.success) {
    return { ok: false, error: "Estado inválido" };
  }

  const patch: Record<string, unknown> = {
    status: parsedStatus.data,
    position: newPosition,
    updated_at: new Date().toISOString(),
  };
  if (parsedStatus.data === "published") {
    patch.published_at = new Date().toISOString();
  }

  const { data, error } = await supabase
    .from("content_items")
    .update(patch)
    .eq("id", id)
    .eq("workspace_id", workspaceId)
    .select("id")
    .maybeSingle();

  if (error || !data) {
    console.error("[moveContentStatus] Supabase error:", error?.message ?? "Contenido no encontrado");
    return { ok: false, error: "Error al mover el contenido" };
  }

  return { ok: true, data: null };
}

// ──────────────────────────────────────────────────────────────────────────────
// reorderContentItems — persist a full within-column order after a drag settles
// ──────────────────────────────────────────────────────────────────────────────
export async function reorderContentItems(
  workspaceId: string,
  status: ContentStatus,
  orderedIds: string[],
): Promise<ActionResult<null>> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { ok: false, error: "No autorizado" };
  }

  const parsedStatus = ContentStatusEnum.safeParse(status);
  if (!parsedStatus.success) {
    return { ok: false, error: "Estado inválido" };
  }

  const results = await Promise.all(
    orderedIds.map((id, index) =>
      supabase
        .from("content_items")
        .update({ position: index, status: parsedStatus.data })
        .eq("id", id)
        .eq("workspace_id", workspaceId)
        .select("id")
        .maybeSingle(),
    ),
  );

  const failed = results.find((r) => r.error || !r.data);
  if (failed) {
    console.error("[reorderContentItems] Supabase error:", failed.error?.message ?? "Contenido no encontrado");
    return { ok: false, error: "Error al reordenar" };
  }

  return { ok: true, data: null };
}

// ──────────────────────────────────────────────────────────────────────────────
// deleteContentItem
// ──────────────────────────────────────────────────────────────────────────────
export async function deleteContentItem(workspaceId: string, id: string): Promise<ActionResult<null>> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { ok: false, error: "No autorizado" };
  }

  const { data, error } = await supabase
    .from("content_items")
    .delete()
    .eq("id", id)
    .eq("workspace_id", workspaceId)
    .select("id")
    .maybeSingle();

  if (error || !data) {
    console.error("[deleteContentItem] Supabase error:", error?.message ?? "Contenido no encontrado");
    return { ok: false, error: "Error al eliminar el contenido" };
  }

  return { ok: true, data: null };
}
