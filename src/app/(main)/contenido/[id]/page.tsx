import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getActiveWorkspace } from "@/features/workspace/services/active-workspace";
import { getContentItem } from "@/features/content/services/content-actions";
import { getProject, listWorkspaceMembers } from "@/features/projects/services/project-actions";
import { ContentEditor } from "@/features/content/components/content-editor";

export const dynamic = "force-dynamic";

export default async function ContentItemPage({
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
  if (!membership) redirect("/dashboard");

  const item = await getContentItem(id);
  if (!item || item.workspace_id !== membership.workspace_id) notFound();

  const [members, project] = await Promise.all([
    listWorkspaceMembers(membership.workspace_id),
    item.project_id ? getProject(item.project_id) : Promise.resolve(null),
  ]);

  return (
    <ContentEditor
      workspaceId={membership.workspace_id}
      item={item}
      members={members}
      initialProject={project ? { id: project.id, name: project.name } : null}
    />
  );
}
