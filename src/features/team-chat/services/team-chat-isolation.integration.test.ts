// Criterios de aceptación innegociables de Fase 1 (docs/CLAUDE-TAREA-MAESTRA-CHAT-EQUIPO.md
// y docs/ONYXLINK-ARQUITECTURA-CHAT-BIBLIOTECA-SEGURIDAD.md): estas pruebas
// usan JWTs reales de dos empresas distintas (nunca solo service_role, que
// haría bypass de RLS y probaría el mock, no el aislamiento real) contra el
// Postgres/Realtime local. Se saltan (no fallan) si el stack local no está
// arriba, igual que rls-helper-privileges.test.ts.

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
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

const EMPRESA_A = "1b807ae9-03a2-4cf5-84af-8b72a7078ad9";
const EMPRESA_B = "9003dc6d-dafa-48b3-be17-71e36e08272d";
const CLIENTE_A_EMAIL = "cliente@empresaa.local";
const CLIENTE_A_PASSWORD = "TestLocal123!";
const SUPERADMIN_EMAIL = "superadmin@onyxlink.local";
const SUPERADMIN_PASSWORD = "TestLocal123!";

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
let db: SupabaseClient; // service_role — solo para preparar/limpiar fixtures
let clientA: SupabaseClient; // JWT real de cliente@empresaa.local (Empresa A, no superadmin)
let clientB: SupabaseClient; // JWT real de un usuario fixture de Empresa B (no superadmin)

let userBId: string;
const userBEmail = `chat-isolation-b-${Date.now()}@empresab.local`;
let generalAId: string;
let generalBId: string;

const RUN_TAG = `chat-iso-${Date.now()}`;

describe("Chat de equipo — aislamiento entre tenants con JWT reales", () => {
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

    // Fixture: usuario real (no superadmin) de Empresa B — el seed local solo
    // trae un cliente no-superadmin para Empresa A, así que se crea uno
    // equivalente para B (mismo patrón que is-active-membership-filter.integration.test.ts).
    const { data: authUser, error: authErr } = await db.auth.admin.createUser({
      email: userBEmail,
      password: "TestLocal123!",
      email_confirm: true,
    });
    if (authErr || !authUser?.user) throw new Error(`fixture usuario Empresa B falló: ${authErr?.message}`);
    userBId = authUser.user.id;
    await db.from("users").insert({ id: userBId, full_name: "Cliente Empresa B (test)", email: userBEmail });
    await db.from("memberships").insert({
      workspace_id: EMPRESA_B,
      user_id: userBId,
      role: "admin",
      is_active: true,
    });

    // Activar Chat en ambas empresas de prueba (equivalente a lo que hace el
    // superadmin desde Ajustes → Negocio) con la RPC atómica única —
    // set_team_chat_enabled() activa la bandera Y crea/da de alta General en
    // la misma llamada (bloqueo 3 de la revisión).
    const { error: enableErrA2 } = await db.rpc("set_team_chat_enabled", {
      p_workspace_id: EMPRESA_A,
      p_enabled: true,
      p_human_member_limit: 10,
    });
    if (enableErrA2) throw new Error(`set_team_chat_enabled A falló: ${enableErrA2.message}`);
    const { error: enableErrB2 } = await db.rpc("set_team_chat_enabled", {
      p_workspace_id: EMPRESA_B,
      p_enabled: true,
      p_human_member_limit: 10,
    });
    if (enableErrB2) throw new Error(`set_team_chat_enabled B falló: ${enableErrB2.message}`);

    const { data: generalA } = await db
      .from("team_channels")
      .select("id")
      .eq("workspace_id", EMPRESA_A)
      .eq("kind", "general")
      .single();
    generalAId = generalA!.id as string;

    const { data: generalB } = await db
      .from("team_channels")
      .select("id")
      .eq("workspace_id", EMPRESA_B)
      .eq("kind", "general")
      .single();
    generalBId = generalB!.id as string;

    clientA = createClient(SUPABASE_URL, ANON_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
    const { error: signInAErr } = await clientA.auth.signInWithPassword({
      email: CLIENTE_A_EMAIL,
      password: CLIENTE_A_PASSWORD,
    });
    if (signInAErr) throw new Error(`login cliente A falló: ${signInAErr.message}`);

    clientB = createClient(SUPABASE_URL, ANON_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
    const { error: signInBErr } = await clientB.auth.signInWithPassword({
      email: userBEmail,
      password: "TestLocal123!",
    });
    if (signInBErr) throw new Error(`login cliente B falló: ${signInBErr.message}`);

    // Un mensaje real en cada General, para tener algo que el otro tenant no
    // debe poder leer ni enumerar.
    const { error: msgAErr } = await clientA
      .from("team_messages")
      .insert({ workspace_id: EMPRESA_A, channel_id: generalAId, sender_id: (await clientA.auth.getUser()).data.user!.id, body: `${RUN_TAG}-mensaje-A` });
    if (msgAErr) throw new Error(`insertar mensaje A falló: ${msgAErr.message}`);

    const { error: msgBErr } = await clientB
      .from("team_messages")
      .insert({ workspace_id: EMPRESA_B, channel_id: generalBId, sender_id: userBId, body: `${RUN_TAG}-mensaje-B` });
    if (msgBErr) throw new Error(`insertar mensaje B falló: ${msgBErr.message}`);
  }, POLL_TIMEOUT_MS + 15_000);

  afterAll(async () => {
    if (!reachable) return;
    await clientA?.auth.signOut().catch(() => {});
    await clientB?.auth.signOut().catch(() => {});
    await db.from("team_messages").delete().like("body", `${RUN_TAG}-%`);
    if (userBId) {
      await db.from("memberships").delete().eq("user_id", userBId);
      await db.from("users").delete().eq("id", userBId);
      await db.auth.admin.deleteUser(userBId).catch(() => {});
    }
    await db.from("workspaces").update({ team_chat_enabled: false, human_member_limit: 1 }).eq("id", EMPRESA_A);
    await db.from("workspaces").update({ team_chat_enabled: false, human_member_limit: 1 }).eq("id", EMPRESA_B);
  });

  it("Empresa A no puede enumerar los canales de Empresa B", async (ctx) => {
    if (!reachable) return ctx.skip();
    const { data, error } = await clientA.from("team_channels").select("id, workspace_id");
    expect(error).toBeNull();
    for (const ch of data ?? []) {
      expect(ch.workspace_id).toBe(EMPRESA_A);
    }
    expect((data ?? []).some((ch) => ch.id === generalBId)).toBe(false);
  });

  it("Empresa A no puede leer los mensajes de Empresa B ni siquiera falsificando el channel_id", async (ctx) => {
    if (!reachable) return ctx.skip();
    const { data, error } = await clientA.from("team_messages").select("id, body").eq("channel_id", generalBId);
    // RLS filtra por filas, no lanza error: la respuesta correcta es 0 filas, no un 403.
    expect(error).toBeNull();
    expect(data ?? []).toHaveLength(0);
  });

  it("Empresa A no puede leer team_channel_members de Empresa B", async (ctx) => {
    if (!reachable) return ctx.skip();
    const { data, error } = await clientA
      .from("team_channel_members")
      .select("user_id")
      .eq("channel_id", generalBId);
    expect(error).toBeNull();
    expect(data ?? []).toHaveLength(0);
  });

  it("Empresa A no puede enumerar el perfil de un usuario de Empresa B (users RLS reforzada)", async (ctx) => {
    if (!reachable) return ctx.skip();
    const { data, error } = await clientA.from("users").select("id").eq("id", userBId);
    expect(error).toBeNull();
    expect(data ?? []).toHaveLength(0);
  });

  it("Empresa B tampoco puede leer los mensajes de Empresa A (aislamiento en ambos sentidos)", async (ctx) => {
    if (!reachable) return ctx.skip();
    const { data, error } = await clientB.from("team_messages").select("id, body").eq("channel_id", generalAId);
    expect(error).toBeNull();
    expect(data ?? []).toHaveLength(0);
  });

  it("Empresa A no puede insertar un mensaje en el canal General de Empresa B", async (ctx) => {
    if (!reachable) return ctx.skip();
    const { data: userData } = await clientA.auth.getUser();
    const { error } = await clientA.from("team_messages").insert({
      workspace_id: EMPRESA_B,
      channel_id: generalBId,
      sender_id: userData.user!.id,
      body: `${RUN_TAG}-intento-cruzado`,
    });
    // RLS con WITH CHECK debe rechazar el INSERT (RLS violation), no aceptarlo silenciosamente.
    expect(error).not.toBeNull();
  });

  it("get_or_create_dm_channel no permite abrir un DM suplantando a un usuario de otra empresa", async (ctx) => {
    if (!reachable) return ctx.skip();
    const { error } = await clientA.rpc("get_or_create_dm_channel", {
      p_workspace_id: EMPRESA_A,
      p_other_user_id: userBId,
    });
    // userBId no es miembro activo de Empresa A: la función debe rechazarlo.
    expect(error).not.toBeNull();
  });

  it("get_or_create_dm_channel SÍ crea (y reutiliza) el DM entre dos miembros reales del mismo workspace", async (ctx) => {
    if (!reachable) return ctx.skip();

    // Camino feliz real, no solo el de rechazo de arriba: esto es lo que
    // detectó en vivo que uq_team_channels_direct es un índice único
    // PARCIAL y el INSERT ... ON CONFLICT (workspace_id, direct_key) sin
    // repetir el predicado fallaba en runtime con "there is no unique or
    // exclusion constraint matching the ON CONFLICT specification" — un
    // error que la prueba de rechazo de arriba nunca podía atrapar porque
    // nunca llegaba a ejecutar el INSERT.
    const { data: superRow } = await db.from("users").select("id").eq("email", SUPERADMIN_EMAIL).single();
    const { data: channelId, error } = await clientA.rpc("get_or_create_dm_channel", {
      p_workspace_id: EMPRESA_A,
      p_other_user_id: superRow!.id,
    });
    expect(error).toBeNull();
    expect(typeof channelId).toBe("string");

    // Idempotente: una segunda llamada para el mismo par debe devolver el
    // mismo canal, no crear uno duplicado ni chocar contra el índice único.
    const { data: channelId2, error: error2 } = await clientA.rpc("get_or_create_dm_channel", {
      p_workspace_id: EMPRESA_A,
      p_other_user_id: superRow!.id,
    });
    expect(error2).toBeNull();
    expect(channelId2).toBe(channelId);

    await db.from("team_channel_members").delete().eq("channel_id", channelId);
    await db.from("team_channels").delete().eq("id", channelId);
  });

  it("desactivar a un miembro corta el acceso al chat de inmediato", async (ctx) => {
    if (!reachable) return ctx.skip();
    const { error: deactivateErr } = await db
      .from("memberships")
      .update({ is_active: false })
      .eq("workspace_id", EMPRESA_B)
      .eq("user_id", userBId);
    expect(deactivateErr).toBeNull();

    try {
      const { data, error } = await clientB.from("team_channels").select("id");
      expect(error).toBeNull();
      expect(data ?? []).toHaveLength(0);
    } finally {
      await db
        .from("memberships")
        .update({ is_active: true })
        .eq("workspace_id", EMPRESA_B)
        .eq("user_id", userBId);
    }
  });

  it("un superadmin nunca consume plaza (claim_workspace_seat)", async (ctx) => {
    if (!reachable) return ctx.skip();

    const { data: seatWs, error: wsErr } = await db
      .from("workspaces")
      .insert({ name: `${RUN_TAG}-seat-super`, slug: `${RUN_TAG}-seat-super`, gestion_enabled: true, team_chat_enabled: true, human_member_limit: 1 })
      .select("id")
      .single();
    expect(wsErr).toBeNull();
    const wsId = seatWs!.id as string;

    const { data: superRow } = await db.from("users").select("id").eq("email", SUPERADMIN_EMAIL).single();
    const superId = superRow!.id as string;

    // La plaza (límite=1) la ocupa primero un usuario normal...
    const { data: clienteARow } = await db.from("users").select("id").eq("email", CLIENTE_A_EMAIL).single();
    const { error: claimNormalErr } = await db.rpc("claim_workspace_seat", {
      p_workspace_id: wsId,
      p_user_id: clienteARow!.id,
      p_role: "agent",
    });
    expect(claimNormalErr).toBeNull();

    // ... y aun así el superadmin puede entrar sin que le bloquee el límite lleno.
    const { error: claimSuperErr } = await db.rpc("claim_workspace_seat", {
      p_workspace_id: wsId,
      p_user_id: superId,
      p_role: "admin",
    });
    expect(claimSuperErr).toBeNull();

    await db.from("memberships").delete().eq("workspace_id", wsId);
    await db.from("workspaces").delete().eq("id", wsId);
  });

  it("dos invitaciones concurrentes nunca superan la última plaza disponible", async (ctx) => {
    if (!reachable) return ctx.skip();

    const { data: seatWs, error: wsErr } = await db
      .from("workspaces")
      .insert({ name: `${RUN_TAG}-seat-race`, slug: `${RUN_TAG}-seat-race`, gestion_enabled: true, team_chat_enabled: true, human_member_limit: 1 })
      .select("id")
      .single();
    expect(wsErr).toBeNull();
    const wsId = seatWs!.id as string;

    const email1 = `${RUN_TAG}-race1@empresab.local`;
    const email2 = `${RUN_TAG}-race2@empresab.local`;
    const { data: u1 } = await db.auth.admin.createUser({ email: email1, password: "TestLocal123!", email_confirm: true });
    const { data: u2 } = await db.auth.admin.createUser({ email: email2, password: "TestLocal123!", email_confirm: true });
    await db.from("users").insert([
      { id: u1!.user!.id, full_name: "Race 1", email: email1 },
      { id: u2!.user!.id, full_name: "Race 2", email: email2 },
    ]);

    const [r1, r2] = await Promise.allSettled([
      db.rpc("claim_workspace_seat", { p_workspace_id: wsId, p_user_id: u1!.user!.id, p_role: "agent" }),
      db.rpc("claim_workspace_seat", { p_workspace_id: wsId, p_user_id: u2!.user!.id, p_role: "agent" }),
    ]);

    const results = [r1, r2].map((r) => (r.status === "fulfilled" ? r.value.error : r.reason));
    const succeeded = results.filter((e) => !e).length;
    const failed = results.filter((e) => e).length;
    expect(succeeded).toBe(1);
    expect(failed).toBe(1);

    const { count } = await db
      .from("memberships")
      .select("*", { count: "exact", head: true })
      .eq("workspace_id", wsId)
      .eq("is_active", true);
    expect(count).toBe(1);

    await db.from("memberships").delete().eq("workspace_id", wsId);
    await db.from("users").delete().in("id", [u1!.user!.id, u2!.user!.id]);
    await db.auth.admin.deleteUser(u1!.user!.id).catch(() => {});
    await db.auth.admin.deleteUser(u2!.user!.id).catch(() => {});
    await db.from("workspaces").delete().eq("id", wsId);
  });

  it("Realtime Broadcast privado: Empresa B no puede suscribirse al canal General de Empresa A", async (ctx) => {
    if (!reachable) return ctx.skip();

    const topic = `team:${generalAId}`;
    const status: string = await new Promise((resolvePromise) => {
      const channel = clientB.channel(topic, { config: { private: true } });
      const timeout = setTimeout(() => resolvePromise("TIMEOUT"), 8_000);
      channel.subscribe((s) => {
        if (s === "SUBSCRIBED" || s === "CHANNEL_ERROR" || s === "TIMED_OUT") {
          clearTimeout(timeout);
          resolvePromise(s);
        }
      });
    });
    // Nunca debe llegar a SUBSCRIBED: B no es participante del canal de A.
    expect(status).not.toBe("SUBSCRIBED");
    await clientB.removeAllChannels();
  }, 15_000);

  it("Realtime Broadcast privado: Empresa A sí puede suscribirse a su propio canal General", async (ctx) => {
    if (!reachable) return ctx.skip();

    const topic = `team:${generalAId}`;
    const status: string = await new Promise((resolvePromise) => {
      const channel = clientA.channel(topic, { config: { private: true } });
      const timeout = setTimeout(() => resolvePromise("TIMEOUT"), 8_000);
      channel.subscribe((s) => {
        if (s === "SUBSCRIBED" || s === "CHANNEL_ERROR" || s === "TIMED_OUT") {
          clearTimeout(timeout);
          resolvePromise(s);
        }
      });
    });
    expect(status).toBe("SUBSCRIBED");
    await clientA.removeAllChannels();
  }, 15_000);

  // ────────────────────────────────────────────────────────────────────────
  // Revisión de arquitectura (docs/CLAUDE-REVISION-CHAT-FASE-1.md)
  // ────────────────────────────────────────────────────────────────────────

  async function subscribeStatus(client: SupabaseClient, topic: string): Promise<string> {
    return new Promise((resolvePromise) => {
      const channel = client.channel(topic, { config: { private: true } });
      const timeout = setTimeout(() => resolvePromise("TIMEOUT"), 8_000);
      channel.subscribe((s) => {
        if (s === "SUBSCRIBED" || s === "CHANNEL_ERROR" || s === "TIMED_OUT") {
          clearTimeout(timeout);
          resolvePromise(s);
        }
      });
    });
  }

  it("bloqueo 1: suscripción Realtime válida deja de autorizarse en cuanto se desactiva la membership", async (ctx) => {
    if (!reachable) return ctx.skip();
    const topic = `team:${generalBId}`;

    const before = await subscribeStatus(clientB, topic);
    expect(before).toBe("SUBSCRIBED");
    await clientB.removeAllChannels();

    const { error: deactivateErr } = await db
      .from("memberships")
      .update({ is_active: false })
      .eq("workspace_id", EMPRESA_B)
      .eq("user_id", userBId);
    expect(deactivateErr).toBeNull();

    try {
      // Reintentar tras la desactivación: auth_team_channel_ids() ya no debe
      // devolver este canal (exige membership activa), así que la policy de
      // realtime.messages debe dejar de autorizar el topic — nunca SUBSCRIBED.
      const after = await subscribeStatus(clientB, topic);
      expect(after).not.toBe("SUBSCRIBED");
      await clientB.removeAllChannels();
    } finally {
      await db
        .from("memberships")
        .update({ is_active: true })
        .eq("workspace_id", EMPRESA_B)
        .eq("user_id", userBId);
    }
  }, 20_000);

  it("bloqueo 1: apagar team_chat_enabled también corta el Realtime, aunque la membership siga activa", async (ctx) => {
    if (!reachable) return ctx.skip();
    const topic = `team:${generalBId}`;

    const before = await subscribeStatus(clientB, topic);
    expect(before).toBe("SUBSCRIBED");
    await clientB.removeAllChannels();

    const { error: disableErr } = await db
      .from("workspaces")
      .update({ team_chat_enabled: false })
      .eq("id", EMPRESA_B);
    expect(disableErr).toBeNull();

    try {
      // La membership de B sigue activa — solo cambió team_chat_enabled.
      const after = await subscribeStatus(clientB, topic);
      expect(after).not.toBe("SUBSCRIBED");
      await clientB.removeAllChannels();
    } finally {
      await db.from("workspaces").update({ team_chat_enabled: true }).eq("id", EMPRESA_B);
    }
  }, 20_000);

  it("bloqueo 2: get_or_create_dm_channel rechaza crear un DM si el Chat está apagado", async (ctx) => {
    if (!reachable) return ctx.skip();

    const { error: disableErr } = await db
      .from("workspaces")
      .update({ team_chat_enabled: false })
      .eq("id", EMPRESA_B);
    expect(disableErr).toBeNull();

    try {
      const { data: superRow } = await db.from("users").select("id").eq("email", SUPERADMIN_EMAIL).single();
      // superadmin es miembro de Empresa B también (seed), así que la única
      // razón de rechazo posible aquí es el Chat apagado — no memberships.
      const { error } = await clientB.rpc("get_or_create_dm_channel", {
        p_workspace_id: EMPRESA_B,
        p_other_user_id: superRow!.id,
      });
      expect(error).not.toBeNull();
      expect(error?.message).toContain("not enabled");

      // Confirmar que no quedó ni canal ni participantes a medias.
      const { count } = await db
        .from("team_channels")
        .select("*", { count: "exact", head: true })
        .eq("workspace_id", EMPRESA_B)
        .eq("kind", "direct");
      expect(count).toBe(0);
    } finally {
      await db.from("workspaces").update({ team_chat_enabled: true }).eq("id", EMPRESA_B);
    }
  });

  it("bloqueo 3: activación atómica — un fallo provocado no deja team_chat_enabled=true sin General/backfill", async (ctx) => {
    if (!reachable) return ctx.skip();

    const { data: ws, error: wsErr } = await db
      .from("workspaces")
      .insert({ name: `${RUN_TAG}-atomic`, slug: `${RUN_TAG}-atomic`, gestion_enabled: true, team_chat_enabled: false, human_member_limit: 1 })
      .select("id")
      .single();
    expect(wsErr).toBeNull();
    const wsId = ws!.id as string;

    // 3 miembros humanos activos, a propósito por encima del límite que se
    // va a pedir a continuación (1) — fallo real y determinista, no
    // artificial: activar con un cupo insuficiente para la ocupación actual
    // es un estado inválido que la propia función debe rechazar.
    const emails = [1, 2, 3].map((n) => `${RUN_TAG}-atomic${n}@empresab.local`);
    const userIds: string[] = [];
    for (const email of emails) {
      const { data: u } = await db.auth.admin.createUser({ email, password: "TestLocal123!", email_confirm: true });
      userIds.push(u!.user!.id);
      await db.from("users").insert({ id: u!.user!.id, full_name: email, email });
      await db.from("memberships").insert({ workspace_id: wsId, user_id: u!.user!.id, role: "agent", is_active: true });
    }

    const { error: activateErr } = await db.rpc("set_team_chat_enabled", {
      p_workspace_id: wsId,
      p_enabled: true,
      p_human_member_limit: 1,
    });
    expect(activateErr).not.toBeNull();
    expect(activateErr?.message).toContain("is below the");

    // Rollback completo: la bandera NUNCA debe haber quedado en true, y no
    // debe existir canal General — antes del fix esto era imposible de
    // garantizar porque el flag y el aprovisionamiento eran dos pasos
    // sueltos (UPDATE + rpc separado).
    const { data: wsAfter } = await db.from("workspaces").select("team_chat_enabled").eq("id", wsId).single();
    expect(wsAfter?.team_chat_enabled).toBe(false);

    const { count: generalCount } = await db
      .from("team_channels")
      .select("*", { count: "exact", head: true })
      .eq("workspace_id", wsId)
      .eq("kind", "general");
    expect(generalCount).toBe(0);

    await db.from("memberships").delete().eq("workspace_id", wsId);
    for (const id of userIds) await db.auth.admin.deleteUser(id).catch(() => {});
    await db.from("workspaces").delete().eq("id", wsId);
  });

  it("bloqueo 4: cupo lleno con email nuevo no deja una cuenta huérfana en Auth ni en users", async (ctx) => {
    if (!reachable) return ctx.skip();

    // Reproduce el mismo flujo que POST /api/workspace/[id]/team: primero
    // provisionWorkspaceUser (crea Auth + users), luego claim_workspace_seat
    // (puede fallar por cupo) y, si falló Y la cuenta era nueva, compensar
    // borrándola — igual que hace la ruta tras este fix.
    const { data: ws, error: wsErr } = await db
      .from("workspaces")
      .insert({ name: `${RUN_TAG}-orphan-full`, slug: `${RUN_TAG}-orphan-full`, gestion_enabled: true, human_member_limit: 1 })
      .select("id")
      .single();
    expect(wsErr).toBeNull();
    const wsId = ws!.id as string;

    // Ocupa la única plaza con un miembro real.
    const { data: clienteARow } = await db.from("users").select("id").eq("email", CLIENTE_A_EMAIL).single();
    const { error: claimFirstErr } = await db.rpc("claim_workspace_seat", {
      p_workspace_id: wsId,
      p_user_id: clienteARow!.id,
      p_role: "agent",
    });
    expect(claimFirstErr).toBeNull();

    // Email NUEVO: provisionWorkspaceUser lo crearía en Auth+users.
    const newEmail = `${RUN_TAG}-orphan-full-new@empresab.local`;
    const { data: authUser, error: authErr } = await db.auth.admin.createUser({
      email: newEmail,
      password: "TestLocal123!",
      email_confirm: true,
    });
    expect(authErr).toBeNull();
    const newUserId = authUser!.user!.id;
    await db.from("users").insert({ id: newUserId, full_name: newEmail, email: newEmail });

    // La reserva de plaza para esta cuenta nueva debe fallar (cupo lleno).
    const { error: claimSecondErr } = await db.rpc("claim_workspace_seat", {
      p_workspace_id: wsId,
      p_user_id: newUserId,
      p_role: "agent",
    });
    expect(claimSecondErr).not.toBeNull();
    expect(claimSecondErr?.message).toContain("TEAM_SEAT_LIMIT_REACHED");

    // Compensación (lo que ahora hace la ruta cuando provisioned.created===true).
    const { error: cleanupErr } = await db.auth.admin.deleteUser(newUserId);
    expect(cleanupErr).toBeNull();

    // Sin filas huérfanas en ninguna de las dos tablas.
    const { data: authList } = await db.auth.admin.listUsers();
    expect(authList?.users.some((u) => u.id === newUserId)).toBe(false);
    const { data: profileRow } = await db.from("users").select("id").eq("id", newUserId).maybeSingle();
    expect(profileRow).toBeNull();

    await db.from("memberships").delete().eq("workspace_id", wsId);
    await db.from("workspaces").delete().eq("id", wsId);
  });

  it("bloqueo 4: en una carrera por la última plaza, el perdedor tampoco deja una cuenta huérfana", async (ctx) => {
    if (!reachable) return ctx.skip();

    const { data: ws, error: wsErr } = await db
      .from("workspaces")
      .insert({ name: `${RUN_TAG}-orphan-race`, slug: `${RUN_TAG}-orphan-race`, gestion_enabled: true, human_member_limit: 1 })
      .select("id")
      .single();
    expect(wsErr).toBeNull();
    const wsId = ws!.id as string;

    // Dos cuentas NUEVAS, ambas provisionadas (Auth+users) antes de competir
    // por la única plaza disponible — igual que dos invitaciones concurrentes
    // reales contra el mismo workspace recién creado.
    const emailWin = `${RUN_TAG}-orphan-race-win@empresab.local`;
    const emailLose = `${RUN_TAG}-orphan-race-lose@empresab.local`;
    const { data: winAuth } = await db.auth.admin.createUser({ email: emailWin, password: "TestLocal123!", email_confirm: true });
    const { data: loseAuth } = await db.auth.admin.createUser({ email: emailLose, password: "TestLocal123!", email_confirm: true });
    const winId = winAuth!.user!.id;
    const loseId = loseAuth!.user!.id;
    await db.from("users").insert([
      { id: winId, full_name: emailWin, email: emailWin },
      { id: loseId, full_name: emailLose, email: emailLose },
    ]);

    const [r1, r2] = await Promise.allSettled([
      db.rpc("claim_workspace_seat", { p_workspace_id: wsId, p_user_id: winId, p_role: "agent" }),
      db.rpc("claim_workspace_seat", { p_workspace_id: wsId, p_user_id: loseId, p_role: "agent" }),
    ]);

    const errorFor = (r: PromiseSettledResult<{ error: { message: string } | null }>) =>
      r.status === "fulfilled" ? r.value.error : (r.reason as { message: string });
    const err1 = errorFor(r1);
    const err2 = errorFor(r2);
    // Exactamente uno de los dos pierde — compensar solo al perdedor.
    const loserUserId = !err1 ? loseId : winId;
    const winnerUserId = !err1 ? winId : loseId;
    expect([err1, err2].filter((e) => !e)).toHaveLength(1);
    expect([err1, err2].filter((e) => e)).toHaveLength(1);

    await db.auth.admin.deleteUser(loserUserId);

    const { data: authList } = await db.auth.admin.listUsers();
    expect(authList?.users.some((u) => u.id === loserUserId)).toBe(false);
    // El ganador, en cambio, NUNCA debe borrarse — sigue teniendo su plaza.
    expect(authList?.users.some((u) => u.id === winnerUserId)).toBe(true);
    const { data: winnerMembership } = await db
      .from("memberships")
      .select("is_active")
      .eq("workspace_id", wsId)
      .eq("user_id", winnerUserId)
      .maybeSingle();
    expect(winnerMembership?.is_active).toBe(true);

    await db.from("memberships").delete().eq("workspace_id", wsId);
    await db.auth.admin.deleteUser(winnerUserId).catch(() => {});
    await db.from("workspaces").delete().eq("id", wsId);
  });

  it("bloqueo 5: paginar con timestamps idénticos entre páginas no duplica ni pierde mensajes", async (ctx) => {
    if (!reachable) return ctx.skip();

    // Todos los mensajes de este bloque comparten el MISMO created_at exacto
    // (fijado explícitamente), reproduciendo el escenario que el cursor
    // antiguo (solo created_at) no distinguía: con id como desempate, el
    // orden total (created_at DESC, id DESC) es determinista incluso así.
    const { data: clienteARow } = await db.from("users").select("id").eq("email", CLIENTE_A_EMAIL).single();
    const sameTimestamp = new Date().toISOString();
    const { data: inserted, error: insertErr } = await db
      .from("team_messages")
      .insert(
        Array.from({ length: 5 }, (_, i) => ({
          workspace_id: EMPRESA_A,
          channel_id: generalAId,
          sender_id: clienteARow!.id,
          body: `${RUN_TAG}-cursor-${i}`,
          created_at: sameTimestamp,
        })),
      )
      .select("id, created_at");
    expect(insertErr).toBeNull();
    expect(inserted).toHaveLength(5);

    try {
      // Réplica exacta de getChannelMessages(): mismo order(), mismo límite
      // pequeño para forzar varias páginas, mismo filtro .or() lexicográfico.
      const pageSize = 2;
      const seen: string[] = [];
      let cursor: { createdAt: string; id: string } | null = null;
      for (let page = 0; page < 5; page++) {
        let query = db
          .from("team_messages")
          .select("id, created_at")
          .eq("channel_id", generalAId)
          .like("body", `${RUN_TAG}-cursor-%`)
          .order("created_at", { ascending: false })
          .order("id", { ascending: false })
          .limit(pageSize);
        if (cursor) {
          query = query.or(`created_at.lt.${cursor.createdAt},and(created_at.eq.${cursor.createdAt},id.lt.${cursor.id})`);
        }
        const { data: rows, error } = await query;
        expect(error).toBeNull();
        if (!rows || rows.length === 0) break;
        seen.push(...rows.map((r) => r.id as string));
        const last = rows[rows.length - 1];
        cursor = rows.length === pageSize ? { createdAt: last.created_at as string, id: last.id as string } : null;
        if (!cursor) break;
      }

      expect(new Set(seen).size).toBe(seen.length); // sin duplicados
      expect(seen).toHaveLength(5); // sin mensajes perdidos
      expect(new Set(seen)).toEqual(new Set(inserted!.map((r) => r.id as string)));
    } finally {
      await db.from("team_messages").delete().like("body", `${RUN_TAG}-cursor-%`);
    }
  });

  it("bloqueo 6: team_chat_backfill_seat_limit() nunca baja el cupo por debajo de los miembros activos ni del mínimo comercial", async (ctx) => {
    if (!reachable) return ctx.skip();

    // Simula el estado "recién añadida la columna, antes del backfill": un
    // workspace con human_member_limit=1 a mano, WhatsApp activo (mínimo
    // comercial=2) y 3 miembros humanos activos ya reales — exactamente el
    // escenario que preocupaba a la revisión ("workspace existente con 2+
    // miembros antes de la migración").
    const { data: ws, error: wsErr } = await db
      .from("workspaces")
      .insert({
        name: `${RUN_TAG}-backfill`,
        slug: `${RUN_TAG}-backfill`,
        gestion_enabled: true,
        whatsapp_agent_enabled: true,
        human_member_limit: 1,
      })
      .select("id")
      .single();
    expect(wsErr).toBeNull();
    const wsId = ws!.id as string;

    const emails = [1, 2, 3].map((n) => `${RUN_TAG}-backfill${n}@empresab.local`);
    const userIds: string[] = [];
    for (const email of emails) {
      const { data: u } = await db.auth.admin.createUser({ email, password: "TestLocal123!", email_confirm: true });
      userIds.push(u!.user!.id);
      await db.from("users").insert({ id: u!.user!.id, full_name: email, email });
      await db.from("memberships").insert({ workspace_id: wsId, user_id: u!.user!.id, role: "agent", is_active: true });
    }

    const { error: backfillErr } = await db.rpc("team_chat_backfill_seat_limit", { p_workspace_id: wsId });
    expect(backfillErr).toBeNull();

    // GREATEST(1 previo, 3 miembros activos, 2 mínimo comercial WhatsApp) = 3.
    const { data: wsAfter } = await db.from("workspaces").select("human_member_limit").eq("id", wsId).single();
    expect(wsAfter?.human_member_limit).toBe(3);

    await db.from("memberships").delete().eq("workspace_id", wsId);
    for (const id of userIds) await db.auth.admin.deleteUser(id).catch(() => {});
    await db.from("workspaces").delete().eq("id", wsId);
  });
});
