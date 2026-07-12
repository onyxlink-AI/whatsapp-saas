import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getActiveWorkspace } from "@/features/workspace/services/active-workspace";
import { getVoiceCallMetrics, listVoiceCalls } from "@/features/voice-agent/services/voice-calls";
import { VoiceAgentDashboard } from "@/features/voice-agent/components/voice-agent-dashboard";

export const dynamic = "force-dynamic";

export default async function AsistenteAiPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const membership = await getActiveWorkspace(supabase, user.id);

  if (!membership) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <p className="text-muted-foreground text-sm">No tienes un workspace activo.</p>
      </div>
    );
  }

  const { data: workspace } = await supabase
    .from("workspaces")
    .select("vapi_assistant_id")
    .eq("id", membership.workspace_id)
    .maybeSingle();

  if (!workspace?.vapi_assistant_id) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] px-6 text-center">
        <p className="text-muted-foreground text-sm max-w-sm">
          Este workspace no tiene un agente de voz vinculado. Un administrador
          puede vincularlo en Settings → Negocio.
        </p>
      </div>
    );
  }

  const [metrics, callsPage] = await Promise.all([
    getVoiceCallMetrics(membership.workspace_id),
    listVoiceCalls(membership.workspace_id, { limit: 20, offset: 0 }),
  ]);

  return (
    <VoiceAgentDashboard
      workspaceId={membership.workspace_id}
      metrics={metrics}
      initialCalls={callsPage.rows}
      initialTotal={callsPage.total}
    />
  );
}
