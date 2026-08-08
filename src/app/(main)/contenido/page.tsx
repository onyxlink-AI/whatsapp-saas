import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getActiveWorkspace } from "@/features/workspace/services/active-workspace";
import { listContentItems } from "@/features/content/services/content-actions";
import { listWorkspaceMembers } from "@/features/projects/services/project-actions";
import { ContentHub } from "@/features/content/components/content-hub";
import { PageHeader } from "@/components/page-header";
import { resolveEntitlements } from "@/features/entitlements/resolve";
import { PlanGate } from "@/components/plan-gate";

export const dynamic = "force-dynamic";

const VALID_VIEWS = ["ideas", "pipeline", "scripts"] as const;

// Fase 3 del roadmap comercial: Contenido queda completo — Ideas, Guiones y
// Pipeline sobre la misma tabla content_items (una idea es una fila en
// status='idea'; "convertir a guion" solo avanza el status).
export default async function ContenidoPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const { view } = await searchParams;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const membership = await getActiveWorkspace(supabase, user.id);

  if (!membership) {
    const { data: userRow } = await supabase
      .from("users")
      .select("is_super_admin")
      .eq("id", user.id)
      .maybeSingle();
    if (userRow?.is_super_admin) redirect("/workspaces");
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
    .select("product_package")
    .eq("id", membership.workspace_id)
    .maybeSingle();

  if (!resolveEntitlements(workspaceFlagsRow).hasGestion) {
    return <PlanGate />;
  }

  // Fase 1 (§3.2): en la biblioteca (sin ?view= válido) no hace falta
  // ningún content_item — las 3 vistas son filtros sobre la misma tabla,
  // así que basta con una condición, no una consulta por vista.
  const hasView = Boolean(view && (VALID_VIEWS as readonly string[]).includes(view));

  const [items, members] = await Promise.all([
    hasView ? listContentItems(membership.workspace_id) : Promise.resolve([]),
    listWorkspaceMembers(membership.workspace_id),
  ]);

  return (
    <div className="page-shell flex min-h-[calc(100vh-4rem)] max-w-none flex-col gap-6">
      <PageHeader
        eyebrow="Gestión"
        title="Contenido"
        description="Ideas, guiones, pipeline de publicación y teleprompter para tu equipo."
      />
      <ContentHub workspaceId={membership.workspace_id} items={items} members={members} />
    </div>
  );
}
