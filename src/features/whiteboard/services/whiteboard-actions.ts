"use server";

/**
 * whiteboard-actions.ts — Server actions for Pizarra (Excalidraw-backed
 * boards) CRUD. Mirrors projects' project-actions.ts pattern.
 */

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import type { WhiteboardRow, WhiteboardSceneData, WhiteboardCasResult, WhiteboardAppStateResult } from "@/features/whiteboard/types";
import { MAX_ELEMENTS_PER_SCENE, MAX_SCENE_BYTES, MAX_APP_STATE_BYTES, PERSISTABLE_APP_STATE_KEYS } from "@/features/whiteboard/services/scene-adapter";

export type ActionResult<T> =
  | { ok: true; data: T; error?: never }
  | { ok: false; data?: never; error: string };

const RenameSchema = z.object({
  name: z.string().min(1, "El nombre es requerido"),
});

const ElementsSchema = z.array(z.unknown()).max(MAX_ELEMENTS_PER_SCENE);

// Revisión correctiva: mismo whitelist EXACTO que la propia función SQL —
// una clave fuera de esta lista se rechaza aquí en Node antes de gastar un
// viaje a la base de datos (la función también la rechaza igual, defensa
// en profundidad).
const AppStateSchema = z
  .record(z.string(), z.unknown())
  .refine((v) => Object.keys(v).every((k) => (PERSISTABLE_APP_STATE_KEYS as readonly string[]).includes(k)), {
    message: "appState contiene una clave no permitida",
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
    .select("id, workspace_id, name, scene_data, version, created_by, created_at, updated_at")
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
    .select("id, workspace_id, name, scene_data, version, created_by, created_at, updated_at")
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
// Fase 4A: workspaceId ahora es obligatorio y se filtra en la propia
// UPDATE, con .select() + comprobación de una única fila afectada.
export async function renameWhiteboard(
  workspaceId: string,
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

  const { data: updated, error } = await supabase
    .from("whiteboards")
    .update({ name: parsed.data.name })
    .eq("id", whiteboardId)
    .eq("workspace_id", workspaceId)
    .select("id")
    .maybeSingle();

  if (error) {
    console.error("[renameWhiteboard] Supabase error:", error.message);
    return { ok: false, error: "Error al renombrar el tablero" };
  }
  if (!updated) {
    return { ok: false, error: "not_found_or_forbidden" };
  }

  return { ok: true, data: null };
}

// ──────────────────────────────────────────────────────────────────────────────
// duplicateWhiteboard — Fase 2: "Duplicar" en el editor. Copia scene_data tal
// cual (mismo formato JSON que ya persiste el autosave), nunca la comparte.
// ──────────────────────────────────────────────────────────────────────────────
export async function duplicateWhiteboard(
  whiteboardId: string,
): Promise<ActionResult<{ id: string }>> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { ok: false, error: "No autorizado" };
  }

  const { data: source, error: sourceError } = await supabase
    .from("whiteboards")
    .select("workspace_id, name, scene_data")
    .eq("id", whiteboardId)
    .maybeSingle();

  if (sourceError || !source) {
    return { ok: false, error: "Tablero no encontrado" };
  }

  const { data: inserted, error: insertError } = await supabase
    .from("whiteboards")
    .insert({
      workspace_id: (source as { workspace_id: string }).workspace_id,
      name: `${(source as { name: string }).name} (copia)`,
      scene_data: (source as { scene_data: WhiteboardSceneData }).scene_data,
      created_by: user.id,
    })
    .select("id")
    .single();

  if (insertError || !inserted) {
    console.error("[duplicateWhiteboard] Supabase error:", insertError?.message);
    return { ok: false, error: "Error al duplicar el tablero" };
  }

  return { ok: true, data: { id: inserted.id as string } };
}

// ──────────────────────────────────────────────────────────────────────────────
// updateWhiteboardSceneCas — Fase 4C: ÚNICA vía de escritura de
// scene_data.elements, tanto para el autoguardado del editor como para
// las tools del asistente. Recibe SOLO el array de elementos — revisión
// correctiva: nunca el blob {elements, appState} completo, para que esta
// escritura no pueda pisar con una copia vieja un appState más fresco que
// otra pestaña/el propio usuario acaba de guardar (ver
// updateWhiteboardAppState, que es la única vía para appState). Delega
// TODO (filtro de workspace, comparación atómica de versión, límites de
// tamaño) a update_whiteboard_scene_cas() — nunca un UPDATE directo desde
// aquí. SECURITY INVOKER: se llama con el cliente de sesión (RLS activa),
// nunca con service_role.
// ──────────────────────────────────────────────────────────────────────────────
export async function updateWhiteboardSceneCas(
  workspaceId: string,
  whiteboardId: string,
  expectedVersion: number,
  elements: unknown[],
): Promise<ActionResult<WhiteboardCasResult>> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { ok: false, error: "No autorizado" };
  }

  const parsed = ElementsSchema.safeParse(elements);
  if (!parsed.success) {
    return { ok: false, error: "Datos del tablero inválidos" };
  }

  const elementsBytes = new TextEncoder().encode(JSON.stringify(parsed.data)).length;
  if (elementsBytes > MAX_SCENE_BYTES) {
    return { ok: true, data: { result: "scene_too_large", element_count: parsed.data.length, size_bytes: elementsBytes } };
  }

  const { data, error } = await supabase.rpc("update_whiteboard_scene_cas", {
    p_workspace_id: workspaceId,
    p_whiteboard_id: whiteboardId,
    p_expected_version: expectedVersion,
    p_elements: parsed.data,
  });

  if (error) {
    console.error("[updateWhiteboardSceneCas] Supabase error:", error.message);
    return { ok: false, error: "Error al guardar el tablero" };
  }

  return { ok: true, data: data as WhiteboardCasResult };
}

// ──────────────────────────────────────────────────────────────────────────────
// updateWhiteboardAppState — Fase 4C revisión correctiva: única vía de
// escritura de scene_data.appState. Nunca toca `elements`, nunca
// incrementa `version` — el viewport/zoom/scroll no es contenido de la
// escena, no debe poder generar un conflicto de edición ni gastar
// versión. Sin expected_version a propósito: dos cambios de cámara nunca
// necesitan resolverse con más cuidado que "gana el último". Mismo
// whitelist de claves que pickPersistableAppState() en el editor.
// ──────────────────────────────────────────────────────────────────────────────
export async function updateWhiteboardAppState(
  workspaceId: string,
  whiteboardId: string,
  appState: Record<string, unknown>,
): Promise<ActionResult<WhiteboardAppStateResult>> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { ok: false, error: "No autorizado" };
  }

  const parsed = AppStateSchema.safeParse(appState);
  if (!parsed.success) {
    return { ok: false, error: "Datos de vista inválidos" };
  }

  const appStateBytes = new TextEncoder().encode(JSON.stringify(parsed.data)).length;
  if (appStateBytes > MAX_APP_STATE_BYTES) {
    return { ok: true, data: { result: "scene_too_large" } };
  }

  const { data, error } = await supabase.rpc("update_whiteboard_app_state", {
    p_workspace_id: workspaceId,
    p_whiteboard_id: whiteboardId,
    p_app_state: parsed.data,
  });

  if (error) {
    console.error("[updateWhiteboardAppState] Supabase error:", error.message);
    return { ok: false, error: "Error al guardar la vista del tablero" };
  }

  return { ok: true, data: data as WhiteboardAppStateResult };
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
