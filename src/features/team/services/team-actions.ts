"use server";

/**
 * team-actions.ts — read-only server fetch for Mi equipo's initial load.
 * Mutations (invite/role/activate/deactivate) go through the existing
 * `/api/workspace/[id]/team` route (role-ranked authorization already lives
 * there) — this only mirrors its GET query for a Server Component's first
 * paint, same split as project-actions.ts (server fetch + client actions).
 */

import { createClient } from "@/lib/supabase/server";
import type { TeamMember } from "@/features/team/types";

export async function listTeamMembers(workspaceId: string): Promise<TeamMember[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return [];

  const { data, error } = await supabase
    .from("memberships")
    .select("id, user_id, role, is_active, created_at, users(full_name, email)")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: true });

  if (error || !data) {
    console.error("[listTeamMembers] Supabase error:", error?.message);
    return [];
  }

  // Same nested-select type-sync caveat as project-actions.ts.
  return (
    data as unknown as Array<{
      id: string;
      user_id: string;
      role: TeamMember["role"];
      is_active: boolean;
      created_at: string;
      users: { full_name: string | null; email: string } | null;
    }>
  ).map((row) => ({
    id: row.id,
    user_id: row.user_id,
    email: row.users?.email ?? "",
    full_name: row.users?.full_name ?? null,
    role: row.role,
    is_active: row.is_active,
    created_at: row.created_at,
  }));
}
