import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getActiveWorkspace } from "@/features/workspace/services/active-workspace";
import { listWorkspaceMembers } from "@/features/projects/services/project-actions";
import { listMyChannels, listTeammates } from "@/features/team-chat/services/team-chat-actions";
import { TeamChatShell } from "@/features/team-chat/components/team-chat-shell";
import { PageHeader } from "@/components/page-header";

export const dynamic = "force-dynamic";

export default async function ChatPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const membership = await getActiveWorkspace(supabase, user.id);
  if (!membership) redirect("/dashboard");

  const { data: workspaceRow } = await supabase
    .from("workspaces")
    .select("team_chat_enabled")
    .eq("id", membership.workspace_id)
    .maybeSingle();

  if (workspaceRow?.team_chat_enabled !== true) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] px-6 text-center">
        <p className="text-muted-foreground text-sm max-w-sm">
          El Chat de equipo no está incluido en tu plan. Pregúntale a tu gestor de Onyxlink.
        </p>
      </div>
    );
  }

  const [channels, teammates, members] = await Promise.all([
    listMyChannels(membership.workspace_id),
    listTeammates(membership.workspace_id),
    listWorkspaceMembers(membership.workspace_id),
  ]);

  return (
    <div className="page-shell flex min-h-[calc(100vh-4rem)] max-w-none flex-col gap-4">
      <PageHeader
        eyebrow="Trabajo diario"
        title="Chat de equipo"
        description="Mensajería interna instantánea — General y mensajes directos."
      />
      <TeamChatShell
        workspaceId={membership.workspace_id}
        currentUserId={user.id}
        initialChannels={channels}
        teammates={teammates}
        members={members}
      />
    </div>
  );
}
