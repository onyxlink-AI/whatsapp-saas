import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getActiveWorkspace } from "@/features/workspace/services/active-workspace";
import { getDealsForBoard, listWorkspaceMembers } from "@/features/pipeline/services/deal-actions";
import { getContactSummary } from "@/features/pipeline/services/contact-lookup";
import { PipelineBoard } from "@/features/pipeline/components/pipeline-board";
import { PageHeader } from "@/components/page-header";

export const dynamic = "force-dynamic";

export default async function PipelinePage({
  searchParams,
}: {
  searchParams: Promise<{ createFor?: string; open?: string }>;
}) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const membership = await getActiveWorkspace(supabase, user.id);

  if (!membership) {
    // Super admins without a personal workspace belong in the agency panel, not a dead end.
    const { data: userRow } = await supabase
      .from("users")
      .select("is_super_admin")
      .eq("id", user.id)
      .maybeSingle();
    if (userRow?.is_super_admin) redirect("/workspaces");
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <p className="text-muted-foreground text-sm">
          No tienes una empresa activa.
        </p>
      </div>
    );
  }

  const { data: workspaceFlagsRow } = await supabase
    .from("workspaces")
    .select("whatsapp_agent_enabled, gestion_enabled")
    .eq("id", membership.workspace_id)
    .maybeSingle();

  // Pipeline is active with either product (agent or Gestión) — only blocked
  // if the workspace has neither.
  const hasEitherProduct =
    workspaceFlagsRow?.whatsapp_agent_enabled !== false ||
    workspaceFlagsRow?.gestion_enabled === true;

  if (!hasEitherProduct) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] px-6 text-center">
        <p className="text-muted-foreground text-sm max-w-sm">
          Esta empresa no tiene ningún producto activo.
        </p>
      </div>
    );
  }

  const { createFor, open } = await searchParams;

  const [deals, members, initialContact] = await Promise.all([
    getDealsForBoard(membership.workspace_id),
    listWorkspaceMembers(membership.workspace_id),
    createFor ? getContactSummary(createFor) : Promise.resolve(null),
  ]);

  return (
    <div className="page-shell flex min-h-[calc(100vh-4rem)] max-w-none flex-col gap-6">
      <PageHeader
        eyebrow="Ventas"
        title="Oportunidades"
        description="Visualiza cada oportunidad, su siguiente paso y quién se encarga de avanzarla."
      />
      <div className="min-h-0 flex-1">
        <PipelineBoard
          workspaceId={membership.workspace_id}
          initialDeals={deals}
          members={members}
          initialContact={initialContact}
          initialSelectedDealId={open ?? null}
        />
      </div>
    </div>
  );
}
