// Regression test for the cross-tenant IDOR found in the E2E production-
// polish audit: publishPromptVersion() used to run three unscoped UPDATEs —
// none filtered by workspace_id — so a caller who merely knew a prompt/
// version id from a DIFFERENT workspace could publish it there. The fix
// moved this into a single SECURITY DEFINER RPC (publish_prompt_version)
// that requires the prompt to actually belong to the given workspace_id.
// This needs the real local Postgres stack (RPC + real FK relationships),
// not a mock — a mock would just prove the mock, not the fix.

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
const EMPRESA_B = "9003dc6d-dafa-48b3-be17-71e36e08272d";

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

// Test fixtures created fresh in beforeAll, cleaned up in afterAll — never
// touching the seeded prompts, so this file is safe to run alongside the
// rest of the suite without disturbing other tests' fixtures.
let promptA: string;
let versionA: string;
let promptB: string;
let versionB: string;

beforeAll(async () => {
  reachable = await pollUntilReachable(async () => {
    try {
      const r = await fetch(`${SUPABASE_URL}/rest/v1/`, {
        headers: { apikey: SERVICE_ROLE_KEY },
      });
      return r.status < 500;
    } catch {
      return false;
    }
  });
  if (!reachable) return;

  db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: pA } = await db
    .from("prompts")
    .insert({ workspace_id: EMPRESA_A, scope: "global", name: "IDOR test A" })
    .select("id")
    .single();
  promptA = pA!.id as string;

  const { data: vA } = await db
    .from("prompt_versions")
    .insert({ workspace_id: EMPRESA_A, prompt_id: promptA, version: 1, state: "draft", body: "hola A" })
    .select("id")
    .single();
  versionA = vA!.id as string;

  const { data: pB } = await db
    .from("prompts")
    .insert({ workspace_id: EMPRESA_B, scope: "global", name: "IDOR test B" })
    .select("id")
    .single();
  promptB = pB!.id as string;

  const { data: vB } = await db
    .from("prompt_versions")
    .insert({ workspace_id: EMPRESA_B, prompt_id: promptB, version: 1, state: "draft", body: "hola B" })
    .select("id")
    .single();
  versionB = vB!.id as string;
}, POLL_TIMEOUT_MS + 5_000);

afterAll(async () => {
  if (!reachable) return;
  await db.from("prompts").delete().in("id", [promptA, promptB].filter(Boolean));
});

describe("publishPromptVersion — aislamiento cross-tenant", () => {
  it("rechaza publicar la versión de OTRO workspace (Empresa A intentando publicar un prompt de Empresa B)", async (ctx) => {
    if (!reachable) return ctx.skip();
    const { publishPromptVersion } = await import("./prompt-resolver");

    await expect(
      publishPromptVersion(EMPRESA_A, promptB, versionB),
    ).rejects.toThrow();

    // Confirm Empresa B's version was NOT actually published by the attempt.
    const { data: versionRow } = await db
      .from("prompt_versions")
      .select("state, published_at")
      .eq("id", versionB)
      .single();
    expect(versionRow!.state).toBe("draft");
    expect(versionRow!.published_at).toBeNull();

    const { data: promptRow } = await db
      .from("prompts")
      .select("active_version_id")
      .eq("id", promptB)
      .single();
    expect(promptRow!.active_version_id).toBeNull();
  });

  it("publica correctamente cuando el workspace SÍ coincide con el dueño real del prompt", async (ctx) => {
    if (!reachable) return ctx.skip();
    const { publishPromptVersion } = await import("./prompt-resolver");

    await publishPromptVersion(EMPRESA_A, promptA, versionA);

    const { data: versionRow } = await db
      .from("prompt_versions")
      .select("state, published_at")
      .eq("id", versionA)
      .single();
    expect(versionRow!.state).toBe("published");
    expect(versionRow!.published_at).not.toBeNull();

    const { data: promptRow } = await db
      .from("prompts")
      .select("active_version_id")
      .eq("id", promptA)
      .single();
    expect(promptRow!.active_version_id).toBe(versionA);
  });
});
