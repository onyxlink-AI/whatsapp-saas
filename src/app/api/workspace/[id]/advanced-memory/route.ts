// Memoria Inteligente Avanzada — GET/PATCH the per-workspace opt-in flag
// (workspaces.advanced_memory_enabled). See src/features/inbox/services/
// contact-memory.ts and memory-extraction.ts for what this flag gates.

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

// ── GET /api/workspace/[id]/advanced-memory ────────────────────────────────
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: workspaceId } = await params;

  const auth = await requireWorkspaceMember(workspaceId);
  if (!auth.ok) return auth.response;

  const { data, error } = await svc()
    .from("workspaces")
    .select("advanced_memory_enabled")
    .eq("id", workspaceId)
    .single();

  if (error) {
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 },
    );
  }

  return NextResponse.json({ enabled: data.advanced_memory_enabled === true });
}

// ── PATCH /api/workspace/[id]/advanced-memory ──────────────────────────────
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
    .update({ advanced_memory_enabled: enabled })
    .eq("id", workspaceId);

  if (error) {
    console.error("[PATCH /api/workspace/[id]/advanced-memory]", error);
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 },
    );
  }

  void logAudit({
    workspaceId,
    actorUserId: auth.userId,
    action: enabled ? "advanced_memory.enable" : "advanced_memory.disable",
    targetType: "workspace",
    targetId: workspaceId,
    summary: `${enabled ? "Activó" : "Desactivó"} la Memoria Inteligente Avanzada`,
  });

  return NextResponse.json({ enabled });
}
