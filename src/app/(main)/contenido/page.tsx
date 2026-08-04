import { redirect } from "next/navigation";
import { Clapperboard } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getActiveWorkspace } from "@/features/workspace/services/active-workspace";
import { PageHeader } from "@/components/page-header";

export const dynamic = "force-dynamic";

// Fase 1 del roadmap comercial: Contenido aparece ya en la navegación de
// Gestión (Ideas, Guiones, Pipeline de contenido, Teleprompter), pero su
// funcionalidad real se construye en la Fase 3 — aquí solo el destino y el
// guard de plan, con un estado vacío honesto en vez de una página rota.
export default async function ContenidoPage() {
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

  return (
    <div className="page-shell flex min-h-[calc(100vh-4rem)] max-w-none flex-col gap-6">
      <PageHeader
        eyebrow="Gestión"
        title="Contenido"
        description="Ideas, guiones, pipeline de publicación y teleprompter para tu equipo."
      />
      <div className="surface-card flex flex-col items-center gap-3 py-20 text-center">
        <Clapperboard className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
        <p className="max-w-sm text-sm text-muted-foreground">
          Todavía estamos construyendo Contenido. Muy pronto podrás crear
          ideas, guiones y planificar publicaciones desde aquí.
        </p>
      </div>
    </div>
  );
}
