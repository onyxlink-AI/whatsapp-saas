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
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";

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

  const [projects, members, tasks] = await Promise.all([
    getProjectsForBoard(membership.workspace_id),
    listWorkspaceMembers(membership.workspace_id),
    listTasks(membership.workspace_id),
  ]);

  return (
    <div className="p-4 sm:p-6 h-full flex flex-col">
      <Tabs defaultValue="tablero" className="flex flex-col h-full">
        <TabsList className="w-fit">
          <TabsTrigger value="tablero">📋 Tablero</TabsTrigger>
          <TabsTrigger value="tareas">✅ Tareas</TabsTrigger>
          <TabsTrigger value="agenda">📅 Agenda</TabsTrigger>
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
      </Tabs>
    </div>
  );
}
