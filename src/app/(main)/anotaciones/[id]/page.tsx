import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getActiveWorkspace } from "@/features/workspace/services/active-workspace";
import { getNote } from "@/features/notes/services/note-actions";
import { NoteEditor } from "@/features/notes/components/note-editor";

export const dynamic = "force-dynamic";

export default async function NotePage({
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

  const note = await getNote(id);
  if (!note || note.workspace_id !== membership.workspace_id) notFound();

  return <NoteEditor note={note} />;
}
