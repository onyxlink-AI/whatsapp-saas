import { createClient as createSbClient } from "@supabase/supabase-js";

// ──────────────────────────────────────────────────────────────────────────────
// Signup gate — one-click-install bootstrap.
//
// Public self-registration is closed. The ONLY account that can self-register
// is the very first one (the agency super admin). Once any user exists, signup
// is closed and new people must be invited from the agency panel.
// ──────────────────────────────────────────────────────────────────────────────

function admin() {
  return createSbClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

/**
 * Signup is open only while there are zero users (fresh install).
 * Fails closed: any read error reports signup as closed.
 */
export async function isSignupOpen(): Promise<boolean> {
  const { count, error } = await admin()
    .from("users")
    .select("id", { count: "exact", head: true });

  if (error) return false;
  return (count ?? 0) === 0;
}

/**
 * Promotes the bootstrap user (first registration) to agency super admin.
 *
 * TAREA 1B: writes is_super_admin AND platform_role atomically in the same
 * UPDATE — leaving only is_super_admin set (the pre-1B behavior) would mint
 * a super admin who passes requireSuperAdmin() but, before this task's fix,
 * could fail requirePlatformStaff()/is_platform_staff() elsewhere, an
 * inconsistent half-promoted account. Fails loudly (throws) rather than
 * swallowing an error or a zero-row match — this is the ONLY account
 * creation path that grants platform access, so silently leaving someone
 * partially promoted (or not promoted at all while signup already reports
 * success) is worse than a hard failure the caller must handle.
 */
export async function markAsSuperAdmin(userId: string): Promise<void> {
  const { data, error } = await admin()
    .from("users")
    .update({ is_super_admin: true, platform_role: "super_admin" })
    .eq("id", userId)
    .select("id");

  if (error) {
    throw new Error(`markAsSuperAdmin: failed to promote user ${userId}: ${error.message}`);
  }
  if (!data || data.length === 0) {
    throw new Error(`markAsSuperAdmin: no user row matched id ${userId} — promotion did not apply`);
  }
}
