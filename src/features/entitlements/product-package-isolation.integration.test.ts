// Fase 2 (docs/CLAUDE-ARQUITECTURA-PAQUETES-NAVEGACION-IA-ASISTENTE.md §2):
// set_workspace_product_package() con Postgres/REST reales — mismo patrón
// que team-chat-isolation.integration.test.ts (JWTs reales, nunca solo
// service_role). Se salta (no falla) si el stack local no está arriba.

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
let db: SupabaseClient; // service_role — únicamente para preparar/leer fixtures, nunca para ejercitar la RPC en sí

const RUN_TAG = `pkg-iso-${Date.now()}`;

interface WorkspaceSnapshot {
  product_package: string;
  gestion_enabled: boolean;
  whatsapp_agent_enabled: boolean;
  office_virtual_enabled: boolean;
  whiteboard_enabled: boolean;
  human_member_limit: number;
  team_chat_enabled: boolean;
  team_chat_storage_quota_mb: number;
}

async function snapshot(workspaceId: string): Promise<WorkspaceSnapshot> {
  const { data } = await db
    .from("workspaces")
    .select(
      "product_package, gestion_enabled, whatsapp_agent_enabled, office_virtual_enabled, whiteboard_enabled, human_member_limit, team_chat_enabled, team_chat_storage_quota_mb",
    )
    .eq("id", workspaceId)
    .single();
  return data as WorkspaceSnapshot;
}

describe("set_workspace_product_package — Postgres/REST reales", () => {
  let originalA: WorkspaceSnapshot;
  let originalB: WorkspaceSnapshot;

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
    originalA = await snapshot(EMPRESA_A);
    originalB = await snapshot(EMPRESA_B);
  }, POLL_TIMEOUT_MS + 15_000);

  afterAll(async () => {
    if (!reachable) return;
    // Restaura el paquete original de ambos workspaces — esta suite es la
    // única de esta sesión que muta EMPRESA_A/B de verdad (no solo lee),
    // así que deja el estado exactamente como lo encontró para no romper
    // ninguna otra prueba ni la revisión manual.
    await db.rpc("set_workspace_product_package", { p_workspace_id: EMPRESA_A, p_package: originalA.product_package });
    await db.rpc("set_workspace_product_package", { p_workspace_id: EMPRESA_B, p_package: originalB.product_package });
    await db
      .from("workspaces")
      .update({
        human_member_limit: originalA.human_member_limit,
        team_chat_enabled: originalA.team_chat_enabled,
        team_chat_storage_quota_mb: originalA.team_chat_storage_quota_mb,
      })
      .eq("id", EMPRESA_A);
    await db
      .from("workspaces")
      .update({
        human_member_limit: originalB.human_member_limit,
        team_chat_enabled: originalB.team_chat_enabled,
        team_chat_storage_quota_mb: originalB.team_chat_storage_quota_mb,
      })
      .eq("id", EMPRESA_B);
  });

  describe("Seguridad: solo service_role puede ejecutar set_workspace_product_package", () => {
    it("anon no puede ejecutarla directamente vía REST", async (ctx) => {
      if (!reachable) return ctx.skip();
      const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/set_workspace_product_package`, {
        method: "POST",
        headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ p_workspace_id: EMPRESA_A, p_package: "suite" }),
      });
      const body = await r.json();
      expect(r.status).toBe(401);
      expect(body.code).toBe("42501");
    });

    it("un usuario authenticated normal (no service_role) tampoco puede ejecutarla", async (ctx) => {
      if (!reachable) return ctx.skip();
      const freshClient = createClient(SUPABASE_URL, ANON_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
      const { data: signInData, error: signInErr } = await freshClient.auth.signInWithPassword({
        email: "cliente@empresaa.local",
        password: "TestLocal123!",
      });
      expect(signInErr).toBeNull();
      const jwt = signInData.session?.access_token;
      expect(jwt).toBeTruthy();

      const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/set_workspace_product_package`, {
        method: "POST",
        headers: { apikey: ANON_KEY, Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        // Un atacante intentaría subirse a sí mismo a Suite saltándose
        // requireSuperAdmin() de la ruta API.
        body: JSON.stringify({ p_workspace_id: EMPRESA_A, p_package: "suite" }),
      });
      const body = await r.json();
      expect(r.status).toBe(403);
      expect(body.code).toBe("42501");
      await freshClient.auth.signOut().catch(() => {});
    });
  });

  it("valida el valor del paquete — rechaza cualquier cadena que no sea una de las 7 canónicas", async (ctx) => {
    if (!reachable) return ctx.skip();
    const { error } = await db.rpc("set_workspace_product_package", { p_workspace_id: EMPRESA_A, p_package: "premium_deluxe" });
    expect(error).not.toBeNull();
  });

  it("escribe los 4 flags derivados en una sola llamada, exactos a la matriz, para cada uno de los 7 paquetes", async (ctx) => {
    if (!reachable) return ctx.skip();

    const { error: noneErr } = await db.rpc("set_workspace_product_package", { p_workspace_id: EMPRESA_A, p_package: "none" });
    expect(noneErr).toBeNull();
    expect(await snapshot(EMPRESA_A)).toMatchObject({
      product_package: "none",
      gestion_enabled: false,
      whatsapp_agent_enabled: false,
      office_virtual_enabled: false,
      whiteboard_enabled: false,
    });

    const { error: gestionErr } = await db.rpc("set_workspace_product_package", { p_workspace_id: EMPRESA_A, p_package: "gestion" });
    expect(gestionErr).toBeNull();
    expect(await snapshot(EMPRESA_A)).toMatchObject({
      product_package: "gestion",
      gestion_enabled: true,
      whatsapp_agent_enabled: false,
      office_virtual_enabled: false,
      whiteboard_enabled: true, // Board vive dentro de Gestión (decisión revisada)
    });

    const { error: wgErr } = await db.rpc("set_workspace_product_package", { p_workspace_id: EMPRESA_A, p_package: "whatsapp_gestion" });
    expect(wgErr).toBeNull();
    expect(await snapshot(EMPRESA_A)).toMatchObject({
      product_package: "whatsapp_gestion",
      gestion_enabled: true,
      whatsapp_agent_enabled: true,
      office_virtual_enabled: false,
      whiteboard_enabled: true,
    });

    const { error: waErr } = await db.rpc("set_workspace_product_package", { p_workspace_id: EMPRESA_A, p_package: "whatsapp" });
    expect(waErr).toBeNull();
    expect(await snapshot(EMPRESA_A)).toMatchObject({
      product_package: "whatsapp",
      gestion_enabled: false,
      whatsapp_agent_enabled: true,
      office_virtual_enabled: false,
      whiteboard_enabled: false, // sin Gestión, sin Board
    });

    const { error: ofErr } = await db.rpc("set_workspace_product_package", { p_workspace_id: EMPRESA_A, p_package: "oficina" });
    expect(ofErr).toBeNull();
    expect(await snapshot(EMPRESA_A)).toMatchObject({
      product_package: "oficina",
      gestion_enabled: false,
      whatsapp_agent_enabled: false,
      office_virtual_enabled: true,
      whiteboard_enabled: false, // sin Gestión, sin Board
    });

    const { error: woErr } = await db.rpc("set_workspace_product_package", { p_workspace_id: EMPRESA_A, p_package: "whatsapp_oficina" });
    expect(woErr).toBeNull();
    expect(await snapshot(EMPRESA_A)).toMatchObject({
      product_package: "whatsapp_oficina",
      gestion_enabled: false,
      whatsapp_agent_enabled: true,
      office_virtual_enabled: true,
      whiteboard_enabled: false, // sin Gestión, sin Board
    });

    const { data: suiteResult, error: suiteErr } = await db.rpc("set_workspace_product_package", { p_workspace_id: EMPRESA_A, p_package: "suite" });
    expect(suiteErr).toBeNull();
    expect(await snapshot(EMPRESA_A)).toMatchObject({
      product_package: "suite",
      gestion_enabled: true,
      whatsapp_agent_enabled: true,
      office_virtual_enabled: true,
      whiteboard_enabled: true,
    });

    // Devuelve el estado anterior (whatsapp_oficina) y el nuevo (suite) en
    // un único jsonb, para que la ruta API pueda auditar sin otra consulta.
    const result = suiteResult as { previous: { package: string }; next: { package: string } };
    expect(result.previous.package).toBe("whatsapp_oficina");
    expect(result.next.package).toBe("suite");
  });

  it("aislamiento: cambiar el paquete de Empresa A nunca toca Empresa B", async (ctx) => {
    if (!reachable) return ctx.skip();
    const before = await snapshot(EMPRESA_B);

    const { error } = await db.rpc("set_workspace_product_package", { p_workspace_id: EMPRESA_A, p_package: "gestion" });
    expect(error).toBeNull();

    const after = await snapshot(EMPRESA_B);
    expect(after).toEqual(before);
  });

  it("downgrade a 'none' no borra ninguna fila de datos reales (proyectos/tareas/deals/content_items)", async (ctx) => {
    if (!reachable) return ctx.skip();

    await db.rpc("set_workspace_product_package", { p_workspace_id: EMPRESA_A, p_package: "suite" });

    const { data: project } = await db
      .from("projects")
      .insert({ workspace_id: EMPRESA_A, name: `${RUN_TAG}-proyecto` })
      .select("id")
      .single();
    const { data: deal, error: dealInsertErr } = await db
      .from("deals")
      .insert({
        workspace_id: EMPRESA_A,
        title: `${RUN_TAG}-negocio`,
        stage: "exploracion",
        value: 100,
        lead_name: `${RUN_TAG}-lead`,
        lead_phone: "+525500000000",
      })
      .select("id")
      .single();
    expect(dealInsertErr).toBeNull();
    const { data: contentItem } = await db
      .from("content_items")
      .insert({ workspace_id: EMPRESA_A, title: `${RUN_TAG}-idea`, status: "idea" })
      .select("id")
      .single();

    const { error: downgradeErr } = await db.rpc("set_workspace_product_package", { p_workspace_id: EMPRESA_A, p_package: "none" });
    expect(downgradeErr).toBeNull();

    const { data: projectAfter } = await db.from("projects").select("id").eq("id", project!.id as string).maybeSingle();
    const { data: dealAfter } = await db.from("deals").select("id").eq("id", deal!.id as string).maybeSingle();
    const { data: contentAfter } = await db.from("content_items").select("id").eq("id", contentItem!.id as string).maybeSingle();
    expect(projectAfter).not.toBeNull();
    expect(dealAfter).not.toBeNull();
    expect(contentAfter).not.toBeNull();

    await db.from("projects").delete().eq("id", project!.id as string);
    await db.from("deals").delete().eq("id", deal!.id as string);
    await db.from("content_items").delete().eq("id", contentItem!.id as string);
  });

  it("set_workspace_product_package() nunca toca Chat de equipo — igualdad exacta antes/después de un upgrade Y de un downgrade", async (ctx) => {
    if (!reachable) return ctx.skip();

    // Revisión correctiva: la función YA NO llama a
    // team_chat_backfill_seat_limit() ni escribe ninguna columna de Chat de
    // equipo — es un add-on completamente independiente del paquete (§2.3).
    // Se fija un estado de Chat "distintivo" a mano (activo, cupo 20,
    // cuota 777 MB) y se prueba que sobrevive IDÉNTICO —no solo "no baja"—
    // tanto a un upgrade (gestion -> suite) como a un downgrade
    // (suite -> none).
    await db.rpc("set_workspace_product_package", { p_workspace_id: EMPRESA_A, p_package: "gestion" });
    await db.rpc("set_team_chat_enabled", { p_workspace_id: EMPRESA_A, p_enabled: true, p_human_member_limit: 20 });
    await db.from("workspaces").update({ team_chat_storage_quota_mb: 777 }).eq("id", EMPRESA_A);

    const beforeUpgrade = await snapshot(EMPRESA_A);
    expect(beforeUpgrade).toMatchObject({
      team_chat_enabled: true,
      human_member_limit: 20,
      team_chat_storage_quota_mb: 777,
    });

    const { error: upgradeErr } = await db.rpc("set_workspace_product_package", { p_workspace_id: EMPRESA_A, p_package: "suite" });
    expect(upgradeErr).toBeNull();

    const afterUpgrade = await snapshot(EMPRESA_A);
    expect(afterUpgrade.team_chat_enabled).toBe(beforeUpgrade.team_chat_enabled);
    expect(afterUpgrade.human_member_limit).toBe(beforeUpgrade.human_member_limit);
    expect(afterUpgrade.team_chat_storage_quota_mb).toBe(beforeUpgrade.team_chat_storage_quota_mb);

    const { error: downgradeErr } = await db.rpc("set_workspace_product_package", { p_workspace_id: EMPRESA_A, p_package: "none" });
    expect(downgradeErr).toBeNull();

    const afterDowngrade = await snapshot(EMPRESA_A);
    expect(afterDowngrade.team_chat_enabled).toBe(beforeUpgrade.team_chat_enabled);
    expect(afterDowngrade.human_member_limit).toBe(beforeUpgrade.human_member_limit);
    expect(afterDowngrade.team_chat_storage_quota_mb).toBe(beforeUpgrade.team_chat_storage_quota_mb);

    await db.from("workspaces").update({ team_chat_enabled: false }).eq("id", EMPRESA_A);
  });

  it("Chat de equipo sobrevive IDÉNTICO a una secuencia larga de cambios de paquete (upgrade, downgrade, upgrade, downgrade) — no solo a un único hop", async (ctx) => {
    if (!reachable) return ctx.skip();

    await db.rpc("set_workspace_product_package", { p_workspace_id: EMPRESA_A, p_package: "gestion" });
    await db.rpc("set_team_chat_enabled", { p_workspace_id: EMPRESA_A, p_enabled: true, p_human_member_limit: 13 });
    await db.from("workspaces").update({ team_chat_storage_quota_mb: 321 }).eq("id", EMPRESA_A);

    const baseline = await snapshot(EMPRESA_A);
    expect(baseline).toMatchObject({ team_chat_enabled: true, human_member_limit: 13, team_chat_storage_quota_mb: 321 });

    const sequence: Array<"none" | "gestion" | "whatsapp_gestion" | "whatsapp" | "oficina" | "whatsapp_oficina" | "suite"> = [
      "whatsapp_gestion",
      "none",
      "suite",
      "gestion",
      "whatsapp",
      "oficina",
      "whatsapp_oficina",
      "suite",
      "none",
    ];
    for (const pkg of sequence) {
      const { error } = await db.rpc("set_workspace_product_package", { p_workspace_id: EMPRESA_A, p_package: pkg });
      expect(error).toBeNull();
      const snap = await snapshot(EMPRESA_A);
      expect(snap.team_chat_enabled).toBe(baseline.team_chat_enabled);
      expect(snap.human_member_limit).toBe(baseline.human_member_limit);
      expect(snap.team_chat_storage_quota_mb).toBe(baseline.team_chat_storage_quota_mb);
    }

    await db.from("workspaces").update({ team_chat_enabled: false }).eq("id", EMPRESA_A);
  });

  describe("Matriz exhaustiva de los 7 paquetes — enumeración completa pedida por la revisión correctiva", () => {
    it("none: los 4 flags apagados", async (ctx) => {
      if (!reachable) return ctx.skip();
      await db.rpc("set_workspace_product_package", { p_workspace_id: EMPRESA_A, p_package: "none" });
      expect(await snapshot(EMPRESA_A)).toMatchObject({
        product_package: "none",
        gestion_enabled: false,
        whatsapp_agent_enabled: false,
        office_virtual_enabled: false,
        whiteboard_enabled: false,
      });
    });

    it("gestion: Gestión y Board, WhatsApp y Oficina apagados", async (ctx) => {
      if (!reachable) return ctx.skip();
      await db.rpc("set_workspace_product_package", { p_workspace_id: EMPRESA_A, p_package: "gestion" });
      expect(await snapshot(EMPRESA_A)).toMatchObject({
        product_package: "gestion",
        gestion_enabled: true,
        whatsapp_agent_enabled: false,
        office_virtual_enabled: false,
        whiteboard_enabled: true,
      });
    });

    it("whatsapp_gestion: Gestión, WhatsApp y Board, Oficina apagada", async (ctx) => {
      if (!reachable) return ctx.skip();
      await db.rpc("set_workspace_product_package", { p_workspace_id: EMPRESA_A, p_package: "whatsapp_gestion" });
      expect(await snapshot(EMPRESA_A)).toMatchObject({
        product_package: "whatsapp_gestion",
        gestion_enabled: true,
        whatsapp_agent_enabled: true,
        office_virtual_enabled: false,
        whiteboard_enabled: true,
      });
    });

    it("whatsapp: solo WhatsApp, SIN Gestión, Oficina NI Board (Paquete 5)", async (ctx) => {
      if (!reachable) return ctx.skip();
      await db.rpc("set_workspace_product_package", { p_workspace_id: EMPRESA_A, p_package: "whatsapp" });
      expect(await snapshot(EMPRESA_A)).toMatchObject({
        product_package: "whatsapp",
        gestion_enabled: false,
        whatsapp_agent_enabled: true,
        office_virtual_enabled: false,
        whiteboard_enabled: false,
      });
    });

    it("oficina: solo Oficina Virtual, SIN Gestión, WhatsApp NI Board (Paquete 6)", async (ctx) => {
      if (!reachable) return ctx.skip();
      await db.rpc("set_workspace_product_package", { p_workspace_id: EMPRESA_A, p_package: "oficina" });
      expect(await snapshot(EMPRESA_A)).toMatchObject({
        product_package: "oficina",
        gestion_enabled: false,
        whatsapp_agent_enabled: false,
        office_virtual_enabled: true,
        whiteboard_enabled: false,
      });
    });

    it("whatsapp_oficina: WhatsApp y Oficina, SIN Gestión NI Board (Paquete 4)", async (ctx) => {
      if (!reachable) return ctx.skip();
      await db.rpc("set_workspace_product_package", { p_workspace_id: EMPRESA_A, p_package: "whatsapp_oficina" });
      expect(await snapshot(EMPRESA_A)).toMatchObject({
        product_package: "whatsapp_oficina",
        gestion_enabled: false,
        whatsapp_agent_enabled: true,
        office_virtual_enabled: true,
        whiteboard_enabled: false,
      });
    });

    it("suite: Gestión, WhatsApp, Oficina y Board — los 4 encendidos", async (ctx) => {
      if (!reachable) return ctx.skip();
      await db.rpc("set_workspace_product_package", { p_workspace_id: EMPRESA_A, p_package: "suite" });
      expect(await snapshot(EMPRESA_A)).toMatchObject({
        product_package: "suite",
        gestion_enabled: true,
        whatsapp_agent_enabled: true,
        office_virtual_enabled: true,
        whiteboard_enabled: true,
      });
    });
  });
});
