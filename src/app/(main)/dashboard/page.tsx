import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getActiveWorkspace } from "@/features/workspace/services/active-workspace";
import {
  getWorkspaceMetrics,
  getRecentConversations,
  getMessageVolumeSeries,
  getConversationStateBreakdown,
} from "@/features/dashboard/services/metrics";
import { DashboardMetrics } from "@/features/dashboard/components/dashboard-metrics";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
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
          No tienes un workspace activo.
        </p>
      </div>
    );
  }

  const { data: workspaceFlagsRow } = await supabase
    .from("workspaces")
    .select("whatsapp_agent_enabled")
    .eq("id", membership.workspace_id)
    .maybeSingle();

  if (workspaceFlagsRow?.whatsapp_agent_enabled === false) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] px-6 text-center">
        <p className="text-muted-foreground text-sm max-w-sm">
          Este workspace no incluye Dashboard — tu plan es Onyxlink Gestión.
        </p>
      </div>
    );
  }

  const [metrics, recentConversations, messageVolume, conversationStates] =
    await Promise.all([
      getWorkspaceMetrics(membership.workspace_id),
      getRecentConversations(membership.workspace_id, 5),
      getMessageVolumeSeries(membership.workspace_id, 14),
      getConversationStateBreakdown(membership.workspace_id),
    ]);

  return (
    <DashboardMetrics
      metrics={metrics}
      recentConversations={recentConversations}
      messageVolume={messageVolume}
      conversationStates={conversationStates}
    />
  );
}
