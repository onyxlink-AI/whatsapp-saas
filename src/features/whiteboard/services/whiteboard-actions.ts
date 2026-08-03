"use server";

/**
 * whiteboard-actions.ts — Server actions for Pizarra (Excalidraw-backed
 * boards) CRUD. Mirrors projects' project-actions.ts pattern.
 */

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import type { WhiteboardRow, WhiteboardSceneData } from "@/features/whiteboard/types";

export type ActionResult<T> =
  | { ok: true; data: T; error?: never }
  | { ok: false; data?: never; error: string };

const RenameSchema = z.object({
  name: z.string().min(1, "El nombre es requerido"),
});

const SceneDataSchema = z.object({
  elements: z.array(z.unknown()),
  appState: z.record(z.string(), z.unknown()),
});

// ──────────────────────────────────────────────────────────────────────────────
// listWhiteboards
// ──────────────────────────────────────────────────────────────────────────────
export async function listWhiteboards(
  workspaceId: string,
): Promise<WhiteboardRow[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return [];

  const { data, error } = await supabase
    .from("whiteboards")
    .select("id, workspace_id, name, scene_data, created_by, created_at, updated_at")
    .eq("workspace_id", workspaceId)
    .order("updated_at", { ascending: false });

  if (error || !data) {
    console.error("[listWhiteboards] Supabase error:", error?.message);
    return [];
  }

  return data as unknown as WhiteboardRow[];
}

// ──────────────────────────────────────────────────────────────────────────────
// getWhiteboard
// ──────────────────────────────────────────────────────────────────────────────
export async function getWhiteboard(
  whiteboardId: string,
): Promise<WhiteboardRow | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data, error } = await supabase
    .from("whiteboards")
    .select("id, workspace_id, name, scene_data, created_by, created_at, updated_at")
    .eq("id", whiteboardId)
    .maybeSingle();

  if (error || !data) {
    console.error("[getWhiteboard] error:", error?.message);
    return null;
  }

  return data as unknown as WhiteboardRow;
}

// ──────────────────────────────────────────────────────────────────────────────
// createWhiteboard
// ──────────────────────────────────────────────────────────────────────────────
export async function createWhiteboard(
  workspaceId: string,
  name?: string,
): Promise<ActionResult<{ id: string }>> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { ok: false, error: "No autorizado" };
  }

  const { data: inserted, error: insertError } = await supabase
    .from("whiteboards")
    .insert({
      workspace_id: workspaceId,
      name: name?.trim() || "Sin título",
      created_by: user.id,
    })
    .select("id")
    .single();

  if (insertError || !inserted) {
    console.error("[createWhiteboard] Supabase error:", insertError?.message);
    return { ok: false, error: "Error al crear el tablero" };
  }

  return { ok: true, data: { id: inserted.id as string } };
}

// ──────────────────────────────────────────────────────────────────────────────
// renameWhiteboard
// ──────────────────────────────────────────────────────────────────────────────
export async function renameWhiteboard(
  whiteboardId: string,
  name: string,
): Promise<ActionResult<null>> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { ok: false, error: "No autorizado" };
  }

  const parsed = RenameSchema.safeParse({ name });
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Datos inválidos",
    };
  }

  const { error } = await supabase
    .from("whiteboards")
    .update({ name: parsed.data.name })
    .eq("id", whiteboardId);

  if (error) {
    console.error("[renameWhiteboard] Supabase error:", error.message);
    return { ok: false, error: "Error al renombrar el tablero" };
  }

  return { ok: true, data: null };
}

// ──────────────────────────────────────────────────────────────────────────────
// updateWhiteboardScene — called from the editor's debounced autosave.
// ──────────────────────────────────────────────────────────────────────────────
export async function updateWhiteboardScene(
  whiteboardId: string,
  sceneData: WhiteboardSceneData,
): Promise<ActionResult<null>> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { ok: false, error: "No autorizado" };
  }

  const parsed = SceneDataSchema.safeParse(sceneData);
  if (!parsed.success) {
    return { ok: false, error: "Datos del tablero inválidos" };
  }

  const { error } = await supabase
    .from("whiteboards")
    .update({ scene_data: parsed.data })
    .eq("id", whiteboardId);

  if (error) {
    console.error("[updateWhiteboardScene] Supabase error:", error.message);
    return { ok: false, error: "Error al guardar el tablero" };
  }

  return { ok: true, data: null };
}

// ──────────────────────────────────────────────────────────────────────────────
// deleteWhiteboard
// ──────────────────────────────────────────────────────────────────────────────
export async function deleteWhiteboard(
  whiteboardId: string,
): Promise<ActionResult<null>> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { ok: false, error: "No autorizado" };
  }

  const { error } = await supabase.from("whiteboards").delete().eq("id", whiteboardId);

  if (error) {
    console.error("[deleteWhiteboard] Supabase error:", error.message);
    return { ok: false, error: "Error al eliminar el tablero" };
  }

  return { ok: true, data: null };
}
