import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getActiveWorkspace } from "@/features/workspace/services/active-workspace";
import { isWhiteboardEnabled } from "@/features/whiteboard/access";
import { getWhiteboard } from "@/features/whiteboard/services/whiteboard-actions";
import { WhiteboardEditor } from "@/features/whiteboard/components/whiteboard-editor";

export const dynamic = "force-dynamic";

export default async function PizarraDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const membership = await getActiveWorkspace(supabase, user.id);
  if (!membership) redirect("/pizarra");

  const { data: workspaceFlagsRow } = await supabase
    .from("workspaces")
    .select("product_package")
    .eq("id", membership.workspace_id)
    .maybeSingle();

  if (!isWhiteboardEnabled(workspaceFlagsRow)) redirect("/pizarra");

  // RLS already scopes reads to the caller's workspace — a board from a
  // different workspace simply comes back null, same as truly not existing.
  const board = await getWhiteboard(id);
  if (!board || board.workspace_id !== membership.workspace_id) notFound();

  return <WhiteboardEditor board={board} />;
}
