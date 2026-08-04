import { NextRequest, NextResponse } from "next/server";
import { createClient as createSbClient } from "@supabase/supabase-js";
import { z } from "zod";
import { logAudit } from "@/features/audit/services/audit-log";
import { readJsonBody, requireSuperAdmin } from "@/lib/auth/workspace-access";

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
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { enabled } = parsed.data;

  // Paquete 2 = Paquete 1 (Gestión) + WhatsApp — WhatsApp nunca existe sin
  // Gestión. Activar el agente activa Gestión en la misma escritura (atómico,
  // nunca dos PATCH separados que puedan dejar un estado intermedio
  // inválido). chk_whatsapp_requires_gestion respalda esto a nivel de fila
  // por si algo escribe fuera de este endpoint.
  const update = enabled
    ? { whatsapp_agent_enabled: true, gestion_enabled: true }
    : { whatsapp_agent_enabled: false };

  const { data, error } = await serviceClient()
    .from("workspaces")
    .update(update)
    .eq("id", workspaceId)
    .select("id")
    .maybeSingle();

  if (error) {
    console.error("[PATCH /api/workspace/[id]/whatsapp-agent]", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json({ error: "Workspace no encontrado" }, { status: 404 });
  }

  void logAudit({
    workspaceId,
    actorUserId: auth.userId,
    action: enabled ? "whatsapp_agent.enable" : "whatsapp_agent.disable",
    targetType: "workspace",
    targetId: workspaceId,
    summary: enabled
      ? "Activó el Agente de WhatsApp (incluye Onyxlink Gestión)"
      : "Desactivó el Agente de WhatsApp",
  });

  return NextResponse.json({ enabled, gestionEnabled: enabled ? true : undefined });
}
