import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getActiveWorkspace } from "@/features/workspace/services/active-workspace";
import { getDealsForBoard, listWorkspaceMembers } from "@/features/pipeline/services/deal-actions";
import { getContactSummary } from "@/features/pipeline/services/contact-lookup";
import { PipelineBoard } from "@/features/pipeline/components/pipeline-board";

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
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <p className="text-muted-foreground text-sm">
          No encontramos tu negocio. Pídele acceso a quien te invitó.
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
          Tu cuenta todavía no tiene ningún plan activo. Pregúntale a tu gestor de Onyxlink.
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
    <div className="p-4 sm:p-6 h-full flex flex-col">
      <PipelineBoard
        workspaceId={membership.workspace_id}
        initialDeals={deals}
        members={members}
        initialContact={initialContact}
        initialSelectedDealId={open ?? null}
      />
    </div>
  );
}
