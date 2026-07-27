import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  getActiveWorkspace,
  getDefaultRouteForWorkspace,
} from "@/features/workspace/services/active-workspace";
import { isChatbotEnabled } from "@/features/chatbot/access";
import ChatbotView from "@/features/chatbot/client/components/ChatbotView";

export const dynamic = "force-dynamic";

// The Chatbot is NOT client self-service — only the Onyxlink superadmin may
// configure it (see requireSuperAdmin() on the /api/workspace/[id]/chatbot
// routes). A client who types /chatbot manually is redirected away exactly
// as if the route didn't exist, mirroring /oficina-virtual's own-flag gate.
export default async function ChatbotPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const [{ data: userRow }, membership] = await Promise.all([
    supabase.from("users").select("is_super_admin").eq("id", user.id).maybeSingle(),
    getActiveWorkspace(supabase, user.id),
  ]);

  const isSuperAdmin = userRow?.is_super_admin ?? false;

  if (!membership) redirect("/onboarding");

  if (!isSuperAdmin) {
    redirect(await getDefaultRouteForWorkspace(supabase, membership.workspace_id));
  }

  const { data: workspace } = await supabase
    .from("workspaces")
    .select("chatbot_enabled")
    .eq("id", membership.workspace_id)
    .maybeSingle();

  if (!isChatbotEnabled(workspace)) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] px-6 text-center">
        <p className="text-muted-foreground text-sm max-w-sm">
          Esta empresa no incluye el Chatbot en su plan.
        </p>
      </div>
    );
  }

  return <ChatbotView workspaceId={membership.workspace_id} />;
}
