import { NextRequest, NextResponse } from "next/server";
import { requireWorkspaceMember } from "@/lib/auth/workspace-access";
import { listAuditLog } from "@/features/audit/services/audit-log";

// GET /api/workspace/[id]/audit-log — read-only, any active member can view.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: workspaceId } = await params;

  const auth = await requireWorkspaceMember(workspaceId);
  if (!auth.ok) return auth.response;

  const entries = await listAuditLog(workspaceId, 100);
  return NextResponse.json({ entries });
}
