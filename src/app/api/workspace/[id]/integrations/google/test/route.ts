import { NextRequest, NextResponse } from "next/server";
import { testGoogleCalendarConnection } from "@/features/inbox/services/google-calendar-client";
import { requireWorkspaceMember } from "@/lib/auth/workspace-access";
import { createClient as svcClient } from "@supabase/supabase-js";

// POST /api/workspace/[id]/integrations/google/test
// Verifies the saved Calendar ID is reachable (shared with the service account)
// by running a tiny freeBusy query against it.
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: workspaceId } = await params;

  const auth = await requireWorkspaceMember(workspaceId);
  if (!auth.ok) return auth.response;

  const svc = svcClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { data } = await svc
    .from("integrations")
    .select("config")
    .eq("workspace_id", workspaceId)
    .eq("provider", "google_calendar")
    .maybeSingle();

  const calendarId = (data?.config as { calendar_id?: string } | null)
    ?.calendar_id;

  if (!calendarId) {
    return NextResponse.json({ ok: false, error: "Falta el Calendar ID" });
  }

  const result = await testGoogleCalendarConnection(calendarId);
  return NextResponse.json(result);
}
