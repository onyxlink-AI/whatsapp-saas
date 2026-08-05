"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { IdeasView } from "./ideas-view";
import { ScriptsView } from "./scripts-view";
import { ContentPipeline } from "./content-pipeline";
import type { ContentItemRow } from "@/features/content/types";
import type { WorkspaceMember } from "@/features/projects/services/project-actions";

const VALID_VIEWS = ["ideas", "scripts", "pipeline"] as const;
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
  const view = isValidView(requestedView) ? requestedView : "pipeline";

  function handleViewChange(next: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("view", next);
    router.push(`${pathname}?${params.toString()}`, { scroll: false });
  }

  return (
    <Tabs value={view} onValueChange={handleViewChange} className="flex flex-col h-full">
      <TabsList className="surface-card h-11 max-w-full justify-start overflow-x-auto bg-card p-1">
        <TabsTrigger value="pipeline">🗂️ Pipeline</TabsTrigger>
        <TabsTrigger value="ideas">💡 Ideas</TabsTrigger>
        <TabsTrigger value="scripts">🎬 Guiones</TabsTrigger>
      </TabsList>

      <TabsContent value="pipeline" className="flex-1 mt-3">
        <ContentPipeline workspaceId={workspaceId} items={items} members={members} />
      </TabsContent>

      <TabsContent value="ideas" className="flex-1 mt-3">
        <IdeasView workspaceId={workspaceId} items={items} />
      </TabsContent>

      <TabsContent value="scripts" className="flex-1 mt-3">
        <ScriptsView items={items} members={members} />
      </TabsContent>
    </Tabs>
  );
}
