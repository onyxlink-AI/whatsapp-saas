import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getActiveWorkspace } from "@/features/workspace/services/active-workspace";
import {
  getProjectsForBoard,
  listWorkspaceMembers,
} from "@/features/projects/services/project-actions";
import { listTasks } from "@/features/projects/services/task-actions";
import { ProjectsBoard } from "@/features/projects/components/projects-board";
import { TasksTab } from "@/features/projects/components/tasks-tab";
import { AgendaView } from "@/features/projects/components/agenda-view";
import { listWhiteboards } from "@/features/whiteboard/services/whiteboard-actions";
import { WhiteboardList } from "@/features/whiteboard/components/whiteboard-list";
import { isWhiteboardEnabled } from "@/features/whiteboard/access";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { PageHeader } from "@/components/page-header";

export const dynamic = "force-dynamic";

export default async function ProyectosPage({
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
    .select("gestion_enabled, whiteboard_enabled")
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

  const hasWhiteboard = isWhiteboardEnabled(workspaceFlagsRow);

  const [projects, members, tasks, whiteboards] = await Promise.all([
    getProjectsForBoard(membership.workspace_id),
    listWorkspaceMembers(membership.workspace_id),
    listTasks(membership.workspace_id),
    hasWhiteboard ? listWhiteboards(membership.workspace_id) : Promise.resolve([]),
  ]);

  return (
    <div className="page-shell flex min-h-[calc(100vh-4rem)] max-w-none flex-col gap-6">
      <PageHeader
        eyebrow="Operaciones"
        title="Proyectos"
        description="Organiza entregas, tareas y agenda sin perder de vista el avance del equipo."
      />
      <Tabs defaultValue="tablero" className="flex flex-col h-full">
        <TabsList className="surface-card h-11 max-w-full justify-start overflow-x-auto bg-card p-1">
          <TabsTrigger value="tablero">📋 Tablero</TabsTrigger>
          <TabsTrigger value="tareas">✅ Tareas</TabsTrigger>
          <TabsTrigger value="agenda">📅 Agenda</TabsTrigger>
          {hasWhiteboard && <TabsTrigger value="pizarra">✏️ Pizarra</TabsTrigger>}
        </TabsList>

        <TabsContent value="tablero" className="flex-1 mt-3">
          <ProjectsBoard
            workspaceId={membership.workspace_id}
            initialProjects={projects}
            members={members}
            initialSelectedProjectId={open ?? null}
          />
        </TabsContent>

        <TabsContent value="tareas" className="flex-1 mt-3">
          <TasksTab
            workspaceId={membership.workspace_id}
            initialTasks={tasks}
            members={members}
          />
        </TabsContent>

        <TabsContent value="agenda" className="flex-1 mt-3">
          <AgendaView workspaceId={membership.workspace_id} />
        </TabsContent>

        {hasWhiteboard && (
          <TabsContent value="pizarra" className="flex-1 mt-3">
            <WhiteboardList
              workspaceId={membership.workspace_id}
              initialBoards={whiteboards}
            />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
