"use server";

/**
 * global-search.ts — read-only cross-entity search backing the Cmd/Ctrl+K
 * command palette. Searches contacts (Clientes), projects, and deals
 * (Pipeline) in parallel, each independently RLS-scoped to the workspace.
 */

import { createClient } from "@/lib/supabase/server";
import type { SearchResultItem } from "@/features/search/types";

export async function globalSearch(
  workspaceId: string,
  query: string,
): Promise<SearchResultItem[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return [];

  const q = query.trim();
  if (!q) return [];

  const like = `%${q}%`;

  const [clientsRes, projectsRes, dealsRes] = await Promise.all([
    supabase
      .from("contacts")
      .select("id, name, phone, company:companies(name)")
      .eq("workspace_id", workspaceId)
      .or(`name.ilike.${like},phone.ilike.${like}`)
      .limit(8),
    supabase
      .from("projects")
      .select("id, name")
      .eq("workspace_id", workspaceId)
      .ilike("name", like)
      .limit(8),
    supabase
      .from("deals")
      .select("id, title, contact:contacts(name, phone)")
      .eq("workspace_id", workspaceId)
      .ilike("title", like)
      .limit(8),
  ]);

  const results: SearchResultItem[] = [];

  // supabase-js doesn't infer nested-relation selects (the company join above)
  // — this shape must stay in sync by hand with the select() string; a drift
  // fails silently at runtime, not at compile time.
  for (const row of (clientsRes.data ?? []) as unknown as {
    id: string;
    name: string | null;
    phone: string;
    company: { name: string } | null;
  }[]) {
    results.push({
      type: "client",
      id: row.id,
      title: row.name || row.phone,
      subtitle: row.company?.name ?? row.phone,
    });
  }

  for (const row of (projectsRes.data ?? []) as { id: string; name: string }[]) {
    results.push({ type: "project", id: row.id, title: row.name, subtitle: null });
  }

  // Same nested-select type-sync caveat as the clientsRes loop above.
  for (const row of (dealsRes.data ?? []) as unknown as {
    id: string;
    title: string;
    contact: { name: string | null; phone: string } | null;
  }[]) {
    results.push({
      type: "deal",
      id: row.id,
      title: row.title,
      subtitle: row.contact?.name || row.contact?.phone || null,
    });
  }

  return results;
}
