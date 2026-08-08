import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getActiveWorkspace } from "@/features/workspace/services/active-workspace";
import { listClients } from "@/features/clients/services/client-actions";
import { ClientsTable } from "@/features/clients/components/clients-table";
import { PageHeader } from "@/components/page-header";
import { resolveEntitlements } from "@/features/entitlements/resolve";
import { PlanGate } from "@/components/plan-gate";

export const dynamic = "force-dynamic";

export default async function ClientesPage({
  searchParams,
}: {
  searchParams: Promise<{ open?: string }>;
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

  const { open } = await searchParams;
  const clients = await listClients(membership.workspace_id);

  return (
    <div className="page-shell flex min-h-[calc(100vh-4rem)] max-w-none flex-col gap-6">
      <PageHeader
        eyebrow="Gestión comercial"
        title="Clientes"
        description="Toda la información y el historial de tus clientes, ordenados en un solo lugar."
      />
      <div className="surface-card min-h-0 flex-1 p-4 sm:p-5">
        <ClientsTable
          workspaceId={membership.workspace_id}
          initialClients={clients}
          initialOpenClientId={open ?? null}
        />
      </div>
    </div>
  );
}
