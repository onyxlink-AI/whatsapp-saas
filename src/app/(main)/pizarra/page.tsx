import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getActiveWorkspace } from "@/features/workspace/services/active-workspace";
import { isWhiteboardEnabled } from "@/features/whiteboard/access";
import { listWhiteboards } from "@/features/whiteboard/services/whiteboard-actions";
import { WhiteboardList } from "@/features/whiteboard/components/whiteboard-list";
import { PageHeader } from "@/components/page-header";

export const dynamic = "force-dynamic";

export default async function PizarraPage() {
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
    .select("whiteboard_enabled")
    .eq("id", membership.workspace_id)
    .maybeSingle();

  if (!isWhiteboardEnabled(workspaceFlagsRow)) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] px-6 text-center">
        <p className="text-muted-foreground text-sm max-w-sm">
          Esta sección no está incluida en tu plan. Pregúntale a tu gestor de Onyxlink.
        </p>
      </div>
    );
  }

  const boards = await listWhiteboards(membership.workspace_id);

  return (
    <div className="page-shell flex min-h-[calc(100vh-4rem)] max-w-none flex-col gap-6">
      <PageHeader
        eyebrow="Gestión"
        title="Pizarra"
        description="Tableros para diagramas y dibujo libre, compartidos con tu equipo."
      />
      <WhiteboardList workspaceId={membership.workspace_id} initialBoards={boards} />
    </div>
  );
}
