import { NextRequest, NextResponse } from "next/server";
import { createClient as svcClient } from "@supabase/supabase-js";
import { z } from "zod";
import {
  requireWorkspaceMember,
  readJsonBody,
  ROLE_RANK,
  type WorkspaceRole,
} from "@/lib/auth/workspace-access";
import { provisionWorkspaceUser } from "@/lib/auth/provision-user";

// ──────────────────────────────────────────────────────────────────────────────
// Schemas
// ──────────────────────────────────────────────────────────────────────────────

const RoleEnum = z.enum(["admin", "manager", "agent", "viewer"]);

const InviteSchema = z.object({
  email: z.string().email(),
  role: RoleEnum,
  password: z.string().min(8).max(72).optional().or(z.literal("")),
});

const PatchSchema = z.object({
  userId: z.string().uuid(),
  role: RoleEnum.optional(),
  is_active: z.boolean().optional(),
});

const DeleteSchema = z.object({
  userId: z.string().uuid(),
});

// ──────────────────────────────────────────────────────────────────────────────
// Auth + workspace guard (shared across handlers)
// ──────────────────────────────────────────────────────────────────────────────

function svc() {
  return svcClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// GET /api/workspace/[id]/team
// Returns all memberships with user email, role, is_active, created_at
// ──────────────────────────────────────────────────────────────────────────────

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: workspaceId } = await params;

  const auth = await requireWorkspaceMember(workspaceId);
  if (!auth.ok) return auth.response;

  const db = svc();

  const [{ data, error }, { data: workspaceRow }] = await Promise.all([
    db
      .from("memberships")
      .select(
        `
        id,
        user_id,
        role,
        is_active,
        created_at,
        users ( full_name, email, is_super_admin )
      `,
      )
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: true }),
    db
      .from("workspaces")
      .select("human_member_limit, team_chat_enabled")
      .eq("id", workspaceId)
      .maybeSingle(),
  ]);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Flatten nested users join into a flat member shape. supabase-js doesn't
  // infer this nested-relation select — the shape below must stay in sync by
  // hand with the select() string above; a drift fails silently at runtime.
  const rows = (data ?? []) as unknown as Array<{
    id: string;
    user_id: string;
    role: string;
    is_active: boolean;
    created_at: string;
    users: { full_name: string | null; email: string; is_super_admin: boolean | null } | null;
  }>;

  const members = rows.map((row) => ({
    id: row.id,
    user_id: row.user_id,
    email: row.users?.email ?? "",
    full_name: row.users?.full_name ?? null,
    role: row.role,
    is_active: row.is_active,
    created_at: row.created_at,
  }));

  // Plazas ocupadas: activos y no superadministradores — misma regla que
  // claim_workspace_seat() en la base de datos (sección 3 de la
  // arquitectura del Chat: "Los superadministradores de OnyxLink no
  // consumen plaza").
  const seatsUsed = rows.filter((row) => row.is_active && !row.users?.is_super_admin).length;

  return NextResponse.json({
    members,
    seats: {
      used: seatsUsed,
      limit: workspaceRow?.human_member_limit ?? 1,
    },
    teamChatEnabled: workspaceRow?.team_chat_enabled ?? false,
  });
}

// ──────────────────────────────────────────────────────────────────────────────
// POST /api/workspace/[id]/team
// Invite a user by email. Creates auth user (invite) + membership.
// ──────────────────────────────────────────────────────────────────────────────

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: workspaceId } = await params;

  const auth = await requireWorkspaceMember(workspaceId, {
    minRole: "manager",
  });
  if (!auth.ok) return auth.response;

  const parsedBody = await readJsonBody(req);
  if (!parsedBody.ok) return parsedBody.response;

  const parsed = InviteSchema.safeParse(parsedBody.body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid body" },
      { status: 400 },
    );
  }

  const { email, role, password } = parsed.data;

  // Never let a manager grant a role above their own rank — otherwise any
  // manager could invite a new "admin" and hand control of the workspace to
  // them (or to themselves via a second account).
  if (ROLE_RANK[role] > ROLE_RANK[auth.role]) {
    return NextResponse.json(
      { error: "No puedes asignar un rol superior al tuyo" },
      { status: 403 },
    );
  }

  const db = svc();

  // Provision the account directly — no invite email / SMTP. The agency shares
  // the returned credentials and the user logs in directly.
  let provisioned;
  try {
    provisioned = await provisionWorkspaceUser(db, email, {
      password: password || undefined,
    });
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "No se pudo crear el usuario",
      },
      { status: 400 },
    );
  }

  // Reserva de plaza transaccional (lee human_member_limit con FOR UPDATE,
  // cuenta activos no-superadmin, y solo entonces hace el upsert de la
  // membership) — un conteo hecho aquí en la API antes del upsert no basta
  // contra dos invitaciones concurrentes para la última plaza.
  const { error: memberError } = await db.rpc("claim_workspace_seat", {
    p_workspace_id: workspaceId,
    p_user_id: provisioned.userId,
    p_role: role,
  });

  if (memberError) {
    // Revisión de arquitectura (bloqueo 4): provisionWorkspaceUser() ya creó
    // Auth + users ANTES de saber si había plaza. Si esta invitación creó
    // una cuenta nueva (provisioned.created) y la reserva falla después
    // (cupo lleno, o pierde una carrera por la última plaza), esa cuenta
    // queda huérfana: existe en Auth con una contraseña que nadie recibió,
    // ocupando un email que ya no se puede reintentar. Compensar borrando
    // solo lo que se acaba de crear — nunca una cuenta preexistente
    // (created=false), que puede pertenecer a alguien con acceso en otro
    // workspace. auth.users(id) → public.users(id) es ON DELETE CASCADE, así
    // que borrar en Auth también limpia el perfil.
    if (provisioned.created) {
      const { error: cleanupError } = await db.auth.admin.deleteUser(provisioned.userId);
      if (cleanupError) {
        console.error(
          "[POST /api/workspace/[id]/team] failed to compensate orphaned auth user after seat claim failure:",
          cleanupError,
        );
      }
    }

    if (memberError.message?.includes("TEAM_SEAT_LIMIT_REACHED")) {
      return NextResponse.json({ error: "TEAM_SEAT_LIMIT_REACHED" }, { status: 409 });
    }
    return NextResponse.json({ error: memberError.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    userId: provisioned.userId,
    credentials: provisioned.password
      ? { email, password: provisioned.password }
      : null,
  });
}

// ──────────────────────────────────────────────────────────────────────────────
// PATCH /api/workspace/[id]/team
// Update role and/or is_active for a membership
// ──────────────────────────────────────────────────────────────────────────────

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: workspaceId } = await params;

  const auth = await requireWorkspaceMember(workspaceId, {
    minRole: "manager",
  });
  if (!auth.ok) return auth.response;

  const parsedBody = await readJsonBody(req);
  if (!parsedBody.ok) return parsedBody.response;

  const parsed = PatchSchema.safeParse(parsedBody.body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid body" },
      { status: 400 },
    );
  }

  const { userId, role, is_active } = parsed.data;
  const db = svc();

  // Re-fetch the target's CURRENT role first — a manager must never be able
  // to modify (role or activation) a membership that outranks them (e.g.
  // deactivate a real admin), and nobody may promote anyone (including
  // themselves) to a role above their own rank.
  const { data: target } = await db
    .from("memberships")
    .select("role")
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId)
    .maybeSingle();

  if (!target) {
    return NextResponse.json({ error: "Miembro no encontrado" }, { status: 404 });
  }

  const targetCurrentRole = target.role as WorkspaceRole;
  if (ROLE_RANK[targetCurrentRole] > ROLE_RANK[auth.role]) {
    return NextResponse.json(
      { error: "No puedes modificar a alguien con un rol superior al tuyo" },
      { status: 403 },
    );
  }
  if (role !== undefined && ROLE_RANK[role] > ROLE_RANK[auth.role]) {
    return NextResponse.json(
      { error: "No puedes asignar un rol superior al tuyo" },
      { status: 403 },
    );
  }

  // Reactivar (is_active pasa de false a true) vuelve a consumir una plaza
  // — pasa por la misma reserva transaccional que la invitación, nunca por
  // un UPDATE directo, por la misma razón: dos reactivaciones concurrentes
  // no deben poder superar la última plaza juntas.
  if (is_active === true) {
    const { error: rpcError } = await db.rpc("claim_workspace_seat", {
      p_workspace_id: workspaceId,
      p_user_id: userId,
      p_role: role ?? targetCurrentRole,
    });

    if (rpcError) {
      if (rpcError.message?.includes("TEAM_SEAT_LIMIT_REACHED")) {
        return NextResponse.json({ error: "TEAM_SEAT_LIMIT_REACHED" }, { status: 409 });
      }
      return NextResponse.json({ error: rpcError.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  }

  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (role !== undefined) updates.role = role;
  if (is_active !== undefined) updates.is_active = is_active;

  const { error } = await db
    .from("memberships")
    .update(updates)
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId);

  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}

// ──────────────────────────────────────────────────────────────────────────────
// DELETE /api/workspace/[id]/team
// Soft-deactivate a member (set is_active = false, never hard-delete)
// ──────────────────────────────────────────────────────────────────────────────

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: workspaceId } = await params;

  const auth = await requireWorkspaceMember(workspaceId, {
    minRole: "manager",
  });
  if (!auth.ok) return auth.response;

  const parsedBody = await readJsonBody(req);
  if (!parsedBody.ok) return parsedBody.response;

  const parsed = DeleteSchema.safeParse(parsedBody.body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid body" },
      { status: 400 },
    );
  }

  const { userId } = parsed.data;
  const db = svc();

  // Same rule as PATCH: a manager may never deactivate an admin.
  const { data: target } = await db
    .from("memberships")
    .select("role")
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId)
    .maybeSingle();

  if (!target) {
    return NextResponse.json({ error: "Miembro no encontrado" }, { status: 404 });
  }

  if (ROLE_RANK[target.role as WorkspaceRole] > ROLE_RANK[auth.role]) {
    return NextResponse.json(
      { error: "No puedes desactivar a alguien con un rol superior al tuyo" },
      { status: 403 },
    );
  }

  const { error } = await db
    .from("memberships")
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId);

  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
