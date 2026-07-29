import { NextRequest, NextResponse } from "next/server";
import { createClient as createSbClient } from "@supabase/supabase-js";
import { z } from "zod";
import { logAudit } from "@/features/audit/services/audit-log";
import {
  readJsonBody,
  requireSuperAdmin,
} from "@/lib/auth/workspace-access";

const patchSchema = z.object({ enabled: z.boolean() });

function serviceClient() {
  return createSbClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireSuperAdmin();
  if (!auth.ok) return auth.response;

  const { id: workspaceId } = await params;
  const parsedBody = await readJsonBody<unknown>(request);
  if (!parsedBody.ok) return parsedBody.response;

  const parsed = patchSchema.safeParse(parsedBody.body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { enabled } = parsed.data;
  const { data, error } = await serviceClient()
    .from("workspaces")
    .update({ office_virtual_enabled: enabled })
    .eq("id", workspaceId)
    .select("id")
    .maybeSingle();

  if (error) {
    console.error("[PATCH /api/workspace/[id]/office-virtual]", error);
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 },
    );
  }

  if (!data) {
    return NextResponse.json(
      { error: "Workspace no encontrado" },
      { status: 404 },
    );
  }

  void logAudit({
    workspaceId,
    actorUserId: auth.userId,
    action: enabled
      ? "office_virtual.enable"
      : "office_virtual.disable",
    targetType: "workspace",
    targetId: workspaceId,
    summary: `${enabled ? "Activo" : "Desactivo"} Oficina Virtual`,
  });

  return NextResponse.json({ enabled });
}
