"use server";

/**
 * contact-lookup.ts — Read-only contact search for the deal-creation picker.
 * Deliberately independent from `inbox`'s contact code (no cross-feature import).
 */

import { createClient } from "@/lib/supabase/server";
import type { ContactSummary } from "@/features/pipeline/types";

export async function searchContacts(
  workspaceId: string,
  query: string,
): Promise<ContactSummary[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return [];

  let request = supabase
    .from("contacts")
    .select("id,name,phone,email,stage")
    .eq("workspace_id", workspaceId)
    .limit(20);

  if (query.trim()) {
    request = request.or(`name.ilike.%${query}%,phone.ilike.%${query}%`);
  }

  const { data, error } = await request;

  if (error || !data) {
    console.error("[searchContacts] Supabase error:", error?.message);
    return [];
  }

  return data as ContactSummary[];
}

export async function getContactSummary(
  contactId: string,
): Promise<ContactSummary | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data, error } = await supabase
    .from("contacts")
    .select("id,name,phone,email,stage")
    .eq("id", contactId)
    .single();

  if (error || !data) return null;

  return data as ContactSummary;
}
