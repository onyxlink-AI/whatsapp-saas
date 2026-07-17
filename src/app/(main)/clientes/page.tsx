import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getActiveWorkspace } from "@/features/workspace/services/active-workspace";
import { listClients } from "@/features/clients/services/client-actions";
import { ClientsTable } from "@/features/clients/components/clients-table";

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
    .select("gestion_enabled")
    .eq("id", membership.workspace_id)
    .maybeSingle();

  if (workspaceFlagsRow?.gestion_enabled !== true) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] px-6 text-center">
        <p className="text-muted-foreground text-sm max-w-sm">
          Esta sección no está incluida en tu plan. Pregúntale a tu gestor de Onyxlink.
        </p>
      </div>
    );
  }

  const { open } = await searchParams;
  const clients = await listClients(membership.workspace_id);

  return (
    <div className="p-4 sm:p-6 h-full flex flex-col">
      <ClientsTable
        workspaceId={membership.workspace_id}
        initialClients={clients}
        initialOpenClientId={open ?? null}
      />
    </div>
  );
}
