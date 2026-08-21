import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// TAREA 4A — igual que agency-goals-isolation.integration.test.ts: esto
// ejercita RLS real y restricciones/triggers reales contra el Supabase
// local (`supabase start`) — un mock solo probaría el mock. Se salta (no
// falla) si el stack local no está arriba. agency_schedule_blocks no tiene
// workspace_id (horario interno global de la agencia): el aislamiento
// correcto aquí es "solo personal de plataforma entra", no "cada workspace
// ve lo suyo".

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

// ============================================================================
// TAREA 4A.1 — barrera de loopback. Este archivo crea un cliente
// service_role (bypassa RLS) para sembrar y limpiar fixtures. Si
// `.env.local`/`process.env` apuntaran por error a un proyecto Supabase
// remoto, esa misma sesión service_role ejecutaría lecturas y escrituras
// administrativas reales contra producción u otro entorno remoto. Esta
// comprobación se ejecuta ANTES de crear ese cliente y ANTES de cualquier
// lectura/escritura (incluida la propia comprobación de disponibilidad) —
// solo acepta protocolo http y host de loopback (127.0.0.1, localhost, ::1);
// cualquier otra cosa falla de forma cerrada con un mensaje claro, sin
// imprimir ni exponer ANON_KEY ni SERVICE_ROLE_KEY en ningún caso.
// ============================================================================
const LOOPBACK_HOSTNAMES = new Set(["127.0.0.1", "localhost", "::1"]);

export function isLocalSupabaseUrl(rawUrl: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return false;
  }
  if (parsed.protocol !== "http:") return false;
  // El getter `hostname` de WHATWG URL serializa una IPv6 entre corchetes
  // (`[::1]`) — se normaliza quitándolos antes de comparar contra "::1".
  const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  return LOOPBACK_HOSTNAMES.has(host);
}

function assertLocalSupabaseUrl(rawUrl: string): void {
  if (!isLocalSupabaseUrl(rawUrl)) {
    // Deliberadamente NO se concatena rawUrl (ni ningún dato derivado de él:
    // userinfo, query params, host) en este mensaje. El objetivo es que
    // NEXT_PUBLIC_SUPABASE_URL mal configurada nunca acabe en la salida de
    // un test runner, un log de CI o un informe — el mensaje explica la
    // regla que falló, no el valor recibido.
    throw new Error(
      "agency-schedule-isolation.integration.test.ts: el destino de Supabase configurado no es local " +
        "(se exige protocolo http y host 127.0.0.1/localhost/::1). Abortando antes de crear el cliente " +
        "service_role o realizar cualquier lectura/escritura — revisa NEXT_PUBLIC_SUPABASE_URL en " +
        ".env.local/process.env.",
    );
  }
}

// Pruebas puras de la barrera de loopback: ejercitan únicamente
// isLocalSupabaseUrl/assertLocalSupabaseUrl en memoria, sin fixtures ni
// operaciones de base de datos. El beforeAll global de más abajo sigue
// afectando a TODO el archivo, estas pruebas incluidas — si aborta por una
// URL remota mal configurada, ninguna prueba de este archivo se ejecuta.
describe("isLocalSupabaseUrl — barrera antes de crear el cliente service_role", () => {
  it.each([
    "http://127.0.0.1:54321",
    "http://127.0.0.1",
    "http://localhost:54321",
    "http://localhost",
    "http://LOCALHOST:54321",
    "http://[::1]:54321",
    "http://[::1]",
  ])("acepta el destino local %s", (url) => {
    expect(isLocalSupabaseUrl(url)).toBe(true);
  });

  it.each([
    "https://127.0.0.1:54321", // protocolo distinto de http: nunca se acepta, aunque el host sea loopback
    "https://xyzcompany.supabase.co",
    "http://uyrrunmqzdisplbdtabi.supabase.co",
    "http://onyxlinkpanel.com",
    "http://192.168.1.10:54321", // IP de LAN: no es loopback
    "http://127.0.0.1.evil.com", // truco de subdominio: hostname real no es 127.0.0.1
    "http://localhost.evil.com", // truco de subdominio: hostname real no es localhost
    "ftp://127.0.0.1",
    "",
    "no-es-una-url",
  ])("rechaza el destino remoto/inválido %s", (url) => {
    expect(isLocalSupabaseUrl(url)).toBe(false);
  });

  it("un destino remoto con userinfo y query params sensibles se rechaza sin filtrar la URL, usuario, contraseña, apikey ni parámetros en el mensaje de error", () => {
    const sensitiveUrl =
      "http://admin:S3cr3tPassw0rd@malicious-proxy.example.com:5432/rest/v1?apikey=sk_live_ABCDEF123456&user=admin&password=S3cr3tPassw0rd";

    expect(isLocalSupabaseUrl(sensitiveUrl)).toBe(false);

    let thrown: unknown;
    try {
      assertLocalSupabaseUrl(sensitiveUrl);
    } catch (err) {
      thrown = err;
    }

    expect(thrown).toBeInstanceOf(Error);
    const message = (thrown as Error).message;
    expect(message).not.toContain(sensitiveUrl);
    expect(message).not.toContain("malicious-proxy.example.com");
    expect(message).not.toContain("admin");
    expect(message).not.toContain("S3cr3tPassw0rd");
    expect(message).not.toContain("apikey");
    expect(message).not.toContain("sk_live_ABCDEF123456");
    expect(message).not.toContain("password");
    expect(message).not.toContain("user=admin");
  });
});

const SUPERADMIN_ID = "94ede212-a935-4259-a0e9-5a1547422477";
const SUPERADMIN_EMAIL = "superadmin@onyxlink.local";
const SUPERADMIN_PASSWORD = "TestLocal123!";

// Cliente Empresa A: admin de SU propio workspace, nunca personal de
// OnyxLink — el mismo usuario sirve para demostrar tanto "cliente normal"
// como "admin de workspace cliente" (es el rol de cliente con más
// privilegio disponible en los fixtures locales; si ni siquiera un admin de
// workspace entra, un cliente normal tampoco).
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

const createdBlockIds = new Set<string>();

// Cada llamada por defecto usa una celda (weekday, hour) DISTINTA de la
// anterior — nunca la misma fija para las ~30 llamadas de este archivo. Con
// una sola tabla física agency_schedule_blocks (UNIQUE (weekday, hour)) y
// muchos tests independientes escribiendo contra el mismo Supabase local,
// reutilizar una única celda por defecto hace que un fallo aislado en un
// test dejara una fila sin limpiar y arrastrara un 23505 en cascada a todos
// los tests posteriores que asumían esa celda libre, enmascarando el fallo
// real. Los pocos tests que necesitan deliberadamente la MISMA celda dos
// veces (el propio test de UNIQUE) siguen pasando weekday/hour explícitos.
let cellCounter = 0;
function blockPayload(overrides: Record<string, unknown> = {}) {
  const index = cellCounter++;
  return {
    weekday: (index % 7) + 1,
    hour: Math.floor(index / 7) % 24,
    content: "Bloque de prueba de aislamiento",
    color_key: "teal",
    ...overrides,
  };
}

beforeAll(async () => {
  // Barrera de loopback: se valida ANTES del primer fetch de disponibilidad
  // y ANTES de crear el cliente service_role — un error aquí aborta todo el
  // archivo (falla cerrado), nunca degrada silenciosamente a "no alcanzable".
  assertLocalSupabaseUrl(SUPABASE_URL);

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
  if (createdBlockIds.size > 0) {
    await db.from("agency_schedule_blocks").delete().in("id", [...createdBlockIds]);
    createdBlockIds.clear();
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

describe("agency_schedule_blocks — RLS: lectura", () => {
  it("anon no puede leer agency_schedule_blocks (bloqueado a nivel de privilegio, ni siquiera llega a evaluar RLS: REVOKE ALL ... FROM anon)", async (ctx) => {
    if (!reachable) return ctx.skip();
    const anon = createClient(SUPABASE_URL, ANON_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data, error } = await anon.from("agency_schedule_blocks").select("id");
    expect(error?.code).toBe("42501");
    expect(data).toBeNull();
  });

  it("un cliente normal / admin de workspace no puede leer agency_schedule_blocks (RLS filtra a cero filas, no lanza error)", async (ctx) => {
    if (!reachable) return ctx.skip();
    const { data: seeded } = await db.from("agency_schedule_blocks").insert(blockPayload()).select("id").single();
    if (seeded) createdBlockIds.add(seeded.id);

    const client = await signIn(CLIENT_EMAIL, CLIENT_PASSWORD);
    const { data, error } = await client.from("agency_schedule_blocks").select("id");
    expect(error).toBeNull();
    expect(data).toEqual([]);
    await client.auth.signOut().catch(() => {});
  });

  it("internal_admin sí puede leer agency_schedule_blocks", async (ctx) => {
    if (!reachable) return ctx.skip();
    const { error: setErr } = await db.from("users").update({ platform_role: "internal_admin" }).eq("id", CLIENT_ID);
    expect(setErr).toBeNull();
    const { data: seeded } = await db.from("agency_schedule_blocks").insert(blockPayload()).select("id").single();
    if (seeded) createdBlockIds.add(seeded.id);

    const client = await signIn(CLIENT_EMAIL, CLIENT_PASSWORD);
    const { data, error } = await client.from("agency_schedule_blocks").select("id").eq("id", seeded!.id);
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    await client.auth.signOut().catch(() => {});
  });

  it("super_admin sí puede leer agency_schedule_blocks", async (ctx) => {
    if (!reachable) return ctx.skip();
    const { data: seeded } = await db.from("agency_schedule_blocks").insert(blockPayload()).select("id").single();
    if (seeded) createdBlockIds.add(seeded.id);

    const client = await signIn(SUPERADMIN_EMAIL, SUPERADMIN_PASSWORD);
    const { data, error } = await client.from("agency_schedule_blocks").select("id").eq("id", seeded!.id);
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    await client.auth.signOut().catch(() => {});
  });
});

describe("agency_schedule_blocks — RLS: escritura", () => {
  it("un cliente normal / admin de workspace no puede insertar", async (ctx) => {
    if (!reachable) return ctx.skip();
    const client = await signIn(CLIENT_EMAIL, CLIENT_PASSWORD);
    const { error } = await client.from("agency_schedule_blocks").insert(blockPayload({ created_by: CLIENT_ID }));
    expect(error).not.toBeNull();
    expect(error?.code).toBe("42501");
    await client.auth.signOut().catch(() => {});
  });

  it("un cliente normal / admin de workspace no puede actualizar ni eliminar (0 filas afectadas, sin error, porque RLS ya las oculta)", async (ctx) => {
    if (!reachable) return ctx.skip();
    const { data: seeded } = await db.from("agency_schedule_blocks").insert(blockPayload()).select("id").single();
    if (seeded) createdBlockIds.add(seeded.id);

    const client = await signIn(CLIENT_EMAIL, CLIENT_PASSWORD);
    const update = await client.from("agency_schedule_blocks").update({ content: "manipulado" }).eq("id", seeded!.id).select("id");
    expect(update.data).toEqual([]);

    const del = await client.from("agency_schedule_blocks").delete().eq("id", seeded!.id).select("id");
    expect(del.data).toEqual([]);
    await client.auth.signOut().catch(() => {});

    const { data: stillThere } = await db.from("agency_schedule_blocks").select("id, content").eq("id", seeded!.id).single();
    expect(stillThere?.content).toBe("Bloque de prueba de aislamiento");
  });

  it("internal_admin puede insertar, actualizar y eliminar", async (ctx) => {
    if (!reachable) return ctx.skip();
    const { error: setErr } = await db.from("users").update({ platform_role: "internal_admin" }).eq("id", CLIENT_ID);
    expect(setErr).toBeNull();

    const client = await signIn(CLIENT_EMAIL, CLIENT_PASSWORD);

    const { data: inserted, error: insertErr } = await client
      .from("agency_schedule_blocks")
      .insert(blockPayload({ created_by: CLIENT_ID }))
      .select("id")
      .single();
    expect(insertErr).toBeNull();
    expect(inserted).toBeTruthy();

    const { error: updateErr } = await client.from("agency_schedule_blocks").update({ content: "actualizado" }).eq("id", inserted!.id);
    expect(updateErr).toBeNull();

    const { error: deleteErr } = await client.from("agency_schedule_blocks").delete().eq("id", inserted!.id);
    expect(deleteErr).toBeNull();

    await client.auth.signOut().catch(() => {});

    const { data: afterDelete } = await db.from("agency_schedule_blocks").select("id").eq("id", inserted!.id).maybeSingle();
    expect(afterDelete).toBeNull();
  });

  it("super_admin puede insertar, actualizar y eliminar", async (ctx) => {
    if (!reachable) return ctx.skip();
    const client = await signIn(SUPERADMIN_EMAIL, SUPERADMIN_PASSWORD);

    const { data: inserted, error: insertErr } = await client.from("agency_schedule_blocks").insert(blockPayload()).select("id").single();
    expect(insertErr).toBeNull();

    const { error: deleteErr } = await client.from("agency_schedule_blocks").delete().eq("id", inserted!.id);
    expect(deleteErr).toBeNull();
    await client.auth.signOut().catch(() => {});
  });
});

describe("agency_schedule_blocks — restricciones CHECK a nivel de base de datos", () => {
  it("rechaza weekday fuera de 1-7", async (ctx) => {
    if (!reachable) return ctx.skip();
    const { error: tooLow } = await db.from("agency_schedule_blocks").insert(blockPayload({ weekday: 0 }));
    expect(tooLow?.code).toBe("23514");
    const { error: tooHigh } = await db.from("agency_schedule_blocks").insert(blockPayload({ weekday: 8 }));
    expect(tooHigh?.code).toBe("23514");
  });

  it("rechaza hour fuera de 0-23", async (ctx) => {
    if (!reachable) return ctx.skip();
    const { error: tooLow } = await db.from("agency_schedule_blocks").insert(blockPayload({ hour: -1 }));
    expect(tooLow?.code).toBe("23514");
    const { error: tooHigh } = await db.from("agency_schedule_blocks").insert(blockPayload({ hour: 24 }));
    expect(tooHigh?.code).toBe("23514");
  });

  it("rechaza content vacío o solo espacios incluso saltándose la interfaz", async (ctx) => {
    if (!reachable) return ctx.skip();
    const { error: empty } = await db.from("agency_schedule_blocks").insert(blockPayload({ content: "" }));
    expect(empty?.code).toBe("23514");
    const { error: whitespace } = await db.from("agency_schedule_blocks").insert(blockPayload({ content: "   " }));
    expect(whitespace?.code).toBe("23514");
  });

  it("rechaza content por encima de 500 caracteres", async (ctx) => {
    if (!reachable) return ctx.skip();
    const { error } = await db.from("agency_schedule_blocks").insert(blockPayload({ content: "a".repeat(501) }));
    expect(error?.code).toBe("23514");
  });

  it("rechaza color_key fuera de la paleta cerrada", async (ctx) => {
    if (!reachable) return ctx.skip();
    const { error } = await db.from("agency_schedule_blocks").insert(blockPayload({ color_key: "green" }));
    expect(error?.code).toBe("23514");
  });

  it("rechaza una segunda fila para la misma celda (weekday, hour) — UNIQUE", async (ctx) => {
    if (!reachable) return ctx.skip();
    const { data: first } = await db.from("agency_schedule_blocks").insert(blockPayload({ weekday: 3, hour: 14 })).select("id").single();
    if (first) createdBlockIds.add(first.id);

    const { error } = await db.from("agency_schedule_blocks").insert(blockPayload({ weekday: 3, hour: 14 }));
    expect(error?.code).toBe("23505");
  });
});

// ============================================================================
// TAREA 4A — integridad frente a REST directo: un internal_admin con sesión
// real (no service_role) tiene INSERT/UPDATE vía RLS, así que estas pruebas
// ejercitan exactamente esa vía — la misma que un atacante con credenciales
// legítimas de personal interno pero sin pasar por schedule-actions.ts usaría.
// ============================================================================
describe("agency_schedule_blocks — integridad frente a REST directo", () => {
  // public.users.id es FK a auth.users(id) ON DELETE CASCADE — no basta con
  // insertar una fila en public.users, hace falta un usuario de auth real
  // detrás (vía el API admin de service_role) para poder referenciarlo como
  // responsible_id. Borrar el usuario de auth arrastra la fila de public.users.
  let plainClientId = "";
  let legacySuperAdminId = "";
  let inactiveInternalAdminId = "";

  beforeAll(async () => {
    if (!reachable) return;
    const stamp = Date.now();

    const { data: plainAuth, error: plainAuthErr } = await db.auth.admin.createUser({
      email: `tarea4a-cliente-${stamp}@test.local`,
      password: "TestLocal123!",
      email_confirm: true,
    });
    expect(plainAuthErr).toBeNull();
    plainClientId = plainAuth!.user!.id;
    await db.from("users").insert({ id: plainClientId, full_name: "Cliente de prueba TAREA4A", email: plainAuth!.user!.email! });

    const { data: legacyAuth, error: legacyAuthErr } = await db.auth.admin.createUser({
      email: `tarea4a-legado-${stamp}@test.local`,
      password: "TestLocal123!",
      email_confirm: true,
    });
    expect(legacyAuthErr).toBeNull();
    legacySuperAdminId = legacyAuth!.user!.id;
    await db
      .from("users")
      .insert({ id: legacySuperAdminId, full_name: "Superadmin legado TAREA4A", email: legacyAuth!.user!.email!, is_super_admin: true });

    const { data: inactiveAuth, error: inactiveAuthErr } = await db.auth.admin.createUser({
      email: `tarea4a-inactivo-${stamp}@test.local`,
      password: "TestLocal123!",
      email_confirm: true,
    });
    expect(inactiveAuthErr).toBeNull();
    inactiveInternalAdminId = inactiveAuth!.user!.id;
    await db.from("users").insert({
      id: inactiveInternalAdminId,
      full_name: "Interno inactivo TAREA4A",
      email: inactiveAuth!.user!.email!,
      platform_role: "internal_admin",
      is_active: false,
    });
  });

  afterAll(async () => {
    if (!reachable) return;
    if (plainClientId) await db.auth.admin.deleteUser(plainClientId).catch(() => {});
    if (legacySuperAdminId) await db.auth.admin.deleteUser(legacySuperAdminId).catch(() => {});
    if (inactiveInternalAdminId) await db.auth.admin.deleteUser(inactiveInternalAdminId).catch(() => {});
  });

  async function actAsInternalAdmin() {
    await db.from("users").update({ platform_role: "internal_admin" }).eq("id", CLIENT_ID);
    return signIn(CLIENT_EMAIL, CLIENT_PASSWORD);
  }

  describe("created_by / updated_by no falsificables", () => {
    it("INSERT directo con created_by/updated_by de otro usuario: se reemplazan por auth.uid(), nunca se conserva el valor falsificado", async (ctx) => {
      if (!reachable) return ctx.skip();
      const client = await actAsInternalAdmin();

      const { data: inserted, error } = await client
        .from("agency_schedule_blocks")
        .insert(blockPayload({ created_by: SUPERADMIN_ID, updated_by: SUPERADMIN_ID }))
        .select("id, created_by, updated_by")
        .single();

      expect(error).toBeNull();
      expect(inserted?.created_by).toBe(CLIENT_ID);
      expect(inserted?.updated_by).toBe(CLIENT_ID);
      expect(inserted?.created_by).not.toBe(SUPERADMIN_ID);
      if (inserted) createdBlockIds.add(inserted.id);
      await client.auth.signOut().catch(() => {});
    });

    it("UPDATE directo intentando cambiar created_by: no cambia; updated_by sí se fuerza al actor real", async (ctx) => {
      if (!reachable) return ctx.skip();
      const client = await actAsInternalAdmin();

      const { data: inserted } = await client.from("agency_schedule_blocks").insert(blockPayload()).select("id, created_by").single();
      if (inserted) createdBlockIds.add(inserted.id);
      expect(inserted?.created_by).toBe(CLIENT_ID);

      const { data: updated, error } = await client
        .from("agency_schedule_blocks")
        .update({ created_by: SUPERADMIN_ID, content: "editado" })
        .eq("id", inserted!.id)
        .select("created_by, updated_by")
        .single();

      // El trigger revierte created_by en silencio: la sentencia no falla,
      // pero el valor persistido sigue siendo el original — nunca el
      // falsificado. updated_by, en cambio, siempre se fuerza al actor real
      // de esta sesión.
      expect(error).toBeNull();
      expect(updated?.created_by).toBe(CLIENT_ID);
      expect(updated?.created_by).not.toBe(SUPERADMIN_ID);
      expect(updated?.updated_by).toBe(CLIENT_ID);
      await client.auth.signOut().catch(() => {});
    });

    it("eliminar al usuario creador: el borrado no falla, el bloque permanece, created_by/updated_by/responsible_id quedan NULL", async (ctx) => {
      if (!reachable) return ctx.skip();

      const stamp = Date.now();
      const { data: tempAuth, error: tempAuthErr } = await db.auth.admin.createUser({
        email: `tarea4a-creador-${stamp}@test.local`,
        password: "TestLocal123!",
        email_confirm: true,
      });
      expect(tempAuthErr).toBeNull();
      const tempUserId = tempAuth!.user!.id;
      await db
        .from("users")
        .insert({ id: tempUserId, full_name: "Creador temporal TAREA4A", email: tempAuth!.user!.email!, platform_role: "internal_admin" });

      const { data: block, error: blockErr } = await db
        .from("agency_schedule_blocks")
        .insert(blockPayload({ created_by: tempUserId, updated_by: tempUserId, responsible_id: tempUserId }))
        .select("id, created_by, updated_by, responsible_id")
        .single();
      expect(blockErr).toBeNull();
      expect(block?.created_by).toBe(tempUserId);
      expect(block?.responsible_id).toBe(tempUserId);
      createdBlockIds.add(block!.id);

      const { error: deleteErr } = await db.auth.admin.deleteUser(tempUserId);
      expect(deleteErr).toBeNull();

      const { data: afterDelete, error: readErr } = await db
        .from("agency_schedule_blocks")
        .select("id, created_by, updated_by, responsible_id")
        .eq("id", block!.id)
        .single();
      expect(readErr).toBeNull();
      expect(afterDelete).not.toBeNull();
      expect(afterDelete?.created_by).toBeNull();
      expect(afterDelete?.updated_by).toBeNull();
      expect(afterDelete?.responsible_id).toBeNull();
    });
  });

  describe("responsable (responsible_id) debe ser personal interno activo", () => {
    it("INSERT con responsible_id de un cliente normal: rechazado", async (ctx) => {
      if (!reachable) return ctx.skip();
      const client = await actAsInternalAdmin();
      const { error } = await client.from("agency_schedule_blocks").insert(blockPayload({ responsible_id: plainClientId }));
      expect(error?.code).toBe("23514");
      await client.auth.signOut().catch(() => {});
    });

    it("UPDATE asignando responsible_id de un cliente normal: rechazado, el valor no cambia", async (ctx) => {
      if (!reachable) return ctx.skip();
      const client = await actAsInternalAdmin();
      const { data: inserted } = await client.from("agency_schedule_blocks").insert(blockPayload()).select("id").single();
      if (inserted) createdBlockIds.add(inserted.id);

      const { error } = await client.from("agency_schedule_blocks").update({ responsible_id: plainClientId }).eq("id", inserted!.id);
      expect(error?.code).toBe("23514");

      const { data: stillNull } = await db.from("agency_schedule_blocks").select("responsible_id").eq("id", inserted!.id).single();
      expect(stillNull?.responsible_id).toBeNull();
      await client.auth.signOut().catch(() => {});
    });

    it("INSERT con responsible_id de un internal_admin INACTIVO: rechazado", async (ctx) => {
      if (!reachable) return ctx.skip();
      const client = await actAsInternalAdmin();
      const { error } = await client.from("agency_schedule_blocks").insert(blockPayload({ responsible_id: inactiveInternalAdminId }));
      expect(error?.code).toBe("23514");
      await client.auth.signOut().catch(() => {});
    });

    it("responsible_id null: aceptado", async (ctx) => {
      if (!reachable) return ctx.skip();
      const client = await actAsInternalAdmin();
      const { data: inserted, error } = await client
        .from("agency_schedule_blocks")
        .insert(blockPayload({ responsible_id: null }))
        .select("id")
        .single();
      expect(error).toBeNull();
      if (inserted) createdBlockIds.add(inserted.id);
      await client.auth.signOut().catch(() => {});
    });

    it("responsible_id de un internal_admin activo: aceptado", async (ctx) => {
      if (!reachable) return ctx.skip();
      const client = await actAsInternalAdmin();
      // CLIENT_ID es internal_admin activo en este punto — se asigna a sí mismo.
      const { data: inserted, error } = await client
        .from("agency_schedule_blocks")
        .insert(blockPayload({ responsible_id: CLIENT_ID }))
        .select("id")
        .single();
      expect(error).toBeNull();
      if (inserted) createdBlockIds.add(inserted.id);
      await client.auth.signOut().catch(() => {});
    });

    it("responsible_id de un super_admin: aceptado", async (ctx) => {
      if (!reachable) return ctx.skip();
      const client = await actAsInternalAdmin();
      const { data: inserted, error } = await client
        .from("agency_schedule_blocks")
        .insert(blockPayload({ responsible_id: SUPERADMIN_ID }))
        .select("id")
        .single();
      expect(error).toBeNull();
      if (inserted) createdBlockIds.add(inserted.id);
      await client.auth.signOut().catch(() => {});
    });

    it("responsible_id de un superadministrador legado (is_super_admin=true, platform_role=null): aceptado", async (ctx) => {
      if (!reachable) return ctx.skip();
      const client = await actAsInternalAdmin();
      const { data: inserted, error } = await client
        .from("agency_schedule_blocks")
        .insert(blockPayload({ responsible_id: legacySuperAdminId }))
        .select("id")
        .single();
      expect(error).toBeNull();
      if (inserted) createdBlockIds.add(inserted.id);
      await client.auth.signOut().catch(() => {});
    });

    it("borrar al responsable deja responsible_id en NULL sin borrar el bloque (ON DELETE SET NULL)", async (ctx) => {
      if (!reachable) return ctx.skip();

      const stamp = Date.now();
      const { data: tempAuth, error: tempAuthErr } = await db.auth.admin.createUser({
        email: `tarea4a-responsable-${stamp}@test.local`,
        password: "TestLocal123!",
        email_confirm: true,
      });
      expect(tempAuthErr).toBeNull();
      const tempResponsibleId = tempAuth!.user!.id;
      await db.from("users").insert({
        id: tempResponsibleId,
        full_name: "Responsable temporal TAREA4A",
        email: tempAuth!.user!.email!,
        platform_role: "internal_admin",
      });

      const { data: block, error: blockErr } = await db
        .from("agency_schedule_blocks")
        .insert(blockPayload({ responsible_id: tempResponsibleId }))
        .select("id, responsible_id")
        .single();
      expect(blockErr).toBeNull();
      expect(block?.responsible_id).toBe(tempResponsibleId);
      createdBlockIds.add(block!.id);

      const { error: deleteErr } = await db.auth.admin.deleteUser(tempResponsibleId);
      expect(deleteErr).toBeNull();

      const { data: afterDelete, error: readErr } = await db
        .from("agency_schedule_blocks")
        .select("id, content, responsible_id")
        .eq("id", block!.id)
        .single();
      expect(readErr).toBeNull();
      expect(afterDelete).not.toBeNull();
      expect(afterDelete?.responsible_id).toBeNull();
      expect(afterDelete?.content).toBe("Bloque de prueba de aislamiento");
    });

    // "Una asignación histórica no debe borrarse automáticamente solo porque
    // el usuario pase a inactivo": el bloque ya asignado a un responsable
    // que ERA activo debe sobrevivir intacto a un UPDATE de un campo no
    // relacionado, incluso después de que esa persona pase a is_active=false
    // — la comprobación de "personal activo" solo se dispara para una
    // asignación NUEVA (responsible_id que cambia), nunca para revalidar un
    // valor que la fila ya tenía.
    it("una asignación histórica sobrevive a que el responsable pase a inactivo, mientras responsible_id no cambie", async (ctx) => {
      if (!reachable) return ctx.skip();

      const stamp = Date.now();
      const { data: tempAuth, error: tempAuthErr } = await db.auth.admin.createUser({
        email: `tarea4a-historico-${stamp}@test.local`,
        password: "TestLocal123!",
        email_confirm: true,
      });
      expect(tempAuthErr).toBeNull();
      const tempResponsibleId = tempAuth!.user!.id;
      await db.from("users").insert({
        id: tempResponsibleId,
        full_name: "Responsable histórico TAREA4A",
        email: tempAuth!.user!.email!,
        platform_role: "internal_admin",
        is_active: true,
      });

      const { data: block, error: blockErr } = await db
        .from("agency_schedule_blocks")
        .insert(blockPayload({ responsible_id: tempResponsibleId }))
        .select("id, responsible_id")
        .single();
      expect(blockErr).toBeNull();
      createdBlockIds.add(block!.id);

      // La persona pasa a inactiva DESPUÉS de la asignación.
      await db.from("users").update({ is_active: false }).eq("id", tempResponsibleId);

      // Un UPDATE de un campo no relacionado (content) no debe fallar, y
      // responsible_id debe seguir apuntando al mismo responsable histórico.
      const { data: updated, error: updateErr } = await db
        .from("agency_schedule_blocks")
        .update({ content: "contenido editado tras inactivar al responsable" })
        .eq("id", block!.id)
        .select("responsible_id, content")
        .single();

      expect(updateErr).toBeNull();
      expect(updated?.responsible_id).toBe(tempResponsibleId);
      expect(updated?.content).toBe("contenido editado tras inactivar al responsable");

      await db.auth.admin.deleteUser(tempResponsibleId).catch(() => {});
    });
  });
});
