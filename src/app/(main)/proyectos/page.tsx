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
import { isWhiteboardEnabled } from "@/features/whiteboard/access";
import {
  getDealsForBoard,
  listWorkspaceMembers as listPipelineMembers,
} from "@/features/pipeline/services/deal-actions";
import { getContactSummary } from "@/features/pipeline/services/contact-lookup";
import { ProyectosHub } from "@/features/projects/components/proyectos-hub";
import { PageHeader } from "@/components/page-header";

export const dynamic = "force-dynamic";

const VALID_VIEWS = ["projects", "tasks", "agenda", "board", "notes", "pipeline"] as const;
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
    .select("gestion_enabled, whatsapp_agent_enabled, whiteboard_enabled")
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

  const { view, open, openDeal, createFor } = await searchParams;

  const hasWhiteboard = isWhiteboardEnabled(workspaceFlagsRow);
  // Gestión ya implica el agente de WhatsApp o no (chk_whatsapp_requires_gestion
  // exige lo contrario: WhatsApp siempre implica Gestión) — Oportunidades se
  // muestra con cualquiera de los dos productos, igual que antes en /pipeline.
  const hasPipeline =
    workspaceFlagsRow?.whatsapp_agent_enabled !== false ||
    workspaceFlagsRow?.gestion_enabled === true;

  const defaultView: View =
    view && (VALID_VIEWS as readonly string[]).includes(view) ? (view as View) : "projects";

  const [projects, members, tasks, progressMap, notes, whiteboards, deals, pipelineMembers, initialContact] =
    await Promise.all([
      getProjectsForBoard(membership.workspace_id),
      listWorkspaceMembers(membership.workspace_id),
      listTasks(membership.workspace_id),
      getProjectsProgress(membership.workspace_id),
      listNotes(membership.workspace_id),
      hasWhiteboard ? listWhiteboards(membership.workspace_id) : Promise.resolve([]),
      hasPipeline ? getDealsForBoard(membership.workspace_id) : Promise.resolve([]),
      hasPipeline ? listPipelineMembers(membership.workspace_id) : Promise.resolve([]),
      hasPipeline && createFor ? getContactSummary(createFor) : Promise.resolve(null),
    ]);

  return (
    <div className="page-shell flex min-h-[calc(100vh-4rem)] max-w-none flex-col gap-6">
      <PageHeader
        eyebrow="Operaciones"
        title="Proyectos"
        description="Organiza entregas, tareas, agenda y oportunidades sin perder de vista el avance del equipo."
      />
      <ProyectosHub
        workspaceId={membership.workspace_id}
        defaultView={defaultView}
        initialProjects={projects}
        members={members}
        initialSelectedProjectId={open ?? null}
        initialTasks={tasks}
        progressMap={progressMap}
        initialNotes={notes}
        hasWhiteboard={hasWhiteboard}
        whiteboards={whiteboards}
        hasPipeline={hasPipeline}
        initialDeals={deals}
        pipelineMembers={pipelineMembers}
        initialContact={initialContact}
        initialSelectedDealId={openDeal ?? null}
      />
    </div>
  );
}
