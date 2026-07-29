import { normalizePhone } from "@/features/inbox/services/normalizer";

// Server-only kill switch + allowlist for the reminders engine's real
// outbound sends. Both are process.env — never a DB row, never anything the
// browser can influence — read fresh on every check (no caching) so a
// server restart with the var removed takes effect immediately, and there
// is no code path anywhere that lets a client-supplied value substitute for
// these checks.

/**
 * Fail-closed by design: ANY value other than the exact literal "true"
 * (missing var, "false", "1", empty string, typo) means sending stays
 * disabled. This is the single source of truth the sender consults before
 * ever reaching dispatchTemplate/dispatchText.
 */
export function isLiveSendingEnabled(): boolean {
  return process.env.REMINDERS_LIVE_SENDING_ENABLED === "true";
}

/**
 * Empty/absent allowlist = zero authorized numbers, full stop — never
 * "allow everything when unset". Comparison normalizes both sides so
 * formatting differences (spaces, missing +) can't create a false negative
 * OR a false positive.
 */
export function isPhoneAllowlisted(phone: string): boolean {
  const raw = process.env.REMINDERS_TEST_PHONE_ALLOWLIST ?? "";
  const allowed = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (allowed.length === 0) return false;

  const normalizedTarget = normalizePhone(phone);
  return allowed.some((entry) => normalizePhone(entry) === normalizedTarget);
}
