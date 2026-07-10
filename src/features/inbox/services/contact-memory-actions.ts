"use server";

/**
 * contact-memory-actions.ts — Server actions for viewing/editing/deleting a
 * contact's Memoria Inteligente Avanzada from the UI (Fase 2). Uses the
 * cookie-session client (not service-role) so the "ws operators write
 * contact_memories" RLS policy actually gates who can mutate — same choice
 * as contact-actions.ts's updateContact, unlike the service-role reads used
 * by the AI buffer pipeline in contact-memory.ts.
 */

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import type { ContactMemory } from "./contact-memory";
import type { ActionResult } from "./contact-actions";

const UpdateMemorySchema = z.object({
  summary: z.string().max(2000).nullable().optional(),
  interests: z.array(z.string().max(80)).max(30).optional(),
  preferences: z.record(z.string(), z.unknown()).optional(),
  objections: z.array(z.string().max(300)).max(30).optional(),
  lead_status: z.string().max(200).nullable().optional(),
  next_step: z.string().max(500).nullable().optional(),
});

export type UpdateMemoryInput = z.infer<typeof UpdateMemorySchema>;

// ──────────────────────────────────────────────────────────────────────────────
// updateContactMemory — upsert (a memory row may not exist yet if the
// extractor hasn't run). workspaceId comes from the already-loaded contact
// in the UI; RLS still requires the caller to be a member of THAT workspace
// with role admin/manager/agent, so a client can't forge writes elsewhere.
// ──────────────────────────────────────────────────────────────────────────────
export async function updateContactMemory(
  contactId: string,
  workspaceId: string,
  patch: UpdateMemoryInput,
): Promise<ActionResult<{ id: string }>> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { ok: false, error: "No autorizado" };
  }

  const parsed = UpdateMemorySchema.safeParse(patch);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Datos inválidos",
    };
  }

  if (Object.keys(parsed.data).length === 0) {
    return { ok: false, error: "No se proporcionaron campos a actualizar" };
  }

  const { data: upserted, error: upsertError } = await supabase
    .from("contact_memories")
    .upsert(
      {
        contact_id: contactId,
        workspace_id: workspaceId,
        ...parsed.data,
      },
      { onConflict: "contact_id" },
    )
    .select("id")
    .single();

  if (upsertError || !upserted) {
    console.error(
      "[updateContactMemory] Supabase error:",
      upsertError?.message,
    );
    return { ok: false, error: "Error al guardar la memoria" };
  }

  return { ok: true, data: { id: upserted.id as string } };
}

// ──────────────────────────────────────────────────────────────────────────────
// getContactMemoryForUser — RLS-scoped read for the panel (distinct from
// contact-memory.ts's service-role getContactMemory used by the AI pipeline).
// ──────────────────────────────────────────────────────────────────────────────
export async function getContactMemoryForUser(
  contactId: string,
): Promise<ContactMemory | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("contact_memories")
    .select("*")
    .eq("contact_id", contactId)
    .maybeSingle();

  return (data as ContactMemory | null) ?? null;
}

// ──────────────────────────────────────────────────────────────────────────────
// forgetContact — deletes the contact's memory row entirely ("Olvidar este
// contacto"). Does not touch the contact/conversation, only contact_memories.
// ──────────────────────────────────────────────────────────────────────────────
export async function forgetContact(
  contactId: string,
): Promise<ActionResult<{ deleted: boolean }>> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { ok: false, error: "No autorizado" };
  }

  const { error: deleteError } = await supabase
    .from("contact_memories")
    .delete()
    .eq("contact_id", contactId);

  if (deleteError) {
    console.error("[forgetContact] Supabase error:", deleteError.message);
    return { ok: false, error: "Error al olvidar el contacto" };
  }

  return { ok: true, data: { deleted: true } };
}
