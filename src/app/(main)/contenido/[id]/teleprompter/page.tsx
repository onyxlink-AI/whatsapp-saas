import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getActiveWorkspace } from "@/features/workspace/services/active-workspace";
import { getContentItem } from "@/features/content/services/content-actions";
import { Teleprompter } from "@/features/content/components/teleprompter";

export const dynamic = "force-dynamic";

export default async function TeleprompterPage({
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

  return <Teleprompter item={item} />;
}
