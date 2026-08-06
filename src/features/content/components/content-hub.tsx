"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Lightbulb, Kanban, FileVideo } from "lucide-react";
import { LibraryToolGrid, LibraryBackButton, type LibraryToolItem } from "@/components/library-tool-grid";
import { IdeasView } from "./ideas-view";
import { ScriptsView } from "./scripts-view";
import { ContentPipeline } from "./content-pipeline";
import type { ContentItemRow } from "@/features/content/types";
import type { WorkspaceMember } from "@/features/projects/services/project-actions";

// Fase 1 (docs/CLAUDE-ARQUITECTURA-PAQUETES-NAVEGACION-IA-ASISTENTE.md §3.3):
// biblioteca en vez de pestañas siempre visibles, orden Ideas -> Pipeline ->
// Guiones, y la vista inicial pasa a ser la biblioteca (antes era Pipeline).
const VALID_VIEWS = ["ideas", "pipeline", "scripts"] as const;
type View = (typeof VALID_VIEWS)[number];

function isValidView(value: string | null): value is View {
  return value !== null && (VALID_VIEWS as readonly string[]).includes(value);
}

interface Props {
  workspaceId: string;
  items: ContentItemRow[];
  members: WorkspaceMember[];
}

export function ContentHub({ workspaceId, items, members }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const requestedView = searchParams.get("view");
  const view = isValidView(requestedView) ? requestedView : null;

  function handleSelect(next: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("view", next);
    router.push(`${pathname}?${params.toString()}`, { scroll: false });
  }

  function handleBack() {
    router.push(pathname, { scroll: false });
  }

  if (!view) {
    const libraryItems: LibraryToolItem[] = [
      { view: "ideas", label: "Ideas", description: "Ideas por explorar antes de guionizar.", icon: Lightbulb },
      { view: "pipeline", label: "Pipeline", description: "Estado de producción de cada pieza.", icon: Kanban },
      { view: "scripts", label: "Guiones", description: "Guiones listos y en marcha.", icon: FileVideo },
    ];
    return <LibraryToolGrid items={libraryItems} onSelect={handleSelect} />;
  }

  return (
    <div className="flex h-full flex-col gap-2">
      <LibraryBackButton label="Volver a herramientas de Contenido" onClick={handleBack} />

      {view === "pipeline" && <ContentPipeline workspaceId={workspaceId} items={items} members={members} />}
      {view === "ideas" && <IdeasView workspaceId={workspaceId} items={items} />}
      {view === "scripts" && <ScriptsView items={items} members={members} />}
    </div>
  );
}
