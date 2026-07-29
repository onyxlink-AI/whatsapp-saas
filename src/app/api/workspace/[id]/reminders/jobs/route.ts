import { NextRequest, NextResponse } from "next/server";
import { createClient as createSbClient } from "@supabase/supabase-js";
import { requireWorkspaceMember } from "@/lib/auth/workspace-access";

function svc() {
  return createSbClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

// GET /api/workspace/[id]/reminders/jobs — "Historial de mensajes" for the
// Recordatorios y seguimiento screen (scheduled/sent/responded/cancelled/
// error/needs_attention). Read-only; the engine itself is the only writer.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: workspaceId } = await params;
  const auth = await requireWorkspaceMember(workspaceId);
  if (!auth.ok) return auth.response;

  const limitParam = Number(req.nextUrl.searchParams.get("limit") ?? "50");
  const limit = Number.isFinite(limitParam) ? Math.min(Math.max(limitParam, 1), 200) : 50;

  const db = svc();
  const { data: jobs, error } = await db
    .from("reminder_jobs")
    .select(
      "id, appointment_id, step_key, contact_id, status, scheduled_for, attempts, cancel_reason, error_detail, sent_at, created_at",
    )
    .eq("workspace_id", workspaceId)
    .order("scheduled_for", { ascending: false })
    .limit(limit);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const contactIds = Array.from(
    new Set((jobs ?? []).map((j) => j.contact_id).filter((v): v is string => Boolean(v))),
  );
  const { data: contacts } = contactIds.length
    ? await db.from("contacts").select("id, name, phone").in("id", contactIds)
    : { data: [] };
  const contactById = new Map(
    (contacts ?? []).map((c) => [c.id as string, c as { id: string; name: string | null; phone: string }]),
  );

  return NextResponse.json({
    jobs: (jobs ?? []).map((j) => ({
      ...j,
      contact_name: j.contact_id ? contactById.get(j.contact_id)?.name ?? null : null,
      contact_phone: j.contact_id ? contactById.get(j.contact_id)?.phone ?? null : null,
    })),
  });
}
