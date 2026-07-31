import { NextRequest, NextResponse } from "next/server";
import { testZoomConnection } from "@/features/inbox/services/zoom-client";
import { requireWorkspaceMember } from "@/lib/auth/workspace-access";
import { createClient as svcClient } from "@supabase/supabase-js";

// POST /api/workspace/[id]/integrations/zoom/test
// Verifies the saved host email is a real user on the platform's Zoom account.
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
    .eq("provider", "zoom")
    .maybeSingle();

  const hostEmail = (data?.config as { host_email?: string } | null)?.host_email;

  if (!hostEmail) {
    return NextResponse.json({ ok: false, error: "Falta el email del anfitrión" });
  }

  const result = await testZoomConnection(hostEmail);
  return NextResponse.json(result);
}
