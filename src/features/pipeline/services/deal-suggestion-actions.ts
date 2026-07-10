"use server";

/**
 * deal-suggestion-actions.ts — server actions for the "Sugerencias de IA:
 * crear deal" banner (contacts flagged by pipeline-suggestion.ts as having
 * a sales opportunity but no deal yet). Stored on contacts.custom_fields —
 * same no-migration pattern as the setter's lead_* fields in buffer.ts.
 */

import { createClient } from "@/lib/supabase/server";
import type { DealStage } from "@/features/pipeline/types";
import { DEAL_STAGES } from "@/features/pipeline/types";
import { createDeal, acceptPipelineSuggestion } from "./deal-actions";

export type ActionResult<T> =
  | { ok: true; data: T; error?: never }
  | { ok: false; data?: never; error: string };

export interface ContactDealSuggestion {
  contactId: string;
  name: string | null;
  phone: string;
  stage: DealStage;
  reason: string | null;
}

// ──────────────────────────────────────────────────────────────────────────────
// getContactsWithDealSuggestions
// ──────────────────────────────────────────────────────────────────────────────
export async function getContactsWithDealSuggestions(
  workspaceId: string,
): Promise<ContactDealSuggestion[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data: contacts, error } = await supabase
    .from("contacts")
    .select("id, name, phone, custom_fields")
    .eq("workspace_id", workspaceId)
    .not("custom_fields->>ai_suggested_deal_stage", "is", null);

  if (error || !contacts) return [];

  const contactIds = contacts.map((c) => c.id as string);
  if (contactIds.length === 0) return [];

  // Exclude contacts that already got a deal since the suggestion was made.
  const { data: existingDeals } = await supabase
    .from("deals")
    .select("contact_id")
    .in("contact_id", contactIds);
  const withDeal = new Set((existingDeals ?? []).map((d) => d.contact_id as string));

  return contacts
    .filter((c) => !withDeal.has(c.id as string))
    .map((c) => {
      const cf = (c.custom_fields as Record<string, unknown> | null) ?? {};
      const stage = cf.ai_suggested_deal_stage as string;
      return {
        contactId: c.id as string,
        name: c.name as string | null,
        phone: c.phone as string,
        stage: DEAL_STAGES.includes(stage as DealStage) ? (stage as DealStage) : "new",
        reason: (cf.ai_suggested_deal_reason as string | null) ?? null,
      };
    });
}

// ──────────────────────────────────────────────────────────────────────────────
// createDealFromSuggestion — creates the deal (always starts at "new", same
// rule as createDeal) then, if the suggestion targets a later stage, moves it
// there in the same step. Clears the contact-level suggestion either way.
// ──────────────────────────────────────────────────────────────────────────────
export async function createDealFromSuggestion(
  contactId: string,
): Promise<ActionResult<{ id: string }>> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) return { ok: false, error: "No autorizado" };

  const { data: contact, error: contactError } = await supabase
    .from("contacts")
    .select("name, phone, custom_fields")
    .eq("id", contactId)
    .single();

  if (contactError || !contact) {
    return { ok: false, error: "Contacto no encontrado" };
  }

  const cf = (contact.custom_fields as Record<string, unknown> | null) ?? {};
  const suggestedStage = cf.ai_suggested_deal_stage as string | undefined;

  const created = await createDeal({
    contact_id: contactId,
    title: `Oportunidad — ${contact.name || contact.phone}`,
  });

  if (!created.ok) return created;

  if (
    suggestedStage &&
    suggestedStage !== "new" &&
    DEAL_STAGES.includes(suggestedStage as DealStage)
  ) {
    // Stamp the suggestion onto the freshly created deal, then apply it via
    // the same accept path used on the board.
    await supabase
      .from("deals")
      .update({ ai_suggested_stage: suggestedStage })
      .eq("id", created.data.id);
    await acceptPipelineSuggestion(created.data.id);
  }

  await clearContactSuggestion(supabase, contactId, cf);

  return created;
}

// ──────────────────────────────────────────────────────────────────────────────
// dismissContactDealSuggestion
// ──────────────────────────────────────────────────────────────────────────────
export async function dismissContactDealSuggestion(
  contactId: string,
): Promise<ActionResult<{ id: string }>> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) return { ok: false, error: "No autorizado" };

  const { data: contact, error: contactError } = await supabase
    .from("contacts")
    .select("custom_fields")
    .eq("id", contactId)
    .single();

  if (contactError || !contact) {
    return { ok: false, error: "Contacto no encontrado" };
  }

  const cf = (contact.custom_fields as Record<string, unknown> | null) ?? {};
  await clearContactSuggestion(supabase, contactId, cf);

  return { ok: true, data: { id: contactId } };
}

async function clearContactSuggestion(
  supabase: Awaited<ReturnType<typeof createClient>>,
  contactId: string,
  currentCustomFields: Record<string, unknown>,
): Promise<void> {
  const {
    ai_suggested_deal_stage: _s,
    ai_suggested_deal_reason: _r,
    ai_suggested_deal_at: _a,
    ...rest
  } = currentCustomFields;
  await supabase
    .from("contacts")
    .update({ custom_fields: rest })
    .eq("id", contactId);
}
