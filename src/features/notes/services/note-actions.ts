"use server";

/**
 * note-actions.ts — Server actions for Anotaciones (Fase 2). Mirrors
 * whiteboard-actions.ts: `content` is validated loosely (like `scene_data`)
 * because the real safety net is the editor's own restricted schema (see
 * note-editor.tsx) — a workspace member with write access already has
 * table-level write access under RLS, same trust boundary as whiteboards.
 */

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import type { NoteContent, NoteRow, NoteTemplateId } from "@/features/projects/types";

export type ActionResult<T> =
  | { ok: true; data: T; error?: never }
  | { ok: false; data?: never; error: string };

const RenameSchema = z.object({
  title: z.string().min(1, "El título es requerido"),
});

const ContentSchema = z.object({
  type: z.literal("doc"),
  content: z.array(z.unknown()).optional(),
});

const NOTE_SELECT = "id, workspace_id, project_id, title, content, template, archived_at, created_by, created_at, updated_at";

// ──────────────────────────────────────────────────────────────────────────────
// listNotes
// ──────────────────────────────────────────────────────────────────────────────
export async function listNotes(
  workspaceId: string,
  opts?: { includeArchived?: boolean },
): Promise<NoteRow[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return [];

  let query = supabase
    .from("notes")
    .select(NOTE_SELECT)
    .eq("workspace_id", workspaceId)
    .order("updated_at", { ascending: false });

  if (!opts?.includeArchived) query = query.is("archived_at", null);

  const { data, error } = await query;

  if (error || !data) {
    console.error("[listNotes] Supabase error:", error?.message);
    return [];
  }

  return data as unknown as NoteRow[];
}

// ──────────────────────────────────────────────────────────────────────────────
// getNote
// ──────────────────────────────────────────────────────────────────────────────
export async function getNote(noteId: string): Promise<NoteRow | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data, error } = await supabase
    .from("notes")
    .select(NOTE_SELECT)
    .eq("id", noteId)
    .maybeSingle();

  if (error || !data) {
    console.error("[getNote] error:", error?.message);
    return null;
  }

  return data as unknown as NoteRow;
}

// ──────────────────────────────────────────────────────────────────────────────
// createNote
// ──────────────────────────────────────────────────────────────────────────────
export async function createNote(
  workspaceId: string,
  input: { title?: string; template?: NoteTemplateId; content?: NoteContent; projectId?: string | null },
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
    .from("notes")
    .insert({
      workspace_id: workspaceId,
      project_id: input.projectId ?? null,
      title: input.title?.trim() || "Sin título",
      template: input.template ?? null,
      content: input.content ?? { type: "doc", content: [] },
      created_by: user.id,
    })
    .select("id")
    .single();

  if (insertError || !inserted) {
    console.error("[createNote] Supabase error:", insertError?.message);
    return { ok: false, error: "Error al crear el documento" };
  }

  return { ok: true, data: { id: inserted.id as string } };
}

// ──────────────────────────────────────────────────────────────────────────────
// renameNote
// ──────────────────────────────────────────────────────────────────────────────
export async function renameNote(noteId: string, title: string): Promise<ActionResult<null>> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { ok: false, error: "No autorizado" };
  }

  const parsed = RenameSchema.safeParse({ title });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }

  const { error } = await supabase.from("notes").update({ title: parsed.data.title }).eq("id", noteId);

  if (error) {
    console.error("[renameNote] Supabase error:", error.message);
    return { ok: false, error: "Error al renombrar el documento" };
  }

  return { ok: true, data: null };
}

// ──────────────────────────────────────────────────────────────────────────────
// updateNoteContent — called from the editor's debounced autosave.
// ──────────────────────────────────────────────────────────────────────────────
export async function updateNoteContent(noteId: string, content: NoteContent): Promise<ActionResult<null>> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { ok: false, error: "No autorizado" };
  }

  const parsed = ContentSchema.safeParse(content);
  if (!parsed.success) {
    return { ok: false, error: "Contenido del documento inválido" };
  }

  const { error } = await supabase.from("notes").update({ content: parsed.data }).eq("id", noteId);

  if (error) {
    console.error("[updateNoteContent] Supabase error:", error.message);
    return { ok: false, error: "Error al guardar el documento" };
  }

  return { ok: true, data: null };
}

// ──────────────────────────────────────────────────────────────────────────────
// duplicateNote
// ──────────────────────────────────────────────────────────────────────────────
export async function duplicateNote(noteId: string): Promise<ActionResult<{ id: string }>> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { ok: false, error: "No autorizado" };
  }

  const { data: source, error: sourceError } = await supabase
    .from("notes")
    .select("workspace_id, project_id, title, content, template")
    .eq("id", noteId)
    .maybeSingle();

  if (sourceError || !source) {
    return { ok: false, error: "Documento no encontrado" };
  }

  const s = source as { workspace_id: string; project_id: string | null; title: string; content: NoteContent; template: NoteTemplateId | null };

  const { data: inserted, error: insertError } = await supabase
    .from("notes")
    .insert({
      workspace_id: s.workspace_id,
      project_id: s.project_id,
      title: `${s.title} (copia)`,
      content: s.content,
      template: s.template,
      created_by: user.id,
    })
    .select("id")
    .single();

  if (insertError || !inserted) {
    console.error("[duplicateNote] Supabase error:", insertError?.message);
    return { ok: false, error: "Error al duplicar el documento" };
  }

  return { ok: true, data: { id: inserted.id as string } };
}

// ──────────────────────────────────────────────────────────────────────────────
// setNoteArchived — "Archivar" / restaurar.
// ──────────────────────────────────────────────────────────────────────────────
export async function setNoteArchived(noteId: string, archived: boolean): Promise<ActionResult<null>> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { ok: false, error: "No autorizado" };
  }

  const { error } = await supabase
    .from("notes")
    .update({ archived_at: archived ? new Date().toISOString() : null })
    .eq("id", noteId);

  if (error) {
    console.error("[setNoteArchived] Supabase error:", error.message);
    return { ok: false, error: "Error al archivar el documento" };
  }

  return { ok: true, data: null };
}

// ──────────────────────────────────────────────────────────────────────────────
// setNoteProject — asociar/desasociar opcionalmente a un proyecto.
// ──────────────────────────────────────────────────────────────────────────────
export async function setNoteProject(noteId: string, projectId: string | null): Promise<ActionResult<null>> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { ok: false, error: "No autorizado" };
  }

  const { error } = await supabase.from("notes").update({ project_id: projectId }).eq("id", noteId);

  if (error) {
    console.error("[setNoteProject] Supabase error:", error.message);
    return { ok: false, error: "Error al asociar el proyecto" };
  }

  return { ok: true, data: null };
}
