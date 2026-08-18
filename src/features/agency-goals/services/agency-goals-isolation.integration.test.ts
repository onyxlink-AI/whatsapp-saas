import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// TAREA 2 — Dirección interna, módulo de Objetivos. Igual que
// platform-role-isolation.integration.test.ts: esto ejercita RLS real y
// restricciones CHECK reales contra el Supabase local (`supabase start`) —
// un mock solo probaría el mock. Se salta (no falla) si el stack local no
// está arriba. agency_goals no tiene workspace_id (dato interno global de la
// agencia): el aislamiento correcto aquí es "solo personal de plataforma
// entra", no "cada workspace ve lo suyo".

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

// Cliente Empresa A: admin de SU workspace, nunca personal de OnyxLink — el
// usuario que debe demostrar que ni siquiera un admin de cliente puede leer
// ni escribir agency_goals.
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
let db: SupabaseClient; // service_role — solo para fixtures/limpieza, nunca para ejercitar RLS

const createdGoalIds = new Set<string>();

function goalPayload(overrides: Record<string, unknown> = {}) {
  return {
    title: "Objetivo de prueba de aislamiento",
    period_type: "annual",
    period_start: "2026-01-01",
    period_end: "2026-12-31",
    status: "pending",
    progress: 0,
    ...overrides,
  };
}

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
  // Restaura CLIENT_ID a "nunca personal de plataforma" pase lo que pase en
  // el test, y limpia cualquier fila que haya podido colarse.
  await db.from("users").update({ platform_role: null, is_super_admin: false }).eq("id", CLIENT_ID);
  if (createdGoalIds.size > 0) {
    await db.from("agency_goals").delete().in("id", [...createdGoalIds]);
    createdGoalIds.clear();
  }
});

afterAll(async () => {
  if (!reachable) return;
  await db.from("users").update({ platform_role: null, is_super_admin: false }).eq("id", CLIENT_ID);
});

async function signIn(email: string, password: string) {
  const client = createClient(SUPABASE_URL, ANON_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
  const { error } = await client.auth.signInWithPassword({ email, password });
  expect(error).toBeNull();
  return client;
}

describe("agency_goals — RLS: lectura", () => {
  it("anon no puede leer agency_goals (bloqueado a nivel de privilegio, ni siquiera llega a evaluar RLS: REVOKE ALL ... FROM anon)", async (ctx) => {
    if (!reachable) return ctx.skip();
    const anon = createClient(SUPABASE_URL, ANON_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data, error } = await anon.from("agency_goals").select("id");
    expect(error?.code).toBe("42501");
    expect(data).toBeNull();
  });

  it("un admin de cliente no puede leer agency_goals (RLS filtra a cero filas, no lanza error)", async (ctx) => {
    if (!reachable) return ctx.skip();
    const { data: seeded } = await db.from("agency_goals").insert(goalPayload()).select("id").single();
    if (seeded) createdGoalIds.add(seeded.id);

    const client = await signIn(CLIENT_EMAIL, CLIENT_PASSWORD);
    const { data, error } = await client.from("agency_goals").select("id");
    expect(error).toBeNull();
    expect(data).toEqual([]);
    await client.auth.signOut().catch(() => {});
  });

  it("internal_admin sí puede leer agency_goals", async (ctx) => {
    if (!reachable) return ctx.skip();
    const { error: setErr } = await db.from("users").update({ platform_role: "internal_admin" }).eq("id", CLIENT_ID);
    expect(setErr).toBeNull();
    const { data: seeded } = await db.from("agency_goals").insert(goalPayload()).select("id").single();
    if (seeded) createdGoalIds.add(seeded.id);

    const client = await signIn(CLIENT_EMAIL, CLIENT_PASSWORD);
    const { data, error } = await client.from("agency_goals").select("id").eq("id", seeded!.id);
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    await client.auth.signOut().catch(() => {});
  });

  it("super_admin sí puede leer agency_goals", async (ctx) => {
    if (!reachable) return ctx.skip();
    const { data: seeded } = await db.from("agency_goals").insert(goalPayload()).select("id").single();
    if (seeded) createdGoalIds.add(seeded.id);

    const client = await signIn(SUPERADMIN_EMAIL, SUPERADMIN_PASSWORD);
    const { data, error } = await client.from("agency_goals").select("id").eq("id", seeded!.id);
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    await client.auth.signOut().catch(() => {});
  });
});

describe("agency_goals — RLS: escritura", () => {
  it("un admin de cliente no puede insertar", async (ctx) => {
    if (!reachable) return ctx.skip();
    const client = await signIn(CLIENT_EMAIL, CLIENT_PASSWORD);
    const { error } = await client.from("agency_goals").insert(goalPayload({ created_by: CLIENT_ID }));
    expect(error).not.toBeNull();
    expect(error?.code).toBe("42501");
    await client.auth.signOut().catch(() => {});
  });

  it("un admin de cliente no puede actualizar ni eliminar (0 filas afectadas, sin error, porque RLS ya las oculta)", async (ctx) => {
    if (!reachable) return ctx.skip();
    const { data: seeded } = await db.from("agency_goals").insert(goalPayload()).select("id").single();
    if (seeded) createdGoalIds.add(seeded.id);

    const client = await signIn(CLIENT_EMAIL, CLIENT_PASSWORD);
    const update = await client.from("agency_goals").update({ status: "completed" }).eq("id", seeded!.id).select("id");
    expect(update.data).toEqual([]);

    const del = await client.from("agency_goals").delete().eq("id", seeded!.id).select("id");
    expect(del.data).toEqual([]);
    await client.auth.signOut().catch(() => {});

    const { data: stillThere } = await db.from("agency_goals").select("id, status").eq("id", seeded!.id).single();
    expect(stillThere?.status).toBe("pending");
  });

  it("internal_admin puede insertar, actualizar y eliminar", async (ctx) => {
    if (!reachable) return ctx.skip();
    const { error: setErr } = await db.from("users").update({ platform_role: "internal_admin" }).eq("id", CLIENT_ID);
    expect(setErr).toBeNull();

    const client = await signIn(CLIENT_EMAIL, CLIENT_PASSWORD);

    const { data: inserted, error: insertErr } = await client
      .from("agency_goals")
      .insert(goalPayload({ created_by: CLIENT_ID }))
      .select("id")
      .single();
    expect(insertErr).toBeNull();
    expect(inserted).toBeTruthy();

    const { error: updateErr } = await client.from("agency_goals").update({ status: "in_progress" }).eq("id", inserted!.id);
    expect(updateErr).toBeNull();

    const { error: deleteErr } = await client.from("agency_goals").delete().eq("id", inserted!.id);
    expect(deleteErr).toBeNull();

    await client.auth.signOut().catch(() => {});

    const { data: afterDelete } = await db.from("agency_goals").select("id").eq("id", inserted!.id).maybeSingle();
    expect(afterDelete).toBeNull();
  });

  it("super_admin puede insertar, actualizar y eliminar", async (ctx) => {
    if (!reachable) return ctx.skip();
    const client = await signIn(SUPERADMIN_EMAIL, SUPERADMIN_PASSWORD);

    const { data: inserted, error: insertErr } = await client
      .from("agency_goals")
      .insert(goalPayload())
      .select("id")
      .single();
    expect(insertErr).toBeNull();

    const { error: deleteErr } = await client.from("agency_goals").delete().eq("id", inserted!.id);
    expect(deleteErr).toBeNull();
    await client.auth.signOut().catch(() => {});
  });
});

describe("agency_goals — restricciones CHECK a nivel de base de datos", () => {
  it("rechaza título vacío incluso saltándose la interfaz", async (ctx) => {
    if (!reachable) return ctx.skip();
    const { error } = await db.from("agency_goals").insert(goalPayload({ title: "" }));
    expect(error?.code).toBe("23514");
  });

  it("rechaza progreso fuera de 0-100", async (ctx) => {
    if (!reachable) return ctx.skip();
    const { error: tooLow } = await db.from("agency_goals").insert(goalPayload({ progress: -1 }));
    expect(tooLow?.code).toBe("23514");
    const { error: tooHigh } = await db.from("agency_goals").insert(goalPayload({ progress: 101 }));
    expect(tooHigh?.code).toBe("23514");
  });

  it("rechaza period_type fuera de annual/quarterly/monthly/weekly", async (ctx) => {
    if (!reachable) return ctx.skip();
    const { error } = await db.from("agency_goals").insert(goalPayload({ period_type: "daily" }));
    expect(error?.code).toBe("23514");
  });

  it("rechaza status fuera de pending/in_progress/completed", async (ctx) => {
    if (!reachable) return ctx.skip();
    const { error } = await db.from("agency_goals").insert(goalPayload({ status: "cancelled" }));
    expect(error?.code).toBe("23514");
  });

  it("rechaza period_end anterior a period_start", async (ctx) => {
    if (!reachable) return ctx.skip();
    const { error } = await db.from("agency_goals").insert(goalPayload({ period_start: "2026-06-01", period_end: "2026-01-01" }));
    expect(error?.code).toBe("23514");
  });
});

// ============================================================================
// TAREA 2B — integridad frente a REST directo: un internal_admin con sesión
// real (no service_role) tiene INSERT/UPDATE vía RLS, así que estas pruebas
// ejercitan exactamente esa vía — la misma que un atacante con credenciales
// legítimas de personal interno pero sin pasar por goal-actions.ts usaría.
// ============================================================================
describe("agency_goals — TAREA 2B: integridad frente a REST directo", () => {
  // public.users.id es FK a auth.users(id) ON DELETE CASCADE — no basta con
  // insertar una fila en public.users, hace falta un usuario de auth real
  // detrás (vía el API admin de service_role) para poder referenciarlo como
  // owner_id. Borrar el usuario de auth arrastra la fila de public.users.
  let plainClientId = "";
  let legacySuperAdminId = "";

  beforeAll(async () => {
    if (!reachable) return;
    const stamp = Date.now();

    const { data: plainAuth, error: plainAuthErr } = await db.auth.admin.createUser({
      email: `tarea2b-cliente-${stamp}@test.local`,
      password: "TestLocal123!",
      email_confirm: true,
    });
    expect(plainAuthErr).toBeNull();
    plainClientId = plainAuth!.user!.id;
    await db.from("users").insert({ id: plainClientId, full_name: "Cliente de prueba TAREA2B", email: plainAuth!.user!.email! });

    const { data: legacyAuth, error: legacyAuthErr } = await db.auth.admin.createUser({
      email: `tarea2b-legado-${stamp}@test.local`,
      password: "TestLocal123!",
      email_confirm: true,
    });
    expect(legacyAuthErr).toBeNull();
    legacySuperAdminId = legacyAuth!.user!.id;
    await db
      .from("users")
      .insert({ id: legacySuperAdminId, full_name: "Superadmin legado TAREA2B", email: legacyAuth!.user!.email!, is_super_admin: true });
  });

  afterAll(async () => {
    if (!reachable) return;
    if (plainClientId) await db.auth.admin.deleteUser(plainClientId).catch(() => {});
    if (legacySuperAdminId) await db.auth.admin.deleteUser(legacySuperAdminId).catch(() => {});
  });

  async function actAsInternalAdmin() {
    await db.from("users").update({ platform_role: "internal_admin" }).eq("id", CLIENT_ID);
    return signIn(CLIENT_EMAIL, CLIENT_PASSWORD);
  }

  describe("created_by no falsificable", () => {
    it("INSERT directo con created_by de otro usuario: se reemplaza por auth.uid(), nunca se conserva el valor falsificado", async (ctx) => {
      if (!reachable) return ctx.skip();
      const client = await actAsInternalAdmin();

      const { data: inserted, error } = await client
        .from("agency_goals")
        .insert(goalPayload({ created_by: SUPERADMIN_ID }))
        .select("id, created_by")
        .single();

      expect(error).toBeNull();
      expect(inserted?.created_by).toBe(CLIENT_ID);
      expect(inserted?.created_by).not.toBe(SUPERADMIN_ID);
      if (inserted) createdGoalIds.add(inserted.id);
      await client.auth.signOut().catch(() => {});
    });

    it("UPDATE directo intentando cambiar created_by: no cambia", async (ctx) => {
      if (!reachable) return ctx.skip();
      const client = await actAsInternalAdmin();

      const { data: inserted } = await client.from("agency_goals").insert(goalPayload()).select("id, created_by").single();
      if (inserted) createdGoalIds.add(inserted.id);
      expect(inserted?.created_by).toBe(CLIENT_ID);

      const { data: updated, error } = await client
        .from("agency_goals")
        .update({ created_by: SUPERADMIN_ID })
        .eq("id", inserted!.id)
        .select("created_by")
        .single();

      // El trigger revierte en silencio: la sentencia no falla, pero el
      // valor persistido sigue siendo el original — nunca el falsificado.
      expect(error).toBeNull();
      expect(updated?.created_by).toBe(CLIENT_ID);
      expect(updated?.created_by).not.toBe(SUPERADMIN_ID);
      await client.auth.signOut().catch(() => {});
    });

    // TAREA 2C: la condición "solo se congela cuando auth.uid() no es NULL"
    // depende de QUIÉN hace la petición, no de QUÉ valor manda — así que
    // poner created_by=NULL a mano desde una sesión autenticada se revierte
    // exactamente igual que forjar cualquier otro UUID. Este es el caso que
    // había que probar explícitamente para descartar el atajo que el ajuste
    // de TAREA 2C podría haber abierto.
    it("UPDATE directo intentando poner created_by=NULL a mano: no cambia (no es el mismo camino que ON DELETE SET NULL)", async (ctx) => {
      if (!reachable) return ctx.skip();
      const client = await actAsInternalAdmin();

      const { data: inserted } = await client.from("agency_goals").insert(goalPayload()).select("id, created_by").single();
      if (inserted) createdGoalIds.add(inserted.id);
      expect(inserted?.created_by).toBe(CLIENT_ID);

      const { data: updated, error } = await client
        .from("agency_goals")
        .update({ created_by: null })
        .eq("id", inserted!.id)
        .select("created_by")
        .single();

      expect(error).toBeNull();
      expect(updated?.created_by).toBe(CLIENT_ID);
      expect(updated?.created_by).not.toBeNull();
      await client.auth.signOut().catch(() => {});
    });

    // TAREA 2C — la prueba de ciclo de vida completa: crea un usuario real,
    // un objetivo cuyo created_by apunta a ese usuario, borra al usuario por
    // la vía administrativa legítima (auth.admin.deleteUser, la misma que
    // usa el resto de este archivo para limpiar sus propios fixtures — sin
    // JWT de usuario final, así que auth.uid() es NULL en esa operación) y
    // confirma que el borrado no falla, el objetivo sobrevive, y created_by
    // queda en NULL — la acción referencial ON DELETE SET NULL debe poder
    // completar el UPDATE que el trigger de inmutabilidad, antes de TAREA
    // 2C, bloqueaba incondicionalmente.
    it("eliminar al usuario creador: el borrado no falla, el objetivo permanece, created_by queda NULL", async (ctx) => {
      if (!reachable) return ctx.skip();

      const stamp = Date.now();
      const { data: tempAuth, error: tempAuthErr } = await db.auth.admin.createUser({
        email: `tarea2c-creador-${stamp}@test.local`,
        password: "TestLocal123!",
        email_confirm: true,
      });
      expect(tempAuthErr).toBeNull();
      const tempUserId = tempAuth!.user!.id;
      await db
        .from("users")
        .insert({ id: tempUserId, full_name: "Creador temporal TAREA2C", email: tempAuth!.user!.email!, platform_role: "internal_admin" });

      const { data: goal, error: goalErr } = await db
        .from("agency_goals")
        .insert(goalPayload({ created_by: tempUserId }))
        .select("id, created_by")
        .single();
      expect(goalErr).toBeNull();
      expect(goal?.created_by).toBe(tempUserId);
      createdGoalIds.add(goal!.id);

      const { error: deleteErr } = await db.auth.admin.deleteUser(tempUserId);
      expect(deleteErr).toBeNull();

      const { data: afterDelete, error: readErr } = await db
        .from("agency_goals")
        .select("id, created_by")
        .eq("id", goal!.id)
        .single();
      expect(readErr).toBeNull();
      expect(afterDelete).not.toBeNull();
      expect(afterDelete?.created_by).toBeNull();

      // No hace falta borrar tempUserId aparte: auth.admin.deleteUser ya lo
      // eliminó (y con él, en cascada, su fila de public.users). El
      // objetivo en sí se limpia igual que el resto vía createdGoalIds.
    });
  });

  describe("responsable (owner_id) debe ser personal interno", () => {
    it("INSERT con owner_id de un cliente normal: rechazado", async (ctx) => {
      if (!reachable) return ctx.skip();
      const client = await actAsInternalAdmin();
      const { error } = await client.from("agency_goals").insert(goalPayload({ owner_id: plainClientId }));
      expect(error?.code).toBe("23514");
      await client.auth.signOut().catch(() => {});
    });

    it("UPDATE asignando owner_id de un cliente normal: rechazado, el valor no cambia", async (ctx) => {
      if (!reachable) return ctx.skip();
      const client = await actAsInternalAdmin();
      const { data: inserted } = await client.from("agency_goals").insert(goalPayload()).select("id").single();
      if (inserted) createdGoalIds.add(inserted.id);

      const { error } = await client.from("agency_goals").update({ owner_id: plainClientId }).eq("id", inserted!.id);
      expect(error?.code).toBe("23514");

      const { data: stillNull } = await db.from("agency_goals").select("owner_id").eq("id", inserted!.id).single();
      expect(stillNull?.owner_id).toBeNull();
      await client.auth.signOut().catch(() => {});
    });

    it("owner_id null: aceptado", async (ctx) => {
      if (!reachable) return ctx.skip();
      const client = await actAsInternalAdmin();
      const { data: inserted, error } = await client.from("agency_goals").insert(goalPayload({ owner_id: null })).select("id").single();
      expect(error).toBeNull();
      if (inserted) createdGoalIds.add(inserted.id);
      await client.auth.signOut().catch(() => {});
    });

    it("owner_id de un internal_admin: aceptado", async (ctx) => {
      if (!reachable) return ctx.skip();
      const client = await actAsInternalAdmin();
      // CLIENT_ID es internal_admin en este punto — se asigna a sí mismo como responsable.
      const { data: inserted, error } = await client.from("agency_goals").insert(goalPayload({ owner_id: CLIENT_ID })).select("id").single();
      expect(error).toBeNull();
      if (inserted) createdGoalIds.add(inserted.id);
      await client.auth.signOut().catch(() => {});
    });

    it("owner_id de un super_admin: aceptado", async (ctx) => {
      if (!reachable) return ctx.skip();
      const client = await actAsInternalAdmin();
      const { data: inserted, error } = await client.from("agency_goals").insert(goalPayload({ owner_id: SUPERADMIN_ID })).select("id").single();
      expect(error).toBeNull();
      if (inserted) createdGoalIds.add(inserted.id);
      await client.auth.signOut().catch(() => {});
    });

    it("owner_id de un superadministrador legado (is_super_admin=true, platform_role=null): aceptado", async (ctx) => {
      if (!reachable) return ctx.skip();
      const client = await actAsInternalAdmin();
      const { data: inserted, error } = await client.from("agency_goals").insert(goalPayload({ owner_id: legacySuperAdminId })).select("id").single();
      expect(error).toBeNull();
      if (inserted) createdGoalIds.add(inserted.id);
      await client.auth.signOut().catch(() => {});
    });
  });

  describe("periodos canónicos por período", () => {
    it("INSERT anual con fechas de marzo a abril: rechazado", async (ctx) => {
      if (!reachable) return ctx.skip();
      const client = await actAsInternalAdmin();
      const { error } = await client
        .from("agency_goals")
        .insert(goalPayload({ period_type: "annual", period_start: "2026-03-01", period_end: "2026-04-30" }));
      expect(error?.code).toBe("23514");
      await client.auth.signOut().catch(() => {});
    });

    it("INSERT trimestral con límites incorrectos (no alineado a un trimestre natural): rechazado", async (ctx) => {
      if (!reachable) return ctx.skip();
      const client = await actAsInternalAdmin();
      const { error } = await client
        .from("agency_goals")
        .insert(goalPayload({ period_type: "quarterly", period_start: "2026-02-01", period_end: "2026-04-30" }));
      expect(error?.code).toBe("23514");
      await client.auth.signOut().catch(() => {});
    });

    it("INSERT mensual con límites incorrectos (no empieza el día 1): rechazado", async (ctx) => {
      if (!reachable) return ctx.skip();
      const client = await actAsInternalAdmin();
      const { error } = await client
        .from("agency_goals")
        .insert(goalPayload({ period_type: "monthly", period_start: "2026-03-05", period_end: "2026-03-31" }));
      expect(error?.code).toBe("23514");
      await client.auth.signOut().catch(() => {});
    });

    it("INSERT semanal con límites incorrectos (no empieza en lunes): rechazado", async (ctx) => {
      if (!reachable) return ctx.skip();
      const client = await actAsInternalAdmin();
      // 2026-03-17 es martes, no lunes.
      const { error } = await client
        .from("agency_goals")
        .insert(goalPayload({ period_type: "weekly", period_start: "2026-03-17", period_end: "2026-03-23" }));
      expect(error?.code).toBe("23514");
      await client.auth.signOut().catch(() => {});
    });

    it("acepta los 4 periodos canónicos (anual, trimestral, mensual, semanal)", async (ctx) => {
      if (!reachable) return ctx.skip();
      const client = await actAsInternalAdmin();

      const cases = [
        { period_type: "annual", period_start: "2026-01-01", period_end: "2026-12-31" },
        { period_type: "quarterly", period_start: "2026-04-01", period_end: "2026-06-30" }, // Q2 2026
        { period_type: "monthly", period_start: "2026-03-01", period_end: "2026-03-31" },
        { period_type: "weekly", period_start: "2026-03-16", period_end: "2026-03-22" }, // lunes a domingo
      ];

      for (const period of cases) {
        const { data: inserted, error } = await client.from("agency_goals").insert(goalPayload(period)).select("id").single();
        expect(error, `periodo ${period.period_type} debería aceptarse`).toBeNull();
        if (inserted) createdGoalIds.add(inserted.id);
      }

      await client.auth.signOut().catch(() => {});
    });
  });
});
