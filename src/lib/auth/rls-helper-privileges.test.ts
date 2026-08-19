import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// `vitest run` does not load .env.local the way `next dev`/`next build` do —
// read it directly so these tests see the same local Supabase credentials
// the app itself uses. No-op (falls back to process.env as-is) if the file
// doesn't exist, e.g. in a CI environment that injects env vars another way.
function loadDotEnvLocal() {
  const path = resolve(process.cwd(), '.env.local');
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    if (process.env[key] !== undefined) continue;
    process.env[key] = trimmed.slice(eq + 1).trim();
  }
}
loadDotEnvLocal();

// Regression tests for the security closure on auth_workspace_ids() /
// auth_has_role(): PostgreSQL grants EXECUTE on every new function to the
// PUBLIC pseudo-role by default, so the pre-existing `REVOKE EXECUTE ...
// FROM anon` in 20260608000008_sec02_function_hardening.sql was a no-op —
// anon (and everyone else) still had EXECUTE via PUBLIC. Confirmed by a
// real HTTP request: POST .../rpc/auth_workspace_ids with only the anon
// apikey returned HTTP 200 `[]`. 20260723010000_revoke_public_execute_rls_helpers.sql
// fixes this by revoking from PUBLIC and re-granting to `authenticated`
// explicitly (58 RLS policies across 30 tables depend on it evaluating
// under the `authenticated` role).
//
// These assertions are about real GRANT/REVOKE state and real RLS
// enforcement — a mock would just prove the mock, not the fix — so they run
// against the actual local Supabase stack (`supabase start`) this session
// used throughout. They skip themselves (not fail) when that stack is
// confirmed absent, so `npm test` stays safe on a machine without it
// running. But a single one-shot fetch at beforeAll time raced `supabase
// start`'s own boot window: the container can still be initializing (or
// `next dev` still compiling) the instant this file's beforeAll fires,
// which made these read as "unreachable" and silently skipped 6 tests even
// though the stack was in fact coming up correctly seconds later. Poll with
// retries for up to POLL_TIMEOUT_MS instead of a single attempt, so a slow
// boot is waited out rather than misread as "not running".
//
// Deliberately scoped to Postgres/Supabase only — this file used to also
// poll NEXT_PUBLIC_APP_URL and fetch a live Next.js app's API route, but
// that made the result depend on whatever happened to be listening at that
// URL rather than on the candidate under test: in plain `npm run validate`
// nothing is listening there, so it silently skipped; in the staging/
// production release workflows that variable points at a real public
// domain, so a stray 404 from an unrelated or not-yet-deployed page was
// misread as "app reachable" and asserted against — divorced from Vitest
// entirely, breaking deterministically depending on DNS/deploy timing
// outside this test's control. The equivalent HTTP check now lives as an
// explicit post-deploy smoke test in staging.yml/production.yml, which
// queries the exact deployment URL just created — see those workflows for
// "queda exactamente HTTP 401". The route-level authorization behavior
// itself (no session -> 401, no config loaded) is covered directly in
// src/app/api/workspace/[id]/office-virtual/configurator/route.test.ts.

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321';
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

const SUPERADMIN_EMAIL = 'superadmin@onyxlink.local';
const SUPERADMIN_PASSWORD = 'TestLocal123!';
// Regular workspace admin of "Empresa A" only — NOT a platform super admin,
// unlike SUPERADMIN_EMAIL above. Needed separately: workspaces_select_members
// has a deliberate `OR public.is_super_admin()` clause (super admins see
// every workspace by design, see 20260609000001_super_admin.sql), so testing
// cross-tenant isolation with the super admin account would pass for the
// wrong reason. This account has no such bypass, so it is the one that
// actually proves tenant isolation at the RLS layer.
const NON_SUPERADMIN_EMAIL = 'cliente@empresaa.local';
const NON_SUPERADMIN_PASSWORD = 'TestLocal123!';

let supabaseReachable = false;
let authClient: SupabaseClient | null = null;
let nonSuperAdminClient: SupabaseClient | null = null;

const POLL_TIMEOUT_MS = 30_000;
const POLL_INTERVAL_MS = 500;

async function pollUntilReachable(check: () => Promise<boolean>): Promise<boolean> {
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  for (;;) {
    if (await check()) return true;
    if (Date.now() >= deadline) return false;
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
}

beforeAll(async () => {
  supabaseReachable = await pollUntilReachable(async () => {
    try {
      const r = await fetch(`${SUPABASE_URL}/rest/v1/`, { headers: { apikey: ANON_KEY } });
      return r.status < 500;
    } catch {
      return false;
    }
  });
}, POLL_TIMEOUT_MS + 5_000);

afterAll(async () => {
  await authClient?.auth.signOut().catch(() => {});
  await nonSuperAdminClient?.auth.signOut().catch(() => {});
});

describe('auth_workspace_ids() / auth_has_role() privilege boundary', () => {
  it('anon cannot execute auth_workspace_ids() — must fail closed, not return an empty result', async (ctx) => {
    if (!supabaseReachable) return ctx.skip();

    const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/auth_workspace_ids`, {
      method: 'POST',
      headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}`, 'Content-Type': 'application/json' },
      body: '{}',
    });
    const body = await r.json();

    // Before the fix this was HTTP 200 with body `[]` — anon COULD execute
    // it (auth.uid() just happened to be null, so it returned nothing).
    // After the fix it must be rejected at the permission layer.
    expect(r.status).toBe(401);
    expect(body.code).toBe('42501');
  });

  it('anon cannot execute auth_has_role()', async (ctx) => {
    if (!supabaseReachable) return ctx.skip();

    const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/auth_has_role`, {
      method: 'POST',
      headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_workspace: '00000000-0000-0000-0000-000000000000', p_roles: ['admin'] }),
    });
    const body = await r.json();

    expect(r.status).toBe(401);
    expect(body.code).toBe('42501');
  });

  it('anon cannot execute is_super_admin() — same anti-pattern, same fix', async (ctx) => {
    if (!supabaseReachable) return ctx.skip();

    const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/is_super_admin`, {
      method: 'POST',
      headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}`, 'Content-Type': 'application/json' },
      body: '{}',
    });
    const body = await r.json();

    expect(r.status).toBe(401);
    expect(body.code).toBe('42501');
  });

  it('authenticated keeps exactly the access RLS needs: RLS-gated queries still work end-to-end for a real logged-in user', async (ctx) => {
    if (!supabaseReachable) return ctx.skip();

    authClient = createClient(SUPABASE_URL, ANON_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
    const { error: signInError } = await authClient.auth.signInWithPassword({
      email: SUPERADMIN_EMAIL,
      password: SUPERADMIN_PASSWORD,
    });
    expect(signInError).toBeNull();

    // "workspaces_select_members" (USING id IN (SELECT auth_workspace_ids())
    // OR public.is_super_admin()) only returns rows because `authenticated`
    // can still execute both functions. If either grant were missing, this
    // would error with "permission denied for function ...", not just
    // filter rows out — so a successful, non-empty result here is the
    // actual regression signal.
    const { data: workspaces, error: workspaceError } = await authClient.from('workspaces').select('id, name');
    expect(workspaceError).toBeNull();
    expect((workspaces ?? []).length).toBeGreaterThan(0);
  });

  it('a company cannot query another company\'s data: cross-tenant isolation holds at the RLS layer for a non-super-admin user', async (ctx) => {
    if (!supabaseReachable) return ctx.skip();

    // superadmin@onyxlink.local is a platform super admin and deliberately
    // sees every workspace via workspaces_select_members' `OR
    // public.is_super_admin()` clause — testing isolation with that account
    // would pass for the wrong reason. cliente@empresaa.local has no such
    // bypass: it is only ever a member of "Empresa A", so this is the
    // account that actually proves auth_workspace_ids() is scoping
    // correctly rather than merely "not erroring".
    nonSuperAdminClient = createClient(SUPABASE_URL, ANON_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
    const { error: signInError } = await nonSuperAdminClient.auth.signInWithPassword({
      email: NON_SUPERADMIN_EMAIL,
      password: NON_SUPERADMIN_PASSWORD,
    });
    expect(signInError).toBeNull();

    const { data: memberships, error: membershipError } = await nonSuperAdminClient
      .from('memberships')
      .select('workspace_id')
      .eq('is_active', true);
    expect(membershipError).toBeNull();
    const memberWorkspaceIds = new Set((memberships ?? []).map((m) => m.workspace_id as string));
    expect(memberWorkspaceIds.size).toBeGreaterThan(0);

    const { data: workspaces, error: workspaceError } = await nonSuperAdminClient.from('workspaces').select('id, name');
    expect(workspaceError).toBeNull();
    expect((workspaces ?? []).length).toBeGreaterThan(0);

    // The actual isolation assertion: every workspace returned must be one
    // this user is an active member of. "Empresa B" (or any workspace this
    // user never joined) must never appear here.
    for (const ws of workspaces ?? []) {
      expect(memberWorkspaceIds.has(ws.id as string)).toBe(true);
    }
  });

  it('service_role still bypasses RLS entirely and can read every workspace regardless of membership', async (ctx) => {
    if (!supabaseReachable) return ctx.skip();

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data, error } = await admin.from('workspaces').select('id');
    expect(error).toBeNull();
    // Seeded locally: at least "Empresa A" and "Empresa B" — service_role
    // (BYPASSRLS) must see both, unlike the authenticated check above.
    expect((data ?? []).length).toBeGreaterThanOrEqual(2);
  });
});
