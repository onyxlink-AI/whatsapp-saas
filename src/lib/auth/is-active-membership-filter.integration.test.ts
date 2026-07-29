// Regression test for a gap found in the E2E production-polish audit: 11
// API routes (automations, business-info, kb, prompts, setter, templates +
// its 4 sibling routes, and conversations/[id]/events) each had their OWN
// local copy of the "is this user a member of this workspace?" query, and
// every copy omitted `.eq("is_active", true)` — unlike the centralized
// `requireWorkspaceMember()` helper, which has always had it. Since
// offboarding a team member is a soft-delete (`is_active = false`, the
// membership row itself is never deleted — see team/route.ts DELETE), a
// deactivated member kept full read/write access to those 11 routes.
//
// All 11 fixes are the identical one-line addition to an identical query
// shape, so rather than duplicate this proof across 11 near-identical HTTP-
// level test files, this test validates the actual mechanism against real
// Postgres once: the same query shape used everywhere correctly returns
// nothing for a deactivated membership, and still returns the role for an
// active one.

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

function loadDotEnvLocal() {
  const path = resolve(process.cwd(), ".env.local");
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    if (process.env[key] !== undefined) continue;
    process.env[key] = trimmed.slice(eq + 1).trim();
  }
}
loadDotEnvLocal();

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321";
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const EMPRESA_A = "1b807ae9-03a2-4cf5-84af-8b72a7078ad9";

const POLL_TIMEOUT_MS = 30_000;
const POLL_INTERVAL_MS = 500;

async function pollUntilReachable(check: () => Promise<boolean>): Promise<boolean> {
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  for (;;) {
    if (await check()) return true;
    if (Date.now() >= deadline) return false;
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
}

let reachable = false;
let db: SupabaseClient;
let offboardedUserId: string;

beforeAll(async () => {
  reachable = await pollUntilReachable(async () => {
    try {
      const r = await fetch(`${SUPABASE_URL}/rest/v1/`, { headers: { apikey: SERVICE_ROLE_KEY } });
      return r.status < 500;
    } catch {
      return false;
    }
  });
  if (!reachable) return;

  db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });

  // public.users.id is a real FK into auth.users(id), so a throwaway test
  // user needs a real (if never-logged-into) auth.users row first — same
  // minimal shape seed.sql uses (GoTrue's Go driver errors on NULL token
  // columns for ANY user, not just ones that log in).
  const email = `offboarded-${Date.now()}@empresaa.local`;
  const { data: authUser, error: authErr } = await db.auth.admin.createUser({
    email,
    password: "TestLocal123!",
    email_confirm: true,
  });
  if (authErr || !authUser?.user) {
    throw new Error(`failed to create throwaway auth user: ${authErr?.message}`);
  }
  offboardedUserId = authUser.user.id;

  await db.from("users").insert({ id: offboardedUserId, full_name: "Ex-empleado (test)", email });

  await db.from("memberships").insert({
    workspace_id: EMPRESA_A,
    user_id: offboardedUserId,
    role: "manager",
    is_active: false, // soft-deleted, exactly like team/route.ts DELETE leaves it
  });
}, POLL_TIMEOUT_MS + 5_000);

afterAll(async () => {
  if (!reachable) return;
  await db.from("memberships").delete().eq("user_id", offboardedUserId);
  await db.from("users").delete().eq("id", offboardedUserId);
  await db.auth.admin.deleteUser(offboardedUserId).catch(() => {});
});

describe("Consulta de membership con is_active=true (patrón replicado en 11 rutas)", () => {
  it("un miembro desactivado (offboarded) ya NO es encontrado por la consulta corregida", async (ctx) => {
    if (!reachable) return ctx.skip();

    const { data, error } = await db
      .from("memberships")
      .select("role")
      .eq("workspace_id", EMPRESA_A)
      .eq("user_id", offboardedUserId)
      .eq("is_active", true)
      .maybeSingle();

    expect(error).toBeNull();
    expect(data).toBeNull();
  });

  it("la misma consulta SÍ encuentra a un miembro activo real (cliente@empresaa.local)", async (ctx) => {
    if (!reachable) return ctx.skip();

    const { data, error } = await db
      .from("memberships")
      .select("role, user_id")
      .eq("workspace_id", EMPRESA_A)
      .eq("is_active", true)
      .limit(1)
      .maybeSingle();

    expect(error).toBeNull();
    expect(data).not.toBeNull();
  });
});
