"use server";

/**
 * deal-actions.ts — Server actions for deal (sales opportunity) CRUD,
 * kanban stage moves, and within-column reordering.
 *
 * Creating a deal no longer requires an existing Contact — the admin types
 * the lead's name/phone/email/social/sector directly on the deal (lead_name/
 * lead_phone/lead_email/lead_social/lead_contact_method/sector_id on
 * `deals`). The Contact gets created — never duplicated — either
 * automatically when the deal is won (promoteDealToContact(), called from
 * every place a deal's stage can become 'cliente' through this file:
 * updateDeal, moveDealStage) or manually at any stage via the "Agregar a
 * CRM" button (convertDealToContact()). The AI auto-mover in
 * pipeline-suggestion.ts never needs this: every deal it touches already
 * has a real contact_id (it only ever acts on deals tied to an actual
 * WhatsApp/voice conversation with an existing contact).
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
// findOrCreateSectorId — "type or create" semantics for the Sector field,
// mirroring findOrCreateCompanyId in features/clients/services/client-actions.ts.
// ──────────────────────────────────────────────────────────────────────────────
async function findOrCreateSectorId(
  supabase: Awaited<ReturnType<typeof createClient>>,
  workspaceId: string,
  sectorName: string | undefined,
): Promise<string | null> {
  const trimmed = sectorName?.trim();
  if (!trimmed) return null;

  const { data: existing } = await supabase
    .from("sectors")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("name", trimmed)
    .maybeSingle();

  if (existing) return existing.id as string;

  const { data: created, error } = await supabase
    .from("sectors")
    .insert({ workspace_id: workspaceId, name: trimmed })
    .select("id")
    .single();

  if (error || !created) {
    console.error("[findOrCreateSectorId] Supabase error:", error?.message);
    return null;
  }

  return created.id as string;
}

interface PromotableDeal {
  id: string;
  workspace_id: string;
  contact_id: string | null;
  lead_name: string | null;
  lead_phone: string | null;
  lead_email: string | null;
  lead_social: string | null;
  lead_contact_method: string | null;
  sector_id: string | null;
}

// ──────────────────────────────────────────────────────────────────────────────
// promoteDealToContact — the whole reason lead_name/lead_phone/lead_email/
// lead_social/lead_contact_method exist. No-op for a deal that's already
// linked to a real contact. Dedupes on contacts' own UNIQUE(workspace_id,
// phone) when the lead has a phone — an existing contact with that phone is
// reused, never duplicated; without a phone there's nothing to dedupe on,
// so a new contact is created directly. Called both automatically (won
// transition, see promoteDealToContactIfWon below) and manually from the
// "Agregar a CRM" button (convertDealToContact).
// ──────────────────────────────────────────────────────────────────────────────
async function promoteDealToContact(
  supabase: Awaited<ReturnType<typeof createClient>>,
  deal: PromotableDeal,
): Promise<string | null> {
  if (deal.contact_id) return deal.contact_id; // already a real contact
  if (!deal.lead_name) return null; // DB CHECK guarantees this never happens, but stay defensive

  let contactId: string | undefined;

  if (deal.lead_phone) {
    const { data: existingContact } = await supabase
      .from("contacts")
      .select("id")
      .eq("workspace_id", deal.workspace_id)
      .eq("phone", deal.lead_phone)
      .maybeSingle();
    contactId = existingContact?.id as string | undefined;
  }

  if (!contactId) {
    const { data: createdContact, error } = await supabase
      .from("contacts")
      .insert({
        workspace_id: deal.workspace_id,
        name: deal.lead_name,
        phone: deal.lead_phone || null,
        email: deal.lead_email || null,
        social_media: deal.lead_social || null,
        contact_method: deal.lead_contact_method || null,
        sector_id: deal.sector_id,
        client_status: "activo",
      })
      .select("id")
      .single();

    if (error || !createdContact) {
      console.error("[promoteDealToContact] Supabase error:", error?.message);
      return null;
    }
    contactId = createdContact.id as string;
  }

  await supabase.from("deals").update({ contact_id: contactId }).eq("id", deal.id);
  return contactId;
}

// ──────────────────────────────────────────────────────────────────────────────
// promoteDealToContactIfWon — gates promoteDealToContact() to only fire on
// the transition INTO 'cliente' (never re-fires on later saves of an
// already-won deal). Called from updateDeal/moveDealStage.
// ──────────────────────────────────────────────────────────────────────────────
async function promoteDealToContactIfWon(
  supabase: Awaited<ReturnType<typeof createClient>>,
  deal: PromotableDeal,
  previousStage: DealStage,
  newStage: DealStage,
): Promise<void> {
  if (newStage !== "cliente" || previousStage === "cliente") return;
  await promoteDealToContact(supabase, deal);
}

// ──────────────────────────────────────────────────────────────────────────────
// listSectors — for the Sector combobox (existing options + "Crear «X»")
// ──────────────────────────────────────────────────────────────────────────────
export async function listSectors(
  workspaceId: string,
): Promise<{ id: string; name: string }[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return [];

  const { data, error } = await supabase
    .from("sectors")
    .select("id, name")
    .eq("workspace_id", workspaceId)
    .order("name", { ascending: true });

  if (error || !data) {
    console.error("[listSectors] Supabase error:", error?.message);
    return [];
  }

  return data as { id: string; name: string }[];
}

// ──────────────────────────────────────────────────────────────────────────────
// createDeal
// ──────────────────────────────────────────────────────────────────────────────
export async function createDeal(
  workspaceId: string,
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

  // contact_id is only ever set from the "Crear negocio" shortcut on an
  // existing contact's own page (?createFor=<id>) — re-verify it's a real
  // contact in THIS workspace rather than trusting a raw uuid at face value.
  if (parsed.data.contact_id) {
    const { data: contact } = await supabase
      .from("contacts")
      .select("id")
      .eq("id", parsed.data.contact_id)
      .eq("workspace_id", workspaceId)
      .maybeSingle();
    if (!contact) {
      return { ok: false, error: "Contacto no encontrado" };
    }
  }

  const sectorId = await findOrCreateSectorId(
    supabase,
    workspaceId,
    parsed.data.sector_name,
  );

  // New deal goes to the end of the 'exploracion' column for its workspace.
  const { count } = await supabase
    .from("deals")
    .select("id", { count: "exact", head: true })
    .eq("workspace_id", workspaceId)
    .eq("stage", "exploracion");

  const { sector_name: _sectorName, ...dealFields } = parsed.data;

  const { data: inserted, error: insertError } = await supabase
    .from("deals")
    .insert({
      ...dealFields,
      lead_email: dealFields.lead_email || null,
      workspace_id: workspaceId,
      sector_id: sectorId,
      stage: "exploracion",
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

  // Read the deal's current stage + lead identity before overwriting it —
  // both are needed to detect the won transition and promote it below.
  const { data: before } = await supabase
    .from("deals")
    .select(
      "workspace_id, contact_id, stage, lead_name, lead_phone, lead_email, lead_social, lead_contact_method, sector_id",
    )
    .eq("id", dealId)
    .maybeSingle();

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

  if (before && parsed.data.stage) {
    await promoteDealToContactIfWon(
      supabase,
      { id: dealId, ...before },
      before.stage as DealStage,
      parsed.data.stage,
    );
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

  const { data: before } = await supabase
    .from("deals")
    .select(
      "workspace_id, contact_id, stage, lead_name, lead_phone, lead_email, lead_social, lead_contact_method, sector_id",
    )
    .eq("id", dealId)
    .maybeSingle();

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

  if (before) {
    await promoteDealToContactIfWon(
      supabase,
      { id: dealId, ...before },
      before.stage as DealStage,
      parsedStage.data,
    );
  }

  return { ok: true, data: { id: updated.id as string } };
}

// ──────────────────────────────────────────────────────────────────────────────
// convertDealToContact — backend for the "Agregar a CRM" button: promotes a
// deal to a real Cliente at any stage, not just on win. Idempotent — a deal
// already linked to a contact just returns that contact's id.
// ──────────────────────────────────────────────────────────────────────────────
export async function convertDealToContact(
  dealId: string,
): Promise<ActionResult<{ id: string }>> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { ok: false, error: "No autorizado" };
  }

  const { data: deal, error: lookupError } = await supabase
    .from("deals")
    .select(
      "id, workspace_id, contact_id, lead_name, lead_phone, lead_email, lead_social, lead_contact_method, sector_id",
    )
    .eq("id", dealId)
    .maybeSingle();

  if (lookupError || !deal) {
    return { ok: false, error: "Negocio no encontrado" };
  }

  const contactId = await promoteDealToContact(supabase, deal as PromotableDeal);
  if (!contactId) {
    return { ok: false, error: "Error al crear el cliente" };
  }

  return { ok: true, data: { id: contactId } };
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
      .select("*, contact:contacts(id,name,phone,email,stage), sector:sectors(id,name)")
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

  // supabase-js doesn't infer nested-relation selects (the deal's contact:contacts(...)
  // join) — this cast must stay in sync by hand with the actual select() above it;
  // a drift fails silently at runtime (undefined fields), not at compile time.
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
    .select("*, contact:contacts(id,name,phone,email,stage), sector:sectors(id,name)")
    .eq("id", dealId)
    .single();

  if (error || !data) {
    console.error("[getDeal] error:", error?.message);
    return null;
  }

  // Same nested-select type-sync caveat as getDealsForBoard above.
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

  // Same nested-select type-sync caveat: must match the "user_id, users(full_name)" select above.
  return (data as unknown as { user_id: string; users: { full_name: string | null } | null }[]).map(
    (row) => ({
      user_id: row.user_id,
      full_name: row.users?.full_name ?? "Sin nombre",
    }),
  );
}
