"use server";

/**
 * contact-lookup.ts — Read-only contact search for the project's "cliente
 * asociado" picker. Deliberately independent from `clients`/`inbox`'s
 * contact code (no cross-feature import).
 */

import { createClient } from "@/lib/supabase/server";
import type { ContactOption } from "@/features/projects/types";

export async function searchContactsForProject(
  workspaceId: string,
  query: string,
): Promise<ContactOption[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return [];

  let request = supabase
    .from("contacts")
    .select("id,name,phone")
    .eq("workspace_id", workspaceId)
    .limit(20);

  if (query.trim()) {
    request = request.or(`name.ilike.%${query}%,phone.ilike.%${query}%`);
  }

  const { data, error } = await request;

  if (error || !data) {
    console.error("[searchContactsForProject] Supabase error:", error?.message);
    return [];
  }

  return data as ContactOption[];
}
