import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getActiveWorkspace } from "@/features/workspace/services/active-workspace";
import {
  getProjectsForBoard,
  getProjectsProgress,
  listWorkspaceMembers,
} from "@/features/projects/services/project-actions";
import { listTasks } from "@/features/projects/services/task-actions";
import { listNotes } from "@/features/notes/services/note-actions";
import { listWhiteboards } from "@/features/whiteboard/services/whiteboard-actions";
import { ProyectosHub } from "@/features/projects/components/proyectos-hub";
import { PageHeader } from "@/components/page-header";
import { resolveEntitlements } from "@/features/entitlements/resolve";
import { PlanGate } from "@/components/plan-gate";

export const dynamic = "force-dynamic";

const VALID_VIEWS = ["projects", "tasks", "agenda", "board", "notes"] as const;
type View = (typeof VALID_VIEWS)[number];

export default async function ProyectosPage({
  searchParams,
}: {
  searchParams: Promise<{
    view?: string;
    open?: string;
    openDeal?: string;
    createFor?: string;
  }>;
}) {
  const { view: rawView, open, openDeal, createFor } = await searchParams;

  // Compat (Fase 1, docs/CLAUDE-ARQUITECTURA-PAQUETES-NAVEGACION-IA-ASISTENTE.md
  // §3.1): Oportunidades ya no vive dentro de Proyectos — enlaces/favoritos
  // viejos a ?view=pipeline redirigen a la página independiente,
  // trasladando los mismos parámetros que ya acepta /pipeline
  // (openDeal -> open, createFor tal cual).
  if (rawView === "pipeline") {
    const params = new URLSearchParams();
    if (openDeal) params.set("open", openDeal);
    if (createFor) params.set("createFor", createFor);
    const qs = params.toString();
    redirect(qs ? `/pipeline?${qs}` : "/pipeline");
  }

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

  const entitlements = resolveEntitlements(workspaceFlagsRow);

  if (!entitlements.hasGestion) {
    return <PlanGate />;
  }

  const hasWhiteboard = entitlements.hasWhiteboard;

  // Fase 1 (§3.2): sin vista seleccionada se muestra la biblioteca, que no
  // necesita ninguno de los datos de abajo — null en vez de un valor por
  // defecto como "projects". "board" solo cuenta como vista válida si el
  // workspace tiene Board contratado — sin esta comprobación, un enlace
  // directo a ?view=board en un workspace sin Board renderizaba el botón
  // "volver" con el panel completamente en blanco en vez de caer a la
  // biblioteca (detectado en la revisión visual de Fase 1).
  const isKnownView = Boolean(rawView && (VALID_VIEWS as readonly string[]).includes(rawView));
  const view: View | null = isKnownView && !(rawView === "board" && !hasWhiteboard) ? (rawView as View) : null;

  // Cada vista es una tabla/consulta independiente (confirmado: ProjectsBoard,
  // TasksTab, NotesList y WhiteboardList no comparten props entre sí) — solo
  // se ejecuta la consulta de la vista activa. members es la excepción: es
  // ligera y la usan varias vistas, así que se mantiene siempre.
  const [members, projects, progressMap, tasks, notes, whiteboards] = await Promise.all([
    listWorkspaceMembers(membership.workspace_id),
    view === "projects" ? getProjectsForBoard(membership.workspace_id) : Promise.resolve([]),
    view === "projects" ? getProjectsProgress(membership.workspace_id) : Promise.resolve({}),
    view === "tasks" ? listTasks(membership.workspace_id) : Promise.resolve([]),
    view === "notes" ? listNotes(membership.workspace_id) : Promise.resolve([]),
    view === "board" && hasWhiteboard ? listWhiteboards(membership.workspace_id) : Promise.resolve([]),
  ]);

  return (
    <div className="page-shell flex min-h-[calc(100vh-4rem)] max-w-none flex-col gap-6">
      <PageHeader
        eyebrow="Operaciones"
        title="Proyectos"
        description="Organiza entregas, tareas, agenda y anotaciones sin perder de vista el avance del equipo."
      />
      <ProyectosHub
        workspaceId={membership.workspace_id}
        view={view}
        initialProjects={projects}
        members={members}
        initialSelectedProjectId={open ?? null}
        initialTasks={tasks}
        progressMap={progressMap}
        initialNotes={notes}
        hasWhiteboard={hasWhiteboard}
        whiteboards={whiteboards}
      />
    </div>
  );
}
