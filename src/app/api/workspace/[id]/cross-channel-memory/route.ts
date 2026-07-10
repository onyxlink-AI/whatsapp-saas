// Memoria compartida entre canales — GET/PATCH the per-workspace opt-in flag
// (workspaces.cross_channel_memory_enabled). Independent from
// advanced_memory_enabled and vapi_assistant_id: this only controls whether
// a Vapi call's transcript is ALSO fed into the same contact_memories /
// contact_memory_items WhatsApp uses. See src/app/api/webhooks/vapi/route.ts.

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  requireWorkspaceMember,
  requireSuperAdmin,
  readJsonBody,
} from "@/lib/auth/workspace-access";
import { createClient as createSbClient } from "@supabase/supabase-js";
import { logAudit } from "@/features/audit/services/audit-log";

function svc() {
  return createSbClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

// ── GET /api/workspace/[id]/cross-channel-memory ───────────────────────────
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: workspaceId } = await params;

  const auth = await requireWorkspaceMember(workspaceId);
  if (!auth.ok) return auth.response;

  const { data, error } = await svc()
    .from("workspaces")
    .select("cross_channel_memory_enabled")
    .eq("id", workspaceId)
    .single();

  if (error) {
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 },
    );
  }

  return NextResponse.json({
    enabled: data.cross_channel_memory_enabled === true,
  });
}

// ── PATCH /api/workspace/[id]/cross-channel-memory ─────────────────────────
const patchSchema = z.object({ enabled: z.boolean() });

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: workspaceId } = await params;

  // Paid add-on — only Onyxlink can activate it, never the client's own
  // workspace admin (see requireSuperAdmin's doc comment).
  const auth = await requireSuperAdmin();
  if (!auth.ok) return auth.response;

  const parsedBody = await readJsonBody<unknown>(req);
  if (!parsedBody.ok) return parsedBody.response;

  const parsed = patchSchema.safeParse(parsedBody.body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { enabled } = parsed.data;

  const { error } = await svc()
    .from("workspaces")
    .update({ cross_channel_memory_enabled: enabled })
    .eq("id", workspaceId);

  if (error) {
    console.error("[PATCH /api/workspace/[id]/cross-channel-memory]", error);
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 },
    );
  }

  void logAudit({
    workspaceId,
    actorUserId: auth.userId,
    action: enabled
      ? "cross_channel_memory.enable"
      : "cross_channel_memory.disable",
    targetType: "workspace",
    targetId: workspaceId,
    summary: `${enabled ? "Activó" : "Desactivó"} la Memoria compartida entre canales`,
  });

  return NextResponse.json({ enabled });
}
