import { NextRequest, NextResponse } from "next/server";
import { createClient as createSbClient } from "@supabase/supabase-js";
import { z } from "zod";
import { logAudit } from "@/features/audit/services/audit-log";
import { readJsonBody, requireSuperAdmin } from "@/lib/auth/workspace-access";
import { PACKAGE_LABELS, type ProductPackage } from "@/features/entitlements/resolve";

// Fase 2 (docs/CLAUDE-ARQUITECTURA-PAQUETES-NAVEGACION-IA-ASISTENTE.md §2.4):
// mismo esqueleto que team-chat-enabled/route.ts — requireSuperAdmin(),
// una única llamada RPC atómica, auditoría con el jsonb que la función
// devuelve (estado anterior y nuevo).

const patchSchema = z.object({
  package: z.enum(["none", "gestion", "whatsapp_gestion", "suite"]),
});

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
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const db = serviceClient();
  const { data, error } = await db.rpc("set_workspace_product_package", {
    p_workspace_id: workspaceId,
    p_package: parsed.data.package,
  });

  if (error) {
    console.error("[PATCH /api/workspace/[id]/product-package]", error);
    if (error.message?.includes("not found")) {
      return NextResponse.json({ error: "Workspace no encontrado" }, { status: 404 });
    }
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }

  const result = data as { previous: { package: ProductPackage }; next: { package: ProductPackage } } | null;

  void logAudit({
    workspaceId,
    actorUserId: auth.userId,
    action: "workspace.product_package_change",
    targetType: "workspace",
    targetId: workspaceId,
    summary: result
      ? `Cambió el paquete: ${PACKAGE_LABELS[result.previous.package]} → ${PACKAGE_LABELS[result.next.package]}`
      : `Cambió el paquete a ${PACKAGE_LABELS[parsed.data.package]}`,
    metadata: result ? { previous: result.previous, next: result.next } : undefined,
  });

  return NextResponse.json({ package: parsed.data.package, state: result });
}
