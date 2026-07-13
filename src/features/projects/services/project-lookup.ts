"use server";

/**
 * project-lookup.ts — Read-only project search for the flat Tareas tab's
 * project picker (a task always hangs off a project there).
 */

import { createClient } from "@/lib/supabase/server";
import type { ProjectOption } from "@/features/projects/types";

export async function searchProjectsForTask(
  workspaceId: string,
  query: string,
): Promise<ProjectOption[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return [];

  let request = supabase
    .from("projects")
    .select("id,name")
    .eq("workspace_id", workspaceId)
    .limit(20);

  if (query.trim()) {
    request = request.ilike("name", `%${query}%`);
  }

  const { data, error } = await request;

  if (error || !data) {
    console.error("[searchProjectsForTask] Supabase error:", error?.message);
    return [];
  }

  return data as ProjectOption[];
}
