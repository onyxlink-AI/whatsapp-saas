import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  getActiveWorkspace,
  getDefaultRouteForWorkspace,
} from "@/features/workspace/services/active-workspace";
import { isOfficeVirtualEnabled } from "@/features/office-virtual/access";
import OfficeVirtualApp from "@/features/office-virtual/client/OfficeVirtualApp";

export const dynamic = "force-dynamic";

// Server-side gate: office_virtual_enabled is read here on every request, so
// a client who has it disabled can never reach OfficeVirtualApp by typing
// the URL directly. Unlike asistente-ai/pipeline's own product gates, this
// one does not render an explanatory screen when the flag is off — the
// route itself redirects to that workspace's real default route, exactly
// as if /oficina-virtual didn't exist for that client.
export default async function OficinaVirtualPage() {
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

  const { data: workspace } = await supabase
    .from("workspaces")
    .select("office_virtual_enabled")
    .eq("id", membership.workspace_id)
    .maybeSingle();

  if (!isOfficeVirtualEnabled(workspace)) {
    redirect(await getDefaultRouteForWorkspace(supabase, membership.workspace_id));
  }

  return (
    <div className="h-full">
      <OfficeVirtualApp
        key={membership.workspace_id}
        userEmail={user.email ?? "desconocido"}
        isSuperAdmin={isSuperAdmin}
        workspaceId={membership.workspace_id}
      />
    </div>
  );
}
