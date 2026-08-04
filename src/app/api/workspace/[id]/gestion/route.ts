// Onyxlink Gestión — GET/PATCH the per-workspace opt-in flag
// (workspaces.gestion_enabled). Gates Clientes/Agenda/Proyectos — always a
// separate add-on, never implied by whatsapp_agent_enabled.

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

// ── GET /api/workspace/[id]/gestion ────────────────────────────────────────
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: workspaceId } = await params;

  const auth = await requireWorkspaceMember(workspaceId);
  if (!auth.ok) return auth.response;

  const { data, error } = await svc()
    .from("workspaces")
    .select("gestion_enabled")
    .eq("id", workspaceId)
    .single();

  if (error) {
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 },
    );
  }

  return NextResponse.json({ enabled: data.gestion_enabled === true });
}

// ── PATCH /api/workspace/[id]/gestion ──────────────────────────────────────
const patchSchema = z.object({ enabled: z.boolean() });

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: workspaceId } = await params;

  // Paid add-on — only Onyxlink can activate it, never the client's own
  // workspace admin (see requireSuperAdmin's doc comment for why role alone
  // isn't enough here).
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

  // Paquete 2 = Gestión + WhatsApp — WhatsApp nunca existe sin Gestión. No
  // se puede quitar Gestión mientras el agente de WhatsApp siga activo;
  // primero hay que desactivar WhatsApp (que sí puede vivir sin Gestión).
  if (!enabled) {
    const { data: current } = await svc()
      .from("workspaces")
      .select("whatsapp_agent_enabled")
      .eq("id", workspaceId)
      .maybeSingle();

    if (current?.whatsapp_agent_enabled === true) {
      return NextResponse.json(
        {
          error:
            "No se puede desactivar Onyxlink Gestión mientras el Agente de WhatsApp esté activo — desactiva primero el Agente de WhatsApp.",
        },
        { status: 409 },
      );
    }
  }

  const { error } = await svc()
    .from("workspaces")
    .update({ gestion_enabled: enabled })
    .eq("id", workspaceId);

  if (error) {
    console.error("[PATCH /api/workspace/[id]/gestion]", error);
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 },
    );
  }

  void logAudit({
    workspaceId,
    actorUserId: auth.userId,
    action: enabled ? "gestion.enable" : "gestion.disable",
    targetType: "workspace",
    targetId: workspaceId,
    summary: `${enabled ? "Activó" : "Desactivó"} Onyxlink Gestión`,
  });

  return NextResponse.json({ enabled });
}
