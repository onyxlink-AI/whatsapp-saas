"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { NotesList } from "@/features/notes/components/notes-list";
import { ProjectsBoard } from "./projects-board";
import { TasksTab } from "./tasks-tab";
import { AgendaView } from "./agenda-view";
import type { WorkspaceMember as ProjectMember } from "@/features/projects/services/project-actions";
import type {
  NoteRow,
  ProjectProgressRow,
  ProjectWithContact,
  TaskRow as TaskRowType,
} from "@/features/projects/types";
import { WhiteboardList } from "@/features/whiteboard/components/whiteboard-list";
import type { WhiteboardRow } from "@/features/whiteboard/types";
import { PipelineBoard } from "@/features/pipeline/components/pipeline-board";
import type { WorkspaceMember as PipelineMember } from "@/features/pipeline/services/deal-actions";
import type { ContactSummary, DealWithContact } from "@/features/pipeline/types";

// Fase 1 del roadmap comercial: Proyectos es el centro de trabajo de
// Gestión — Pipeline y Board (Pizarra) viven aquí como vistas, no como
// páginas propias. La vista activa persiste en la URL (?view=) para que
// enlaces directos y los botones anterior/siguiente del navegador funcionen.
const VALID_VIEWS = [
  "projects",
  "tasks",
  "agenda",
  "board",
  "notes",
  "pipeline",
] as const;
type View = (typeof VALID_VIEWS)[number];

function isValidView(value: string | null): value is View {
  return value !== null && (VALID_VIEWS as readonly string[]).includes(value);
}

interface Props {
  workspaceId: string;
  defaultView: View;
  initialProjects: ProjectWithContact[];
  members: ProjectMember[];
  initialSelectedProjectId: string | null;
  initialTasks: TaskRowType[];
  progressMap: Record<string, ProjectProgressRow>;
  initialNotes: NoteRow[];
  hasWhiteboard: boolean;
  whiteboards: WhiteboardRow[];
  hasPipeline: boolean;
  initialDeals: DealWithContact[];
  pipelineMembers: PipelineMember[];
  initialContact: ContactSummary | null;
  initialSelectedDealId: string | null;
}

export function ProyectosHub({
  workspaceId,
  defaultView,
  initialProjects,
  members,
  initialSelectedProjectId,
  initialTasks,
  progressMap,
  initialNotes,
  hasWhiteboard,
  whiteboards,
  hasPipeline,
  initialDeals,
  pipelineMembers,
  initialContact,
  initialSelectedDealId,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const requestedView = searchParams.get("view");
  const view = isValidView(requestedView) ? requestedView : defaultView;

  function handleViewChange(next: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("view", next);
    router.push(`${pathname}?${params.toString()}`, { scroll: false });
  }

  return (
    <Tabs value={view} onValueChange={handleViewChange} className="flex flex-col h-full">
      <TabsList className="surface-card h-11 max-w-full justify-start overflow-x-auto bg-card p-1">
        <TabsTrigger value="projects">📋 Proyectos</TabsTrigger>
        <TabsTrigger value="tasks">✅ Tareas</TabsTrigger>
        <TabsTrigger value="agenda">📅 Agenda</TabsTrigger>
        {hasWhiteboard && <TabsTrigger value="board">✏️ Board</TabsTrigger>}
        <TabsTrigger value="notes">📝 Anotaciones</TabsTrigger>
        {hasPipeline && <TabsTrigger value="pipeline">💼 Oportunidades</TabsTrigger>}
      </TabsList>

      <TabsContent value="projects" className="flex-1 mt-3">
        <ProjectsBoard
          workspaceId={workspaceId}
          initialProjects={initialProjects}
          members={members}
          initialSelectedProjectId={initialSelectedProjectId}
          progressMap={progressMap}
        />
      </TabsContent>

      <TabsContent value="tasks" className="flex-1 mt-3">
        <TasksTab workspaceId={workspaceId} initialTasks={initialTasks} members={members} />
      </TabsContent>

      <TabsContent value="agenda" className="flex-1 mt-3">
        <AgendaView workspaceId={workspaceId} />
      </TabsContent>

      {hasWhiteboard && (
        <TabsContent value="board" className="flex-1 mt-3">
          <WhiteboardList workspaceId={workspaceId} initialBoards={whiteboards} />
        </TabsContent>
      )}

      <TabsContent value="notes" className="flex-1 mt-3">
        <NotesList workspaceId={workspaceId} initialNotes={initialNotes} />
      </TabsContent>

      {hasPipeline && (
        <TabsContent value="pipeline" className="flex-1 mt-3">
          <PipelineBoard
            workspaceId={workspaceId}
            initialDeals={initialDeals}
            members={pipelineMembers}
            initialContact={initialContact}
            initialSelectedDealId={initialSelectedDealId}
          />
        </TabsContent>
      )}
    </Tabs>
  );
}
