// Sugerencias de Pipeline con IA — GET/PATCH the per-workspace opt-in flag
// (workspaces.pipeline_ai_enabled). See src/features/pipeline/services/
// pipeline-suggestion.ts for what this flag gates.

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  requireWorkspaceMember,
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

// ── GET /api/workspace/[id]/pipeline-ai ────────────────────────────────────
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: workspaceId } = await params;

  const auth = await requireWorkspaceMember(workspaceId);
  if (!auth.ok) return auth.response;

  const { data, error } = await svc()
    .from("workspaces")
    .select("pipeline_ai_enabled")
    .eq("id", workspaceId)
    .single();

  if (error) {
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 },
    );
  }

  return NextResponse.json({ enabled: data.pipeline_ai_enabled === true });
}

// ── PATCH /api/workspace/[id]/pipeline-ai ──────────────────────────────────
const patchSchema = z.object({ enabled: z.boolean() });

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: workspaceId } = await params;

  const auth = await requireWorkspaceMember(workspaceId, { minRole: "manager" });
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
    .update({ pipeline_ai_enabled: enabled })
    .eq("id", workspaceId);

  if (error) {
    console.error("[PATCH /api/workspace/[id]/pipeline-ai]", error);
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 },
    );
  }

  void logAudit({
    workspaceId,
    actorUserId: auth.userId,
    action: enabled ? "pipeline_ai.enable" : "pipeline_ai.disable",
    targetType: "workspace",
    targetId: workspaceId,
    summary: `${enabled ? "Activó" : "Desactivó"} las Sugerencias de Pipeline con IA`,
  });

  return NextResponse.json({ enabled });
}
