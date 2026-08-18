import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// TAREA 1 — separación segura entre administradores internos y clientes.
// Mismo patrón que rls-helper-privileges.test.ts: estas aserciones son sobre
// GRANT/REVOKE reales y aplicación real de RLS/privilegios de columna contra
// el Supabase local (`supabase start`) — un mock solo probaría el mock. Se
// saltan (no fallan) si el stack local no está arriba.

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
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

const SUPERADMIN_ID = "94ede212-a935-4259-a0e9-5a1547422477";
const SUPERADMIN_EMAIL = "superadmin@onyxlink.local";
const SUPERADMIN_PASSWORD = "TestLocal123!";

// Cliente Empresa A: admin de SU workspace (memberships.role='admin'), pero
// nunca personal de OnyxLink — el usuario que debe demostrar que un admin de
// cliente jamás cuenta como platform staff, sea cual sea su rol de workspace.
const CLIENT_ID = "8a0684ce-05ee-4741-a26c-5131df1924ba";
const CLIENT_EMAIL = "cliente@empresaa.local";
const CLIENT_PASSWORD = "TestLocal123!";

const POLL_TIMEOUT_MS = 30_000;

async function pollUntilReachable(check: () => Promise<boolean>): Promise<boolean> {
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  for (;;) {
    if (await check()) return true;
    if (Date.now() >= deadline) return false;
    await new Promise((r) => setTimeout(r, 500));
  }
}

let reachable = false;
let db: SupabaseClient; // service_role — solo para preparar/leer fixtures, nunca para ejercitar la RPC en sí

beforeAll(async () => {
  reachable = await pollUntilReachable(async () => {
    try {
      const r = await fetch(`${SUPABASE_URL}/rest/v1/`, { headers: { apikey: ANON_KEY } });
      return r.status < 500;
    } catch {
      return false;
    }
  });
  if (!reachable) return;
  db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
}, POLL_TIMEOUT_MS + 5_000);

afterEach(async () => {
  if (!reachable) return;
  // Ningún test debe dejar CLIENT_ID con platform_role distinto de null ni
  // is_super_admin en true — se restaura siempre, tanto si el test tocó las
  // columnas a mano (vía service_role) como si el propio test de escalada
  // las dejó intactas.
  await db.from("users").update({ platform_role: null, is_super_admin: false }).eq("id", CLIENT_ID);
});

afterAll(async () => {
  if (!reachable) return;
  await db.from("users").update({ platform_role: null, is_super_admin: false }).eq("id", CLIENT_ID);
});

describe("platform_role — backfill y compatibilidad", () => {
  it("el superadmin sembrado (is_super_admin=true) quedó backfilleado a platform_role='super_admin'", async (ctx) => {
    if (!reachable) return ctx.skip();
    const { data, error } = await db.from("users").select("is_super_admin, platform_role").eq("id", SUPERADMIN_ID).single();
    expect(error).toBeNull();
    expect(data).toMatchObject({ is_super_admin: true, platform_role: "super_admin" });
  });

  it("cliente@empresaa.local (nunca super admin) tiene platform_role=null", async (ctx) => {
    if (!reachable) return ctx.skip();
    const { data, error } = await db.from("users").select("is_super_admin, platform_role").eq("id", CLIENT_ID).single();
    expect(error).toBeNull();
    expect(data).toMatchObject({ is_super_admin: false, platform_role: null });
  });
});

describe("is_platform_staff() — privilegios de ejecución", () => {
  it("anon no puede ejecutar is_platform_staff() — falla cerrado, no devuelve false silenciosamente", async (ctx) => {
    if (!reachable) return ctx.skip();
    const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/is_platform_staff`, {
      method: "POST",
      headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}`, "Content-Type": "application/json" },
      body: "{}",
    });
    const body = await r.json();
    expect(r.status).toBe(401);
    expect(body.code).toBe("42501");
  });

  it("cliente con memberships.role='admin' de su workspace pero platform_role=null: is_platform_staff() = false", async (ctx) => {
    if (!reachable) return ctx.skip();
    const client = createClient(SUPABASE_URL, ANON_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
    const { error: signInErr } = await client.auth.signInWithPassword({ email: CLIENT_EMAIL, password: CLIENT_PASSWORD });
    expect(signInErr).toBeNull();

    const { data, error } = await client.rpc("is_platform_staff");
    expect(error).toBeNull();
    expect(data).toBe(false);

    await client.auth.signOut().catch(() => {});
  });

  it("internal_admin (asignado a mano vía service_role, único camino previsto): is_platform_staff() = true", async (ctx) => {
    if (!reachable) return ctx.skip();

    const { error: setErr } = await db.from("users").update({ platform_role: "internal_admin" }).eq("id", CLIENT_ID);
    expect(setErr).toBeNull();

    const client = createClient(SUPABASE_URL, ANON_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
    const { error: signInErr } = await client.auth.signInWithPassword({ email: CLIENT_EMAIL, password: CLIENT_PASSWORD });
    expect(signInErr).toBeNull();

    const { data, error } = await client.rpc("is_platform_staff");
    expect(error).toBeNull();
    expect(data).toBe(true);

    await client.auth.signOut().catch(() => {});
  });

  it("super_admin (sembrado y backfilleado): is_platform_staff() = true", async (ctx) => {
    if (!reachable) return ctx.skip();
    const client = createClient(SUPABASE_URL, ANON_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
    const { error: signInErr } = await client.auth.signInWithPassword({ email: SUPERADMIN_EMAIL, password: SUPERADMIN_PASSWORD });
    expect(signInErr).toBeNull();

    const { data, error } = await client.rpc("is_platform_staff");
    expect(error).toBeNull();
    expect(data).toBe(true);

    await client.auth.signOut().catch(() => {});
  });

  // TAREA 1B, prueba obligatoria 3: el mismo bug que se corrigió en
  // requirePlatformStaff() (TypeScript) debía existir también a nivel de
  // RLS — is_platform_staff() ahora incluye `OR is_super_admin = TRUE`
  // explícitamente para que un superadministrador legado (is_super_admin
  // =true, platform_role todavía sin backfillear) nunca quede fuera aquí.
  it("superadministrador legado (is_super_admin=true, platform_role=null): is_platform_staff() = true", async (ctx) => {
    if (!reachable) return ctx.skip();

    const { error: setErr } = await db.from("users").update({ is_super_admin: true, platform_role: null }).eq("id", CLIENT_ID);
    expect(setErr).toBeNull();

    const client = createClient(SUPABASE_URL, ANON_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
    const { error: signInErr } = await client.auth.signInWithPassword({ email: CLIENT_EMAIL, password: CLIENT_PASSWORD });
    expect(signInErr).toBeNull();

    const { data, error } = await client.rpc("is_platform_staff");
    expect(error).toBeNull();
    expect(data).toBe(true);

    await client.auth.signOut().catch(() => {});
  });
});

describe("Bloqueo de auto-escalada — a nivel de base de datos, no de interfaz", () => {
  it("un usuario NO puede auto-asignarse platform_role con un PATCH directo a su propia fila (REVOKE UPDATE de columna)", async (ctx) => {
    if (!reachable) return ctx.skip();

    const client = createClient(SUPABASE_URL, ANON_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data: signInData, error: signInErr } = await client.auth.signInWithPassword({ email: CLIENT_EMAIL, password: CLIENT_PASSWORD });
    expect(signInErr).toBeNull();
    const jwt = signInData.session?.access_token;
    expect(jwt).toBeTruthy();

    // PATCH directo vía REST — la política RLS "users_update_own" permitiría
    // esto por fila (id = auth.uid()), así que si esto pasara sería SOLO
    // gracias al REVOKE UPDATE (platform_role) de la migración.
    const r = await fetch(`${SUPABASE_URL}/rest/v1/users?id=eq.${CLIENT_ID}`, {
      method: "PATCH",
      headers: {
        apikey: ANON_KEY,
        Authorization: `Bearer ${jwt}`,
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify({ platform_role: "super_admin" }),
    });
    expect(r.status).not.toBe(200);
    expect(r.status).not.toBe(201);
    const body = await r.json().catch(() => ({}));
    expect(body.code).toBe("42501");

    await client.auth.signOut().catch(() => {});

    // Confirmación directa en base de datos: el intento no coló por ninguna
    // otra vía — la fila sigue exactamente como estaba.
    const { data: after } = await db.from("users").select("platform_role").eq("id", CLIENT_ID).single();
    expect(after?.platform_role).toBeNull();
  });

  // TAREA 1B, prueba obligatoria 6 (segunda mitad): el mismo PATCH directo
  // pero contra is_super_admin — el agujero preexistente que se cerró en la
  // misma migración que platform_role, con el mismo mecanismo (REVOKE UPDATE
  // de tabla completa + GRANT de vuelta solo de las columnas seguras).
  it("un usuario NO puede auto-asignarse is_super_admin=true con un PATCH directo a su propia fila", async (ctx) => {
    if (!reachable) return ctx.skip();

    const client = createClient(SUPABASE_URL, ANON_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data: signInData, error: signInErr } = await client.auth.signInWithPassword({ email: CLIENT_EMAIL, password: CLIENT_PASSWORD });
    expect(signInErr).toBeNull();
    const jwt = signInData.session?.access_token;

    const r = await fetch(`${SUPABASE_URL}/rest/v1/users?id=eq.${CLIENT_ID}`, {
      method: "PATCH",
      headers: {
        apikey: ANON_KEY,
        Authorization: `Bearer ${jwt}`,
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify({ is_super_admin: true }),
    });
    expect(r.status).not.toBe(200);
    expect(r.status).not.toBe(201);
    const body = await r.json().catch(() => ({}));
    expect(body.code).toBe("42501");

    await client.auth.signOut().catch(() => {});

    const { data: after } = await db.from("users").select("is_super_admin").eq("id", CLIENT_ID).single();
    expect(after?.is_super_admin).toBe(false);
  });

  // TAREA 1B, prueba obligatoria 7: un internal_admin es autenticado con el
  // MISMO rol de Postgres (`authenticated`) que cualquier otro usuario — el
  // REVOKE de columna no distingue "quién" está autenticado, así que un
  // internal_admin queda igual de bloqueado que un cliente normal para
  // auto-escalarse a super_admin, por cualquiera de las dos columnas.
  it("un internal_admin NO puede auto-ascenderse a super_admin (ni por platform_role ni por is_super_admin)", async (ctx) => {
    if (!reachable) return ctx.skip();

    const { error: setErr } = await db.from("users").update({ platform_role: "internal_admin" }).eq("id", CLIENT_ID);
    expect(setErr).toBeNull();

    const client = createClient(SUPABASE_URL, ANON_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data: signInData, error: signInErr } = await client.auth.signInWithPassword({ email: CLIENT_EMAIL, password: CLIENT_PASSWORD });
    expect(signInErr).toBeNull();
    const jwt = signInData.session?.access_token;

    const rPlatformRole = await fetch(`${SUPABASE_URL}/rest/v1/users?id=eq.${CLIENT_ID}`, {
      method: "PATCH",
      headers: { apikey: ANON_KEY, Authorization: `Bearer ${jwt}`, "Content-Type": "application/json", Prefer: "return=representation" },
      body: JSON.stringify({ platform_role: "super_admin" }),
    });
    expect(rPlatformRole.status).not.toBe(200);
    expect((await rPlatformRole.json().catch(() => ({}))).code).toBe("42501");

    const rIsSuperAdmin = await fetch(`${SUPABASE_URL}/rest/v1/users?id=eq.${CLIENT_ID}`, {
      method: "PATCH",
      headers: { apikey: ANON_KEY, Authorization: `Bearer ${jwt}`, "Content-Type": "application/json", Prefer: "return=representation" },
      body: JSON.stringify({ is_super_admin: true }),
    });
    expect(rIsSuperAdmin.status).not.toBe(200);
    expect((await rIsSuperAdmin.json().catch(() => ({}))).code).toBe("42501");

    await client.auth.signOut().catch(() => {});

    const { data: after } = await db.from("users").select("platform_role, is_super_admin").eq("id", CLIENT_ID).single();
    expect(after).toMatchObject({ platform_role: "internal_admin", is_super_admin: false });
  });

  it("un usuario SÍ puede seguir actualizando otras columnas de su propio perfil (el REVOKE es específico de platform_role/is_super_admin, no bloquea todo el UPDATE)", async (ctx) => {
    if (!reachable) return ctx.skip();

    const client = createClient(SUPABASE_URL, ANON_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data: signInData, error: signInErr } = await client.auth.signInWithPassword({ email: CLIENT_EMAIL, password: CLIENT_PASSWORD });
    expect(signInErr).toBeNull();
    const jwt = signInData.session?.access_token;

    const { data: before } = await db.from("users").select("full_name").eq("id", CLIENT_ID).single();

    const r = await fetch(`${SUPABASE_URL}/rest/v1/users?id=eq.${CLIENT_ID}`, {
      method: "PATCH",
      headers: {
        apikey: ANON_KEY,
        Authorization: `Bearer ${jwt}`,
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify({ full_name: before?.full_name }),
    });
    expect(r.status).toBe(200);

    await client.auth.signOut().catch(() => {});
  });

  it("service_role (BYPASSRLS) sigue pudiendo escribir platform_role con normalidad — única vía prevista para asignar internal_admin", async (ctx) => {
    if (!reachable) return ctx.skip();
    const { error } = await db.from("users").update({ platform_role: "internal_admin" }).eq("id", CLIENT_ID);
    expect(error).toBeNull();
    const { data } = await db.from("users").select("platform_role").eq("id", CLIENT_ID).single();
    expect(data?.platform_role).toBe("internal_admin");
  });

  it("el CHECK constraint rechaza cualquier valor de platform_role fuera de internal_admin/super_admin/null", async (ctx) => {
    if (!reachable) return ctx.skip();
    const { error } = await db.from("users").update({ platform_role: "workspace_admin" }).eq("id", CLIENT_ID);
    expect(error).not.toBeNull();
    expect(error?.code).toBe("23514");
  });
});
