// Asistente AI (voz, Vapi) — GET/PATCH the per-workspace linked assistant id
// (workspaces.vapi_assistant_id). Setting/clearing this id is what gates the
// "/asistente-ai" nav item and page, and is the key the /api/webhooks/vapi
// handler uses to route an incoming call back to this workspace.

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  requireWorkspaceMember,
  requireSuperAdmin,
  readJsonBody,
} from "@/lib/auth/workspace-access";
import { createClient as createSbClient } from "@supabase/supabase-js";
import { logAudit } from "@/features/audit/services/audit-log";
import { getVapiConnectionStatus } from "@/features/voice-agent/services/vapi-verification";

function svc() {
  return createSbClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

// ── GET /api/workspace/[id]/vapi-assistant ──────────────────────────────────
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: workspaceId } = await params;

  const auth = await requireWorkspaceMember(workspaceId);
  if (!auth.ok) return auth.response;

  const { data, error } = await svc()
    .from("workspaces")
    .select("vapi_assistant_id")
    .eq("id", workspaceId)
    .single();

  if (error) {
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 },
    );
  }

  const assistantId = data.vapi_assistant_id as string | null;
  // The verification call (when a platform VAPI_API_KEY exists) happens
  // server-side only — the key itself never reaches this response or the browser.
  const { status, detail } = await getVapiConnectionStatus(assistantId);

  return NextResponse.json({ assistantId, status, detail });
}

// ── PATCH /api/workspace/[id]/vapi-assistant ────────────────────────────────
const patchSchema = z.object({
  assistantId: z.string().trim().min(1).max(100).nullable(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: workspaceId } = await params;

  // Paid add-on — only Onyxlink can link/unlink the voice assistant, never
  // the client's own workspace admin (see requireSuperAdmin's doc comment).
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

  const { assistantId } = parsed.data;

  const { error } = await svc()
    .from("workspaces")
    .update({ vapi_assistant_id: assistantId })
    .eq("id", workspaceId);

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json(
        { error: "Ese assistant de Vapi ya está vinculado a otro workspace" },
        { status: 409 },
      );
    }
    console.error("[PATCH /api/workspace/[id]/vapi-assistant]", error);
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 },
    );
  }

  void logAudit({
    workspaceId,
    actorUserId: auth.userId,
    action: assistantId ? "vapi_assistant.set" : "vapi_assistant.clear",
    targetType: "workspace",
    targetId: workspaceId,
    summary: assistantId
      ? `Vinculó el assistant de voz Vapi ${assistantId}`
      : "Desvinculó el assistant de voz Vapi",
  });

  return NextResponse.json({ assistantId });
}
