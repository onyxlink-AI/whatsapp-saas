import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getActiveWorkspace } from "@/features/workspace/services/active-workspace";
import { ROLE_RANK, type WorkspaceRole } from "@/lib/auth/workspace-access";
import { listTeamMembers } from "@/features/team/services/team-actions";
import { getProjectsForBoard } from "@/features/projects/services/project-actions";
import { listTasks } from "@/features/projects/services/task-actions";
import { MiEquipoView } from "@/features/team/components/mi-equipo-view";
import { PageHeader } from "@/components/page-header";
import { resolveEntitlements } from "@/features/entitlements/resolve";
import { PlanGate } from "@/components/plan-gate";

export const dynamic = "force-dynamic";

export default async function MiEquipoPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const membership = await getActiveWorkspace(supabase, user.id);
  if (!membership) redirect("/dashboard");

  const { data: workspaceFlagsRow } = await supabase
    .from("workspaces")
    .select("product_package, human_member_limit")
    .eq("id", membership.workspace_id)
    .maybeSingle();

  if (!resolveEntitlements(workspaceFlagsRow).hasGestion) {
    return <PlanGate />;
  }

  const [members, projects, tasks, { data: activeMemberRows }] = await Promise.all([
    listTeamMembers(membership.workspace_id),
    getProjectsForBoard(membership.workspace_id),
    listTasks(membership.workspace_id),
    supabase
      .from("memberships")
      .select("user_id, users(is_super_admin)")
      .eq("workspace_id", membership.workspace_id)
      .eq("is_active", true),
  ]);

  const seatsUsed = (
    (activeMemberRows ?? []) as unknown as Array<{ users: { is_super_admin: boolean | null } | null }>
  ).filter((row) => !row.users?.is_super_admin).length;

  const canManage =
    ROLE_RANK[membership.role as WorkspaceRole] >= ROLE_RANK.manager;

  return (
    <div className="page-shell flex min-h-[calc(100vh-4rem)] max-w-none flex-col gap-6">
      <PageHeader
        eyebrow="Empresa"
        title="Mi equipo"
        description="Quién forma parte del panel, sus roles y en qué proyectos y tareas participan."
      />
      <MiEquipoView
        workspaceId={membership.workspace_id}
        initialMembers={members}
        projects={projects.map((p) => ({ id: p.id, name: p.name, responsible_id: p.responsible_id }))}
        tasks={tasks.map((t) => ({ id: t.id, title: t.title, status: t.status, assigned_to: t.assigned_to }))}
        canManage={canManage}
        seatsUsed={seatsUsed}
        seatsLimit={workspaceFlagsRow?.human_member_limit ?? 1}
      />
    </div>
  );
}
