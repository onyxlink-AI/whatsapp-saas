import { NextRequest, NextResponse } from "next/server";
import { createClient as createSbClient } from "@supabase/supabase-js";
import { z } from "zod";
import { logAudit } from "@/features/audit/services/audit-log";
import { readJsonBody, requireSuperAdmin } from "@/lib/auth/workspace-access";

// Mirrors src/app/api/workspace/[id]/whiteboard-enabled/route.ts — el Chat
// de equipo es otro add-on exclusivo de Onyxlink, con un segundo campo
// editable (human_member_limit) que el cliente no puede subir por sí mismo
// (arquitectura, sección 3: "El cliente no puede subir su propio límite").

const patchSchema = z.object({
  enabled: z.boolean().optional(),
  humanMemberLimit: z.number().int().min(1).max(500).optional(),
  storageQuotaMb: z.number().int().min(1).max(51200).optional(),
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

  const { enabled, humanMemberLimit, storageQuotaMb } = parsed.data;
  if (enabled === undefined && humanMemberLimit === undefined && storageQuotaMb === undefined) {
    return NextResponse.json({ error: "Nada que actualizar" }, { status: 400 });
  }

  const db = serviceClient();

  // Revisión de arquitectura (bloqueo 3): activar el flag y aprovisionar
  // General/backfill iban antes en dos pasos sueltos (UPDATE + rpc separado)
  // — si el segundo fallaba, quedaba un estado a medias indistinguible de un
  // fallo limpio. set_team_chat_enabled() hace ambas cosas en una sola
  // función PL/pgSQL: si algo falla dentro, TODO se revierte, incluida la
  // propia bandera.
  if (enabled !== undefined || humanMemberLimit !== undefined) {
    const { error: rpcError } = await db.rpc("set_team_chat_enabled", {
      p_workspace_id: workspaceId,
      p_enabled: enabled ?? null,
      p_human_member_limit: humanMemberLimit ?? null,
    });

    if (rpcError) {
      console.error("[PATCH /api/workspace/[id]/team-chat-enabled] set_team_chat_enabled", rpcError);
      if (rpcError.message?.includes("not found")) {
        return NextResponse.json({ error: "Workspace no encontrado" }, { status: 404 });
      }
      if (rpcError.message?.includes("is below the")) {
        return NextResponse.json(
          { error: "El límite no puede ser menor que las plazas humanas ya ocupadas" },
          { status: 409 },
        );
      }
      return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
    }
  }

  // La cuota de almacenamiento no tiene los efectos secundarios de
  // enabled/humanMemberLimit (provisionar General, backfill) ni un
  // invariante que validar contra el uso actual — bajarla por debajo de lo
  // ya usado este mes es un estado válido (solo bloquea subidas nuevas
  // hasta que se suba o llegue el próximo mes), así que un UPDATE directo
  // con service role basta, mismo patrón que whiteboard-enabled.
  if (storageQuotaMb !== undefined) {
    const { error: quotaError } = await db
      .from("workspaces")
      .update({ team_chat_storage_quota_mb: storageQuotaMb })
      .eq("id", workspaceId);

    if (quotaError) {
      console.error("[PATCH /api/workspace/[id]/team-chat-enabled] storage quota update", quotaError);
      return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
    }
  }

  void logAudit({
    workspaceId,
    actorUserId: auth.userId,
    action: "team_chat.update",
    targetType: "workspace",
    targetId: workspaceId,
    summary: [
      enabled !== undefined ? `${enabled ? "Activó" : "Desactivó"} el Chat de equipo` : null,
      humanMemberLimit !== undefined ? `Fijó el límite de plazas en ${humanMemberLimit}` : null,
      storageQuotaMb !== undefined ? `Fijó la cuota de almacenamiento en ${storageQuotaMb} MB` : null,
    ]
      .filter(Boolean)
      .join(" · "),
  });

  return NextResponse.json({ enabled, humanMemberLimit, storageQuotaMb });
}
