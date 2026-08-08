import { NextRequest, NextResponse } from "next/server";
import { createClient as createSbClient } from "@supabase/supabase-js";
import { z } from "zod";
import { logAudit } from "@/features/audit/services/audit-log";
import {
  readJsonBody,
  requireSuperAdmin,
} from "@/lib/auth/workspace-access";
import { getWhatsAppOfficeActivationBlocker } from "@/features/office-virtual/server/whatsapp-office-activation";

// Revisión correctiva de Fase 2: este endpoint YA NO escribe
// office_virtual_enabled — ese flag es 100% derivado del paquete
// comercial (PATCH /api/workspace/[id]/product-package es la única vía).
// target ahora solo admite "whatsapp": el interruptor de activación en
// vivo del Agente de WhatsApp DENTRO de Oficina Virtual
// (office_whatsapp_enabled), que es un ajuste operativo distinto del
// paquete y no le pertenece.
const patchSchema = z.object({
  enabled: z.boolean(),
  target: z.literal("whatsapp"),
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
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { enabled, target } = parsed.data;
  const db = serviceClient();

  const [{ data: workspace, error: workspaceError }, { data: activeAgent, error: agentError }, { data: ycloud, error: ycloudError }] = await Promise.all([
    db.from("workspaces").select("id, whatsapp_agent_enabled").eq("id", workspaceId).maybeSingle(),
    db.from("agents").select("id").eq("workspace_id", workspaceId).eq("is_active", true).maybeSingle(),
    db.from("integrations").select("enabled, config, credentials").eq("workspace_id", workspaceId).eq("provider", "ycloud").maybeSingle(),
  ]);

  if (workspaceError || agentError || ycloudError) {
    console.error("[PATCH office WhatsApp activation]", workspaceError ?? agentError ?? ycloudError);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
  if (!workspace) return NextResponse.json({ error: "Workspace no encontrado" }, { status: 404 });

  const phoneNumber = (ycloud?.config as Record<string, unknown> | null)?.phone_number;
  const ycloudConfigured = Boolean(
    ycloud?.enabled === true &&
    typeof phoneNumber === "string" &&
    phoneNumber.trim().length > 0 &&
    ycloud.credentials &&
    Object.keys(ycloud.credentials as Record<string, unknown>).length > 0,
  );
  const blocker = getWhatsAppOfficeActivationBlocker({
    productEnabled: workspace.whatsapp_agent_enabled === true,
    selectedAgent: activeAgent !== null,
    ycloudConfigured,
  });
  if (enabled && blocker) return NextResponse.json({ error: blocker }, { status: 409 });

  const { data, error } = await db
    .from("workspaces")
    .update({ office_whatsapp_enabled: enabled })
    .eq("id", workspaceId)
    .select("id")
    .maybeSingle();
  if (error) return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Workspace no encontrado" }, { status: 404 });

  void logAudit({
    workspaceId,
    actorUserId: auth.userId,
    action: enabled ? "office_virtual.whatsapp.enable" : "office_virtual.whatsapp.disable",
    targetType: "workspace",
    targetId: workspaceId,
    summary: `${enabled ? "Activó" : "Desactivó"} el Agente de WhatsApp desde Oficina Virtual`,
  });
  return NextResponse.json({ target, enabled });
}
