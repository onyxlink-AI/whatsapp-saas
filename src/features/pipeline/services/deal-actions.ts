"use server";

/**
 * deal-actions.ts — Server actions for deal (sales opportunity) CRUD,
 * kanban stage moves, and within-column reordering.
 */

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import type { DealStage, DealWithContact } from "@/features/pipeline/types";
import {
  CLOSED_STAGES,
  DealInputSchema,
  DealStageEnum,
  ReorderSchema,
  UpdateDealSchema,
  type CreateDealInput,
  type UpdateDealInput,
} from "./deal-schemas";

export type ActionResult<T> =
  | { ok: true; data: T; error?: never }
  | { ok: false; data?: never; error: string };

// ──────────────────────────────────────────────────────────────────────────────
// createDeal
// ──────────────────────────────────────────────────────────────────────────────
export async function createDeal(
  data: CreateDealInput,
): Promise<ActionResult<{ id: string }>> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { ok: false, error: "No autorizado" };
  }

  const parsed = DealInputSchema.safeParse(data);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Datos inválidos",
    };
  }

  const { data: contact, error: contactError } = await supabase
    .from("contacts")
    .select("workspace_id")
    .eq("id", parsed.data.contact_id)
    .single();

  if (contactError || !contact) {
    return { ok: false, error: "Contacto no encontrado" };
  }

  // New deal goes to the end of the 'new' column for its workspace.
  const { count } = await supabase
    .from("deals")
    .select("id", { count: "exact", head: true })
    .eq("workspace_id", contact.workspace_id)
    .eq("stage", "new");

  const { data: inserted, error: insertError } = await supabase
    .from("deals")
    .insert({
      ...parsed.data,
      workspace_id: contact.workspace_id,
      stage: "new",
      position: count ?? 0,
    })
    .select("id")
    .single();

  if (insertError || !inserted) {
    console.error("[createDeal] Supabase error:", insertError?.message);
    return { ok: false, error: "Error al crear el deal" };
  }

  return { ok: true, data: { id: inserted.id as string } };
}

// ──────────────────────────────────────────────────────────────────────────────
// updateDeal
// ──────────────────────────────────────────────────────────────────────────────
export async function updateDeal(
  dealId: string,
  data: UpdateDealInput,
): Promise<ActionResult<{ id: string }>> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { ok: false, error: "No autorizado" };
  }

  const parsed = UpdateDealSchema.safeParse(data);
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

  if (parsed.data.stage) {
    patch.closed_at = CLOSED_STAGES.includes(parsed.data.stage)
      ? new Date().toISOString()
      : null;
  }

  const { data: updated, error: updateError } = await supabase
    .from("deals")
    .update(patch)
    .eq("id", dealId)
    .select("id")
    .single();

  if (updateError || !updated) {
    console.error("[updateDeal] Supabase error:", updateError?.message);
    return { ok: false, error: "Error al actualizar el deal" };
  }

  return { ok: true, data: { id: updated.id as string } };
}

// ──────────────────────────────────────────────────────────────────────────────
// moveDealStage — single-card kanban drag across (or within) a column
// ──────────────────────────────────────────────────────────────────────────────
export async function moveDealStage(
  dealId: string,
  newStage: DealStage,
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

  const parsedStage = DealStageEnum.safeParse(newStage);
  if (!parsedStage.success) {
    return { ok: false, error: "Etapa inválida" };
  }

  const { data: updated, error: updateError } = await supabase
    .from("deals")
    .update({
      stage: parsedStage.data,
      position: newPosition,
      closed_at: CLOSED_STAGES.includes(parsedStage.data)
        ? new Date().toISOString()
        : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", dealId)
    .select("id")
    .single();

  if (updateError || !updated) {
    console.error("[moveDealStage] Supabase error:", updateError?.message);
    return { ok: false, error: "Error al mover el deal" };
  }

  return { ok: true, data: { id: updated.id as string } };
}

// ──────────────────────────────────────────────────────────────────────────────
// reorderDeals — persist a full within-column order after a drag settles
// ──────────────────────────────────────────────────────────────────────────────
export async function reorderDeals(
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

  // RLS scopes each update to the caller's workspace; a foreign id simply
  // matches zero rows rather than leaking cross-tenant data.
  const results = await Promise.all(
    parsed.data.ordered_ids.map((id, index) =>
      supabase
        .from("deals")
        .update({ position: index, stage: parsed.data.stage })
        .eq("id", id),
    ),
  );

  const failed = results.find((r) => r.error);
  if (failed?.error) {
    console.error("[reorderDeals] Supabase error:", failed.error.message);
    return { ok: false, error: "Error al reordenar los deals" };
  }

  return { ok: true, data: null };
}

// ──────────────────────────────────────────────────────────────────────────────
// deleteDeal
// ──────────────────────────────────────────────────────────────────────────────
export async function deleteDeal(dealId: string): Promise<ActionResult<null>> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { ok: false, error: "No autorizado" };
  }

  const { error } = await supabase.from("deals").delete().eq("id", dealId);

  if (error) {
    console.error("[deleteDeal] Supabase error:", error.message);
    return { ok: false, error: "Error al eliminar el deal" };
  }

  return { ok: true, data: null };
}

// ──────────────────────────────────────────────────────────────────────────────
// getDealsForBoard / getDeal
// ──────────────────────────────────────────────────────────────────────────────
export async function getDealsForBoard(
  workspaceId: string,
): Promise<DealWithContact[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return [];

  const [{ data: deals, error }, { data: openTasks }] = await Promise.all([
    supabase
      .from("deals")
      .select("*, contact:contacts(id,name,phone,email,stage)")
      .eq("workspace_id", workspaceId)
      .order("stage", { ascending: true })
      .order("position", { ascending: true }),
    supabase
      .from("tasks")
      .select("deal_id")
      .eq("workspace_id", workspaceId)
      .not("deal_id", "is", null)
      .in("status", ["pending", "in_progress"]),
  ]);

  if (error || !deals) {
    console.error("[getDealsForBoard] Supabase error:", error?.message);
    return [];
  }

  const openTaskCounts = new Map<string, number>();
  for (const row of openTasks ?? []) {
    const dealId = (row as { deal_id: string | null }).deal_id;
    if (!dealId) continue;
    openTaskCounts.set(dealId, (openTaskCounts.get(dealId) ?? 0) + 1);
  }

  return (deals as unknown as DealWithContact[]).map((deal) => ({
    ...deal,
    open_task_count: openTaskCounts.get(deal.id) ?? 0,
  }));
}

export async function getDeal(
  dealId: string,
): Promise<DealWithContact | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data, error } = await supabase
    .from("deals")
    .select("*, contact:contacts(id,name,phone,email,stage)")
    .eq("id", dealId)
    .single();

  if (error || !data) {
    console.error("[getDeal] error:", error?.message);
    return null;
  }

  return { ...(data as unknown as DealWithContact), open_task_count: 0 };
}

// ──────────────────────────────────────────────────────────────────────────────
// listWorkspaceMembers — for the deal-owner / task-assignee pickers
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
    .eq("workspace_id", workspaceId);

  if (error || !data) {
    console.error("[listWorkspaceMembers] Supabase error:", error?.message);
    return [];
  }

  return (data as unknown as { user_id: string; users: { full_name: string | null } | null }[]).map(
    (row) => ({
      user_id: row.user_id,
      full_name: row.users?.full_name ?? "Sin nombre",
    }),
  );
}
