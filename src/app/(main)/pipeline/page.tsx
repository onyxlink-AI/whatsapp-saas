import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getActiveWorkspace } from "@/features/workspace/services/active-workspace";
import { getDealsForBoard, listWorkspaceMembers } from "@/features/pipeline/services/deal-actions";
import { listTasks } from "@/features/pipeline/services/task-actions";
import { getContactSummary } from "@/features/pipeline/services/contact-lookup";
import { getContactsWithDealSuggestions } from "@/features/pipeline/services/deal-suggestion-actions";
import { PipelineBoard } from "@/features/pipeline/components/pipeline-board";
import { TaskList } from "@/features/pipeline/components/task-list";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";

export const dynamic = "force-dynamic";

export default async function PipelinePage({
  searchParams,
}: {
  searchParams: Promise<{ createFor?: string }>;
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
          No tienes un workspace activo.
        </p>
      </div>
    );
  }

  const { createFor } = await searchParams;

  const [deals, tasks, members, initialContact, dealSuggestions] =
    await Promise.all([
      getDealsForBoard(membership.workspace_id),
      listTasks(membership.workspace_id),
      listWorkspaceMembers(membership.workspace_id),
      createFor ? getContactSummary(createFor) : Promise.resolve(null),
      getContactsWithDealSuggestions(membership.workspace_id),
    ]);

  return (
    <div className="p-4 sm:p-6 h-full flex flex-col">
      <Tabs defaultValue="pipeline" className="flex flex-col h-full">
        <TabsList className="w-fit">
          <TabsTrigger value="pipeline">Pipeline</TabsTrigger>
          <TabsTrigger value="tasks">Tareas</TabsTrigger>
        </TabsList>

        <TabsContent value="pipeline" className="flex-1 mt-3">
          <PipelineBoard
            workspaceId={membership.workspace_id}
            initialDeals={deals}
            members={members}
            initialContact={initialContact}
            initialDealSuggestions={dealSuggestions}
          />
        </TabsContent>

        <TabsContent value="tasks" className="flex-1 mt-3">
          <TaskList
            workspaceId={membership.workspace_id}
            initialTasks={tasks}
            members={members}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
