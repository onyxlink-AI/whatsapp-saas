import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  getActiveWorkspace,
  getDefaultRouteForWorkspace,
} from "@/features/workspace/services/active-workspace";
import { isOfficeVirtualEnabled } from "@/features/office-virtual/access";
import { isOfficeDemoAccount } from "@/features/office-virtual/demo-access";
import OfficeVirtualApp from "@/features/office-virtual/client/OfficeVirtualApp";

export const dynamic = "force-dynamic";

// Server-side gate: product_package se lee aquí en cada petición (Fase 2 —
// hasOfficeVirtual solo es true en el paquete Suite), así que un cliente sin
// Suite nunca puede llegar a OfficeVirtualApp escribiendo la URL a mano.
// Unlike asistente-ai/pipeline's own product gates, this
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
    .select("product_package")
    .eq("id", membership.workspace_id)
    .maybeSingle();

  if (!isOfficeVirtualEnabled(workspace)) {
    redirect(await getDefaultRouteForWorkspace(supabase, membership.workspace_id));
  }

  return (
    <div className="h-[calc(100dvh-8rem)] lg:h-[calc(100dvh-4rem)]">
      <OfficeVirtualApp
        key={membership.workspace_id}
        userEmail={user.email ?? "desconocido"}
        isSuperAdmin={isSuperAdmin}
        isDemoPresentation={isOfficeDemoAccount(user.email)}
        workspaceId={membership.workspace_id}
      />
    </div>
  );
}
