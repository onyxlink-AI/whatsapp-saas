// Platform-level authorization — distinct from workspace-level authorization
// (see workspace-access.ts's requireWorkspaceMember). A workspace "admin"
// (memberships.role) is a client who administers THEIR OWN workspace; an
// OnyxLink "platform staff" member (users.platform_role) is OnyxLink's own
// internal personnel, independent of any workspace membership. These two
// concepts must never be conflated — a client admin must never pass
// requirePlatformStaff(), no matter how many workspaces they administer.
//
// TAREA 1 (separación segura entre administradores internos y clientes):
// users.platform_role ('internal_admin' | 'super_admin' | null) is additive
// alongside the pre-existing users.is_super_admin boolean — see the
// migration for why both are read here during the compatibility window.
// This file is the single place that resolves "who is this caller to
// OnyxLink itself" — every route/page that needs a platform-level gate
// should call requirePlatformStaff() or requireSuperAdmin() from here,
// never re-read users.platform_role/is_super_admin inline.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export type PlatformRole = "internal_admin" | "super_admin";

export interface PlatformAccess {
  userId: string;
  email: string;
  /**
   * Raw column value — null for any user who isn't internal_admin/super_admin
   * via platform_role specifically. A legacy super admin (is_super_admin=true,
   * platform_role still null) reads as null here too — use
   * effectivePlatformRole below when you need "what role should this caller
   * be treated as", not "what does the platform_role column literally say".
   */
  platformRole: PlatformRole | null;
  /**
   * TAREA 1B fix: the role to actually TREAT this caller as, resolving the
   * is_super_admin=true/platform_role=null legacy case to 'super_admin'
   * instead of leaving it unrepresentable. null only when the caller is not
   * platform staff at all. isPlatformStaff and effectivePlatformRole must
   * always agree (one is truthy iff the other is non-null) — every gate
   * below reads effectivePlatformRole, never platformRole directly, so a
   * legacy super admin can never be staff for one check and not-staff for
   * another.
   */
  effectivePlatformRole: PlatformRole | null;
  /** internal_admin OR super_admin. A workspace-level "admin" is NEVER staff. */
  isPlatformStaff: boolean;
  /**
   * super_admin — via platform_role, OR via the legacy is_super_admin=true
   * flag during the compatibility window (see migration). Never true for
   * internal_admin alone.
   */
  isSuperAdmin: boolean;
}

type PlatformFail = { ok: false; response: NextResponse };
type PlatformStaffOk = { ok: true; userId: string; email: string; platformRole: PlatformRole };
type SuperAdminOk = { ok: true; userId: string; email: string };

/**
 * Resolves the current caller's OnyxLink platform standing, or `null` if
 * there is no authenticated session. Read-only — never throws, never
 * redirects; callers that need a hard gate use requirePlatformStaff() /
 * requireSuperAdmin() below, and pages/UI that just need to know (e.g. to
 * decide whether to render a nav item) can call this directly.
 */
export async function getPlatformAccess(): Promise<PlatformAccess | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data } = await supabase
    .from("users")
    .select("is_super_admin, platform_role")
    .eq("id", user.id)
    .maybeSingle();

  const platformRole = (data?.platform_role ?? null) as PlatformRole | null;
  const isSuperAdmin = platformRole === "super_admin" || data?.is_super_admin === true;
  const isPlatformStaff = isSuperAdmin || platformRole === "internal_admin";
  // isSuperAdmin takes priority: a legacy is_super_admin=true row must
  // resolve to 'super_admin' even while platform_role is still null.
  const effectivePlatformRole: PlatformRole | null = isSuperAdmin
    ? "super_admin"
    : platformRole === "internal_admin"
      ? "internal_admin"
      : null;

  return {
    userId: user.id,
    email: user.email ?? user.id,
    platformRole,
    effectivePlatformRole,
    isPlatformStaff,
    isSuperAdmin,
  };
}

/**
 * Authenticates the caller and verifies they are OnyxLink platform staff —
 * internal_admin OR super_admin. Use this for anything internal personnel
 * should reach but a client (even a client workspace admin) never should.
 * Does NOT authorize super-admin-only operations — see requireSuperAdmin().
 */
export async function requirePlatformStaff(): Promise<PlatformStaffOk | PlatformFail> {
  const access = await getPlatformAccess();

  if (!access) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  if (!access.isPlatformStaff || !access.effectivePlatformRole) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Esta función solo la puede usar personal de Onyxlink" },
        { status: 403 },
      ),
    };
  }

  return { ok: true, userId: access.userId, email: access.email, platformRole: access.effectivePlatformRole };
}

/**
 * Authenticates the caller and verifies they are a platform super admin —
 * NOT just a workspace "admin" member, and NOT just internal_admin. The
 * agency super admin who provisions a client is deliberately added as a
 * workspace "admin" member too (see agency-actions.ts) so RLS-scoped
 * reads/writes work for them, which means workspace role alone can't tell
 * an Onyxlink operator apart from the client's own admin user. Use this
 * instead of `requireWorkspaceMember({ minRole: "admin" })` for anything
 * that must stay agency-only regardless of the caller's role inside that
 * workspace — e.g. toggling a paid add-on the client shouldn't self-activate
 * — and instead of requirePlatformStaff() for operations that must stay
 * exclusive to super_admin even from internal_admin (workspace provisioning,
 * credentials, global config, role assignment).
 */
export async function requireSuperAdmin(): Promise<SuperAdminOk | PlatformFail> {
  const access = await getPlatformAccess();

  if (!access) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  if (!access.isSuperAdmin) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Esta función solo la puede activar Onyxlink" },
        { status: 403 },
      ),
    };
  }

  return { ok: true, userId: access.userId, email: access.email };
}
