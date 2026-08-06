"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { FolderKanban, ListChecks, CalendarDays, PenTool, StickyNote } from "lucide-react";
import { LibraryToolGrid, LibraryBackButton, type LibraryToolItem } from "@/components/library-tool-grid";
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

// Fase 1 (docs/CLAUDE-ARQUITECTURA-PAQUETES-NAVEGACION-IA-ASISTENTE.md §3.2):
// Proyectos es una biblioteca — sin ?view=, un grid de tarjetas; con un
// ?view= válido, esa herramienta a pantalla completa con un botón volver.
// Oportunidades ya no vive aquí: es /pipeline, página independiente (§3.1).
const VALID_VIEWS = ["projects", "tasks", "agenda", "board", "notes"] as const;
type View = (typeof VALID_VIEWS)[number];

function isValidView(value: string | null): value is View {
  return value !== null && (VALID_VIEWS as readonly string[]).includes(value);
}

interface Props {
  workspaceId: string;
  view: View | null;
  initialProjects: ProjectWithContact[];
  members: ProjectMember[];
  initialSelectedProjectId: string | null;
  initialTasks: TaskRowType[];
  progressMap: Record<string, ProjectProgressRow>;
  initialNotes: NoteRow[];
  hasWhiteboard: boolean;
  whiteboards: WhiteboardRow[];
}

export function ProyectosHub({
  workspaceId,
  view: serverView,
  initialProjects,
  members,
  initialSelectedProjectId,
  initialTasks,
  progressMap,
  initialNotes,
  hasWhiteboard,
  whiteboards,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const requestedView = searchParams.get("view");
  // El servidor ya validó/calculó la vista para los datos que cargó — se
  // reutiliza tal cual salvo que la URL cambie client-side (navegación con
  // el grid, atrás/adelante del navegador). "board" sin hasWhiteboard nunca
  // cuenta como válida — mismo motivo que en proyectos/page.tsx: sin esto,
  // un ?view=board directo en un workspace sin Board dejaba el panel en
  // blanco en vez de caer a la biblioteca.
  const requestedViewUsable = isValidView(requestedView) && !(requestedView === "board" && !hasWhiteboard);
  const view = requestedViewUsable ? (requestedView as View) : serverView;

  function handleSelect(next: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("view", next);
    router.push(`${pathname}?${params.toString()}`, { scroll: false });
  }

  function handleBack() {
    router.push(pathname, { scroll: false });
  }

  if (!view) {
    const items: LibraryToolItem[] = [
      { view: "projects", label: "Proyectos", description: "Entregas activas y su avance.", icon: FolderKanban },
      { view: "tasks", label: "Tareas", description: "Todo lo pendiente del equipo.", icon: ListChecks },
      { view: "agenda", label: "Agenda", description: "Próximas citas y eventos.", icon: CalendarDays },
      ...(hasWhiteboard
        ? [{ view: "board", label: "Board", description: "Tableros de dibujo libre.", icon: PenTool }]
        : []),
      { view: "notes", label: "Anotaciones", description: "Notas rápidas del equipo.", icon: StickyNote },
    ];
    return <LibraryToolGrid items={items} onSelect={handleSelect} />;
  }

  return (
    <div className="flex h-full flex-col gap-2">
      <LibraryBackButton label="Volver a herramientas de Proyectos" onClick={handleBack} />

      {view === "projects" && (
        <ProjectsBoard
          workspaceId={workspaceId}
          initialProjects={initialProjects}
          members={members}
          initialSelectedProjectId={initialSelectedProjectId}
          progressMap={progressMap}
        />
      )}

      {view === "tasks" && <TasksTab workspaceId={workspaceId} initialTasks={initialTasks} members={members} />}

      {view === "agenda" && <AgendaView workspaceId={workspaceId} />}

      {view === "board" && hasWhiteboard && (
        <WhiteboardList workspaceId={workspaceId} initialBoards={whiteboards} />
      )}

      {view === "notes" && <NotesList workspaceId={workspaceId} initialNotes={initialNotes} />}
    </div>
  );
}
