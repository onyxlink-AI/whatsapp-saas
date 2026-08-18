import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// TAREA 3 — KPI de Dirección. Mismo patrón que
// agency-goals-isolation.integration.test.ts: RLS y restricciones reales
// contra el Supabase local (`supabase start`), no un mock. Se salta (no
// falla) si el stack local no está arriba.

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

const workspaceIds: string[] = [];
const relationshipIds = new Set<string>();
const meetingIds = new Set<string>();

function relationshipPayload(workspaceId: string, overrides: Record<string, unknown> = {}) {
  return {
    workspace_id: workspaceId,
    service_started_on: "2026-01-01",
    service_ended_on: null,
    monthly_fee: 100,
    ...overrides,
  };
}

function meetingPayload(overrides: Record<string, unknown> = {}) {
  return {
    lead_name: "Lead de prueba TAREA3",
    scheduled_at: "2026-08-20T10:00:00.000Z",
    status: "scheduled",
    outcome: null,
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

  const stamp = Date.now();
  for (let i = 0; i < 3; i++) {
    const { data, error } = await db
      .from("workspaces")
      .insert({ name: `Workspace prueba TAREA3 #${i}`, slug: `tarea3-ws-${stamp}-${i}` })
      .select("id")
      .single();
    if (error || !data) throw new Error(error?.message ?? "No se pudo crear el workspace de prueba");
    workspaceIds.push(data.id);
  }
}, POLL_TIMEOUT_MS + 5_000);

afterEach(async () => {
  if (!reachable) return;
  await db.from("users").update({ platform_role: null, is_super_admin: false }).eq("id", CLIENT_ID);
  if (relationshipIds.size > 0) {
    await db.from("agency_client_relationships").delete().in("id", [...relationshipIds]);
    relationshipIds.clear();
  }
  if (meetingIds.size > 0) {
    await db.from("agency_sales_meetings").delete().in("id", [...meetingIds]);
    meetingIds.clear();
  }
});

afterAll(async () => {
  if (!reachable) return;
  await db.from("users").update({ platform_role: null, is_super_admin: false }).eq("id", CLIENT_ID);
  // ON DELETE CASCADE en workspace_id arrastra cualquier relación que quedara.
  if (workspaceIds.length > 0) await db.from("workspaces").delete().in("id", workspaceIds);
});

async function signIn(email: string, password: string) {
  const client = createClient(SUPABASE_URL, ANON_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
  const { error } = await client.auth.signInWithPassword({ email, password });
  expect(error).toBeNull();
  return client;
}

async function actAsInternalAdmin() {
  await db.from("users").update({ platform_role: "internal_admin" }).eq("id", CLIENT_ID);
  return signIn(CLIENT_EMAIL, CLIENT_PASSWORD);
}

describe("agency_client_relationships — RLS", () => {
  it("anon no puede leer ni escribir (bloqueado a nivel de privilegio)", async (ctx) => {
    if (!reachable) return ctx.skip();
    const anon = createClient(SUPABASE_URL, ANON_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
    const read = await anon.from("agency_client_relationships").select("id");
    expect(read.error?.code).toBe("42501");
    const write = await anon.from("agency_client_relationships").insert(relationshipPayload(workspaceIds[0]));
    expect(write.error?.code).toBe("42501");
  });

  it("un admin de cliente no puede leer ni escribir", async (ctx) => {
    if (!reachable) return ctx.skip();
    const { data: seeded } = await db.from("agency_client_relationships").insert(relationshipPayload(workspaceIds[0])).select("id").single();
    if (seeded) relationshipIds.add(seeded.id);

    const client = await signIn(CLIENT_EMAIL, CLIENT_PASSWORD);
    const read = await client.from("agency_client_relationships").select("id");
    expect(read.error).toBeNull();
    expect(read.data).toEqual([]);

    const write = await client.from("agency_client_relationships").insert(relationshipPayload(workspaceIds[1]));
    expect(write.error?.code).toBe("42501");

    const update = await client.from("agency_client_relationships").update({ monthly_fee: 999 }).eq("id", seeded!.id).select("id");
    expect(update.data).toEqual([]);

    const del = await client.from("agency_client_relationships").delete().eq("id", seeded!.id).select("id");
    expect(del.data).toEqual([]);
    await client.auth.signOut().catch(() => {});
  });

  it("internal_admin puede leer, insertar, actualizar y eliminar", async (ctx) => {
    if (!reachable) return ctx.skip();
    const client = await actAsInternalAdmin();

    const { data: inserted, error: insertErr } = await client
      .from("agency_client_relationships")
      .insert(relationshipPayload(workspaceIds[0]))
      .select("id")
      .single();
    expect(insertErr).toBeNull();

    const { data: read, error: readErr } = await client.from("agency_client_relationships").select("id").eq("id", inserted!.id);
    expect(readErr).toBeNull();
    expect(read).toHaveLength(1);

    const { error: updateErr } = await client.from("agency_client_relationships").update({ monthly_fee: 250 }).eq("id", inserted!.id);
    expect(updateErr).toBeNull();

    const { error: deleteErr } = await client.from("agency_client_relationships").delete().eq("id", inserted!.id);
    expect(deleteErr).toBeNull();
    await client.auth.signOut().catch(() => {});
  });

  it("super_admin puede leer, insertar, actualizar y eliminar", async (ctx) => {
    if (!reachable) return ctx.skip();
    const client = await signIn(SUPERADMIN_EMAIL, SUPERADMIN_PASSWORD);

    const { data: inserted, error: insertErr } = await client
      .from("agency_client_relationships")
      .insert(relationshipPayload(workspaceIds[0]))
      .select("id")
      .single();
    expect(insertErr).toBeNull();

    const { error: deleteErr } = await client.from("agency_client_relationships").delete().eq("id", inserted!.id);
    expect(deleteErr).toBeNull();
    await client.auth.signOut().catch(() => {});
  });
});

describe("agency_sales_meetings — RLS", () => {
  it("anon no puede leer ni escribir", async (ctx) => {
    if (!reachable) return ctx.skip();
    const anon = createClient(SUPABASE_URL, ANON_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
    const read = await anon.from("agency_sales_meetings").select("id");
    expect(read.error?.code).toBe("42501");
  });

  it("un admin de cliente no puede leer ni escribir", async (ctx) => {
    if (!reachable) return ctx.skip();
    const { data: seeded } = await db.from("agency_sales_meetings").insert(meetingPayload()).select("id").single();
    if (seeded) meetingIds.add(seeded.id);

    const client = await signIn(CLIENT_EMAIL, CLIENT_PASSWORD);
    const read = await client.from("agency_sales_meetings").select("id");
    expect(read.error).toBeNull();
    expect(read.data).toEqual([]);

    const write = await client.from("agency_sales_meetings").insert(meetingPayload());
    expect(write.error?.code).toBe("42501");
    await client.auth.signOut().catch(() => {});
  });

  it("internal_admin puede gestionar reuniones por completo", async (ctx) => {
    if (!reachable) return ctx.skip();
    const client = await actAsInternalAdmin();

    const { data: inserted, error: insertErr } = await client.from("agency_sales_meetings").insert(meetingPayload()).select("id").single();
    expect(insertErr).toBeNull();

    const { error: updateErr } = await client
      .from("agency_sales_meetings")
      .update({ status: "held", outcome: "won" })
      .eq("id", inserted!.id);
    expect(updateErr).toBeNull();

    const { error: deleteErr } = await client.from("agency_sales_meetings").delete().eq("id", inserted!.id);
    expect(deleteErr).toBeNull();
    await client.auth.signOut().catch(() => {});
  });

  it("super_admin puede gestionar reuniones por completo", async (ctx) => {
    if (!reachable) return ctx.skip();
    const client = await signIn(SUPERADMIN_EMAIL, SUPERADMIN_PASSWORD);

    const { data: inserted, error: insertErr } = await client.from("agency_sales_meetings").insert(meetingPayload()).select("id").single();
    expect(insertErr).toBeNull();

    const { error: deleteErr } = await client.from("agency_sales_meetings").delete().eq("id", inserted!.id);
    expect(deleteErr).toBeNull();
    await client.auth.signOut().catch(() => {});
  });
});

describe("agency_client_relationships — created_by no falsificable e inmutable", () => {
  it("INSERT directo con created_by de otro usuario: se reemplaza por auth.uid()", async (ctx) => {
    if (!reachable) return ctx.skip();
    const client = await actAsInternalAdmin();

    const { data: inserted, error } = await client
      .from("agency_client_relationships")
      .insert(relationshipPayload(workspaceIds[0], { created_by: SUPERADMIN_ID }))
      .select("id, created_by")
      .single();

    expect(error).toBeNull();
    expect(inserted?.created_by).toBe(CLIENT_ID);
    if (inserted) relationshipIds.add(inserted.id);
    await client.auth.signOut().catch(() => {});
  });

  it("UPDATE directo intentando cambiar created_by (a otro UUID o a NULL): no cambia", async (ctx) => {
    if (!reachable) return ctx.skip();
    const client = await actAsInternalAdmin();

    const { data: inserted } = await client
      .from("agency_client_relationships")
      .insert(relationshipPayload(workspaceIds[0]))
      .select("id, created_by")
      .single();
    if (inserted) relationshipIds.add(inserted.id);
    expect(inserted?.created_by).toBe(CLIENT_ID);

    const { data: afterForge } = await client
      .from("agency_client_relationships")
      .update({ created_by: SUPERADMIN_ID })
      .eq("id", inserted!.id)
      .select("created_by")
      .single();
    expect(afterForge?.created_by).toBe(CLIENT_ID);

    const { data: afterNull } = await client
      .from("agency_client_relationships")
      .update({ created_by: null })
      .eq("id", inserted!.id)
      .select("created_by")
      .single();
    expect(afterNull?.created_by).toBe(CLIENT_ID);
    await client.auth.signOut().catch(() => {});
  });

  it("service_role conserva capacidad administrativa: puede establecer created_by libremente", async (ctx) => {
    if (!reachable) return ctx.skip();
    const { data: inserted, error } = await db
      .from("agency_client_relationships")
      .insert(relationshipPayload(workspaceIds[0], { created_by: SUPERADMIN_ID }))
      .select("id, created_by")
      .single();
    expect(error).toBeNull();
    expect(inserted?.created_by).toBe(SUPERADMIN_ID);
    if (inserted) relationshipIds.add(inserted.id);
  });
});

describe("agency_sales_meetings — created_by no falsificable e inmutable", () => {
  it("INSERT falsificado se sustituye por auth.uid(), y UPDATE posterior no lo cambia", async (ctx) => {
    if (!reachable) return ctx.skip();
    const client = await actAsInternalAdmin();

    const { data: inserted, error } = await client
      .from("agency_sales_meetings")
      .insert(meetingPayload({ created_by: SUPERADMIN_ID }))
      .select("id, created_by")
      .single();
    expect(error).toBeNull();
    expect(inserted?.created_by).toBe(CLIENT_ID);
    if (inserted) meetingIds.add(inserted.id);

    const { data: afterUpdate } = await client
      .from("agency_sales_meetings")
      .update({ created_by: SUPERADMIN_ID })
      .eq("id", inserted!.id)
      .select("created_by")
      .single();
    expect(afterUpdate?.created_by).toBe(CLIENT_ID);
    await client.auth.signOut().catch(() => {});
  });
});

describe("agency_client_relationships — no puede haber dos relaciones para el mismo workspace", () => {
  it("un segundo INSERT con el mismo workspace_id se rechaza (UNIQUE)", async (ctx) => {
    if (!reachable) return ctx.skip();
    const { data: first } = await db.from("agency_client_relationships").insert(relationshipPayload(workspaceIds[2])).select("id").single();
    if (first) relationshipIds.add(first.id);

    const { error } = await db.from("agency_client_relationships").insert(relationshipPayload(workspaceIds[2]));
    expect(error?.code).toBe("23505");
  });
});

describe("agency_client_relationships — restricciones CHECK", () => {
  it("rechaza monthly_fee negativo", async (ctx) => {
    if (!reachable) return ctx.skip();
    const { error } = await db.from("agency_client_relationships").insert(relationshipPayload(workspaceIds[0], { monthly_fee: -1 }));
    expect(error?.code).toBe("23514");
  });

  it("rechaza service_ended_on anterior a service_started_on", async (ctx) => {
    if (!reachable) return ctx.skip();
    const { error } = await db
      .from("agency_client_relationships")
      .insert(relationshipPayload(workspaceIds[0], { service_started_on: "2026-06-01", service_ended_on: "2026-01-01" }));
    expect(error?.code).toBe("23514");
  });
});

describe("agency_sales_meetings — restricciones CHECK", () => {
  it("rechaza held sin outcome", async (ctx) => {
    if (!reachable) return ctx.skip();
    const { error } = await db.from("agency_sales_meetings").insert(meetingPayload({ status: "held", outcome: null }));
    expect(error?.code).toBe("23514");
  });

  it("rechaza scheduled con un outcome informado", async (ctx) => {
    if (!reachable) return ctx.skip();
    const { error } = await db.from("agency_sales_meetings").insert(meetingPayload({ status: "scheduled", outcome: "won" }));
    expect(error?.code).toBe("23514");
  });

  it("rechaza cancelled/no_show con un outcome informado", async (ctx) => {
    if (!reachable) return ctx.skip();
    const cancelled = await db.from("agency_sales_meetings").insert(meetingPayload({ status: "cancelled", outcome: "lost" }));
    expect(cancelled.error?.code).toBe("23514");
    const noShow = await db.from("agency_sales_meetings").insert(meetingPayload({ status: "no_show", outcome: "lost" }));
    expect(noShow.error?.code).toBe("23514");
  });
});

describe("agency_client_relationships — TAREA 3B: snapshot no falsificable", () => {
  it("un client_name_snapshot enviado por el cliente se ignora — siempre se usa el nombre real del workspace en el momento del INSERT", async (ctx) => {
    if (!reachable) return ctx.skip();
    const { data: ws } = await db.from("workspaces").select("name").eq("id", workspaceIds[0]).single();
    const client = await actAsInternalAdmin();

    const { data: inserted, error } = await client
      .from("agency_client_relationships")
      .insert(relationshipPayload(workspaceIds[0], { client_name_snapshot: "Nombre Falsificado S.L." }))
      .select("id, client_name_snapshot")
      .single();

    expect(error).toBeNull();
    expect(inserted?.client_name_snapshot).toBe(ws!.name);
    expect(inserted?.client_name_snapshot).not.toBe("Nombre Falsificado S.L.");
    if (inserted) relationshipIds.add(inserted.id);
    await client.auth.signOut().catch(() => {});
  });

  it("rechaza el INSERT si workspace_id no corresponde a ningún workspace real", async (ctx) => {
    if (!reachable) return ctx.skip();
    const client = await actAsInternalAdmin();
    const { error } = await client
      .from("agency_client_relationships")
      .insert(relationshipPayload("00000000-0000-4000-8000-000000000000"));
    expect(error?.code).toBe("23503");
    await client.auth.signOut().catch(() => {});
  });
});

describe("agency_client_relationships — TAREA 3B: preservación del histórico al borrar el workspace", () => {
  // Usuario y workspace dedicados a este bloque — un admin de cliente REAL,
  // distinto de CLIENT_ID (que otros tests de este archivo mutan como
  // internal_admin), para que borrar su propio workspace no interfiera con
  // el resto de la suite ni al revés.
  let clientUserId = "";
  let dedicatedWorkspaceId = "";
  let dedicatedWorkspaceName = "";
  let clientEmail = "";
  const CLIENT_TEST_PASSWORD = "TestLocal123!";

  beforeAll(async () => {
    if (!reachable) return;
    const stamp = Date.now();
    clientEmail = `tarea3b-cliente-${stamp}@test.local`;

    const { data: auth, error: authErr } = await db.auth.admin.createUser({
      email: clientEmail,
      password: CLIENT_TEST_PASSWORD,
      email_confirm: true,
    });
    expect(authErr).toBeNull();
    clientUserId = auth!.user!.id;
    await db.from("users").insert({ id: clientUserId, full_name: "Cliente admin TAREA3B", email: clientEmail });

    dedicatedWorkspaceName = `Workspace TAREA3B ${stamp}`;
    const { data: ws, error: wsErr } = await db
      .from("workspaces")
      .insert({ name: dedicatedWorkspaceName, slug: `tarea3b-ws-${stamp}` })
      .select("id")
      .single();
    expect(wsErr).toBeNull();
    dedicatedWorkspaceId = ws!.id;

    // Admin de SU workspace — nunca personal de plataforma. Esto es lo que
    // habilita workspaces_delete_admins (auth_has_role(id, ['admin'])).
    const { error: memErr } = await db
      .from("memberships")
      .insert({ workspace_id: dedicatedWorkspaceId, user_id: clientUserId, role: "admin" });
    expect(memErr).toBeNull();
  });

  afterAll(async () => {
    if (!reachable) return;
    if (clientUserId) await db.auth.admin.deleteUser(clientUserId).catch(() => {});
    // El workspace ya debería estar borrado por el propio test; por si
    // algún assert falla antes de llegar ahí, se limpia también aquí (un
    // DELETE sin filas que coincidan no es un error).
    if (dedicatedWorkspaceId) await db.from("workspaces").delete().eq("id", dedicatedWorkspaceId);
  });

  it("un admin de cliente NUNCA puede leer ni escribir agency_client_relationships directamente, ni antes ni después de borrar su workspace", async (ctx) => {
    if (!reachable) return ctx.skip();
    const client = createClient(SUPABASE_URL, ANON_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
    const { error: signInErr } = await client.auth.signInWithPassword({ email: clientEmail, password: CLIENT_TEST_PASSWORD });
    expect(signInErr).toBeNull();

    const read = await client.from("agency_client_relationships").select("id");
    expect(read.error).toBeNull();
    expect(read.data).toEqual([]); // RLS filtra a 0 filas, no lanza error

    const write = await client.from("agency_client_relationships").insert(relationshipPayload(dedicatedWorkspaceId));
    expect(write.error?.code).toBe("42501");
    await client.auth.signOut().catch(() => {});
  });

  it("borrar el workspace (vía el propio admin de cliente) conserva el histórico: workspace_id queda NULL, todo lo demás intacto", async (ctx) => {
    if (!reachable) return ctx.skip();

    // Paso 3: el registro lo crea personal interno/service_role — nunca el cliente.
    const { data: created, error: createErr } = await db
      .from("agency_client_relationships")
      .insert({
        workspace_id: dedicatedWorkspaceId,
        service_started_on: "2026-01-01",
        service_ended_on: null,
        monthly_fee: 350,
        created_by: SUPERADMIN_ID,
      })
      .select("id, client_name_snapshot, created_by")
      .single();
    expect(createErr).toBeNull();
    expect(created?.client_name_snapshot).toBe(dedicatedWorkspaceName);
    relationshipIds.add(created!.id);

    // Paso 4: el admin de cliente borra SU PROPIO workspace con una sesión autenticada real.
    const client = createClient(SUPABASE_URL, ANON_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
    const { error: signInErr } = await client.auth.signInWithPassword({ email: clientEmail, password: CLIENT_TEST_PASSWORD });
    expect(signInErr).toBeNull();

    // Paso 5: la eliminación del workspace termina correctamente.
    const { error: deleteWsErr } = await client.from("workspaces").delete().eq("id", dedicatedWorkspaceId);
    expect(deleteWsErr).toBeNull();
    await client.auth.signOut().catch(() => {});

    // Paso 6-7: se consulta desde service_role/personal interno y se confirma que sobrevive intacta.
    const { data: after, error: readErr } = await db
      .from("agency_client_relationships")
      .select("id, workspace_id, client_name_snapshot, service_started_on, service_ended_on, monthly_fee, created_by")
      .eq("id", created!.id)
      .single();

    expect(readErr).toBeNull();
    expect(after).not.toBeNull();
    expect(after?.workspace_id).toBeNull();
    expect(after?.client_name_snapshot).toBe(dedicatedWorkspaceName);
    expect(after?.service_started_on).toBe("2026-01-01");
    expect(after?.service_ended_on).toBeNull();
    expect(after?.monthly_fee).toBe(350);
    expect(after?.created_by).toBe(SUPERADMIN_ID);

    // El workspace de verdad ya no existe.
    const { data: wsAfter } = await db.from("workspaces").select("id").eq("id", dedicatedWorkspaceId).maybeSingle();
    expect(wsAfter).toBeNull();
  });
});
