// Fase 4 — update_content_item_fields_cas() y la rama 'update_content_item'
// de resolve_assistant_pending_action() con Postgres/REST reales. Mismo
// patrón que las suites de integración de 4A/4B/4C previas: JWTs reales
// para RLS (SECURITY INVOKER exige un rol authenticated real), service_role
// solo para preparar/leer fixtures. Se salta (no falla) si el stack local
// no está arriba.

import { createHash, randomBytes } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
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
const ADMIN_A_ONLY = "8a0684ce-05ee-4741-a26c-5131df1924ba"; // cliente@empresaa.local
const AGENCY_ADMIN = "94ede212-a935-4259-a0e9-5a1547422477"; // superadmin@onyxlink.local — admin de A y B

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
let db: SupabaseClient; // service_role — fixtures y lecturas de verificación
let jwtA: SupabaseClient; // cliente@empresaa.local — admin SOLO de A
let jwtBoth: SupabaseClient; // superadmin@onyxlink.local — admin de A y B

const RUN_TAG = `content-cas-${Date.now()}`;
const createdItemIds: string[] = [];

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

async function createItemFixture(workspaceId: string, overrides: Record<string, unknown> = {}) {
  const { data, error } = await db
    .from("content_items")
    .insert({ workspace_id: workspaceId, title: `${RUN_TAG}-item`, ...overrides })
    .select("id, version")
    .single();
  expect(error).toBeNull();
  createdItemIds.push(data!.id as string);
  return data as { id: string; version: number };
}

async function insertUpdatePendingAction(params: {
  workspaceId: string;
  actorUserId: string;
  contentItemId: string;
  expectedVersion: number;
  patch: Record<string, unknown>;
}) {
  const token = randomBytes(32).toString("hex");
  const { error } = await db.from("assistant_pending_actions").insert({
    workspace_id: params.workspaceId,
    actor_user_id: params.actorUserId,
    action_type: "update_content_item",
    payload: { content_item_id: params.contentItemId, expected_version: params.expectedVersion, patch: params.patch },
    summary: `${RUN_TAG} — sustitución de prueba`,
    token_hash: hashToken(token),
    expires_at: new Date(Date.now() + 300_000).toISOString(),
  });
  expect(error).toBeNull();
  return token;
}

async function resolvePendingAction(token: string, decision: "confirm" | "cancel", actorUserId: string, workspaceId: string) {
  const { data, error } = await db.rpc("resolve_assistant_pending_action", {
    p_token_hash: hashToken(token),
    p_decision: decision,
    p_actor_user_id: actorUserId,
    p_workspace_id: workspaceId,
  });
  return { data: data as { ok: boolean; code: string; result?: Record<string, unknown> } | null, error };
}

describe("update_content_item_fields_cas / update_content_item — Postgres/REST reales", () => {
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
    await db.from("workspaces").update({ help_assistant_actions_enabled: true, product_package: "suite" }).eq("id", EMPRESA_A);

    jwtA = createClient(SUPABASE_URL, ANON_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
    const signInA = await jwtA.auth.signInWithPassword({ email: "cliente@empresaa.local", password: "TestLocal123!" });
    expect(signInA.error).toBeNull();

    jwtBoth = createClient(SUPABASE_URL, ANON_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
    const signInBoth = await jwtBoth.auth.signInWithPassword({ email: "superadmin@onyxlink.local", password: "TestLocal123!" });
    expect(signInBoth.error).toBeNull();
  }, POLL_TIMEOUT_MS + 15_000);

  afterEach(async () => {
    if (!reachable) return;
    for (const id of createdItemIds.splice(0)) {
      await db.from("content_items").delete().eq("id", id);
    }
  });

  afterAll(async () => {
    if (!reachable) return;
    await jwtA?.auth.signOut().catch(() => {});
    await jwtBoth?.auth.signOut().catch(() => {});
    await db.from("workspaces").update({ help_assistant_actions_enabled: false }).eq("id", EMPRESA_A);
  });

  describe("Seguridad: authenticated puede ejecutarla (RLS decide el resto), anon no puede en absoluto", () => {
    it("anon no puede ejecutar update_content_item_fields_cas directamente vía REST", async (ctx) => {
      if (!reachable) return ctx.skip();
      const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/update_content_item_fields_cas`, {
        method: "POST",
        headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          p_workspace_id: EMPRESA_A,
          p_content_item_id: "00000000-0000-0000-0000-000000000000",
          p_expected_version: 1,
          p_patch: { title: "x" },
        }),
      });
      const body = await r.json();
      expect(r.status).toBe(401);
      expect(body.code).toBe("42501");
    });
  });

  it("un miembro real de A puede actualizar un contenido de A — version sube exactamente 1", async (ctx) => {
    if (!reachable) return ctx.skip();
    const item = await createItemFixture(EMPRESA_A, { description: null });

    const { data, error } = await jwtA.rpc("update_content_item_fields_cas", {
      p_workspace_id: EMPRESA_A,
      p_content_item_id: item.id,
      p_expected_version: item.version,
      p_patch: { description: "Nueva descripción", bullet_points: ["a", "b"] },
    });

    expect(error).toBeNull();
    expect(data).toMatchObject({ result: "updated", version: item.version + 1 });

    const { data: row } = await db.from("content_items").select("version, description, bullet_points").eq("id", item.id).single();
    expect((row as { version: number }).version).toBe(item.version + 1);
    expect((row as { description: string }).description).toBe("Nueva descripción");
    expect((row as { bullet_points: string[] }).bullet_points).toEqual(["a", "b"]);
  });

  it("un campo no permitido en el parche se rechaza (excepción), nunca escribe", async (ctx) => {
    if (!reachable) return ctx.skip();
    const item = await createItemFixture(EMPRESA_A);

    const { data, error } = await jwtA.rpc("update_content_item_fields_cas", {
      p_workspace_id: EMPRESA_A,
      p_content_item_id: item.id,
      p_expected_version: item.version,
      p_patch: { workspace_id: EMPRESA_B },
    });

    expect(data).toBeNull();
    expect(error).not.toBeNull();
    const { data: row } = await db.from("content_items").select("workspace_id").eq("id", item.id).single();
    expect((row as { workspace_id: string }).workspace_id).toBe(EMPRESA_A);
  });

  it("filtro EXPLÍCITO de workspace: pasar el workspace_id equivocado da not_found_or_forbidden, nunca escribe", async (ctx) => {
    if (!reachable) return ctx.skip();
    const item = await createItemFixture(EMPRESA_A, { title: "original" });

    const { data } = await jwtBoth.rpc("update_content_item_fields_cas", {
      p_workspace_id: EMPRESA_B,
      p_content_item_id: item.id,
      p_expected_version: item.version,
      p_patch: { title: "hackeado" },
    });

    expect(data).toMatchObject({ result: "not_found_or_forbidden" });
    const { data: row } = await db.from("content_items").select("title, version").eq("id", item.id).single();
    expect((row as { title: string }).title).toBe("original");
    expect((row as { version: number }).version).toBe(item.version);
  });

  it("RLS: un admin SOLO de A no puede tocar un contenido de B ni aunque adivine su id", async (ctx) => {
    if (!reachable) return ctx.skip();
    const item = await createItemFixture(EMPRESA_B, { title: "original-b" });

    const { data } = await jwtA.rpc("update_content_item_fields_cas", {
      p_workspace_id: EMPRESA_B,
      p_content_item_id: item.id,
      p_expected_version: item.version,
      p_patch: { title: "hackeado" },
    });

    expect(data).toMatchObject({ result: "not_found_or_forbidden" });
  });

  it("conflicto de versión: expected_version desactualizada da 'conflict', nunca escribe — no se pierde la edición humana", async (ctx) => {
    if (!reachable) return ctx.skip();
    const item = await createItemFixture(EMPRESA_A, { title: "original" });

    // Simula que un humano editó mientras tanto: la versión real ya subió.
    await jwtA.rpc("update_content_item_fields_cas", { p_workspace_id: EMPRESA_A, p_content_item_id: item.id, p_expected_version: item.version, p_patch: { title: "editado por humano" } });

    const { data } = await jwtA.rpc("update_content_item_fields_cas", {
      p_workspace_id: EMPRESA_A,
      p_content_item_id: item.id,
      p_expected_version: item.version, // versión vieja, ya no coincide
      p_patch: { title: "sobrescrito por el agente" },
    });

    expect(data).toMatchObject({ result: "conflict" });
    const { data: row } = await db.from("content_items").select("title").eq("id", item.id).single();
    expect((row as { title: string }).title).toBe("editado por humano"); // la edición humana sobrevive
  });

  it("responsible_id que no pertenece al workspace -> invalid_responsible, nunca escribe (nunca se confía en el ID sin verificar)", async (ctx) => {
    if (!reachable) return ctx.skip();
    const item = await createItemFixture(EMPRESA_A);
    const outsiderUserId = "00000000-0000-0000-0000-000000000000";

    const { data } = await jwtA.rpc("update_content_item_fields_cas", {
      p_workspace_id: EMPRESA_A,
      p_content_item_id: item.id,
      p_expected_version: item.version,
      p_patch: { responsible_id: outsiderUserId },
    });

    expect(data).toMatchObject({ result: "invalid_responsible" });
    const { data: row } = await db.from("content_items").select("responsible_id, version").eq("id", item.id).single();
    expect((row as { responsible_id: string | null }).responsible_id).toBeNull();
    expect((row as { version: number }).version).toBe(item.version);
  });

  it("responsible_id que SÍ pertenece al workspace se guarda correctamente", async (ctx) => {
    if (!reachable) return ctx.skip();
    const item = await createItemFixture(EMPRESA_A);

    const { data } = await jwtA.rpc("update_content_item_fields_cas", {
      p_workspace_id: EMPRESA_A,
      p_content_item_id: item.id,
      p_expected_version: item.version,
      p_patch: { responsible_id: ADMIN_A_ONLY },
    });

    expect(data).toMatchObject({ result: "updated" });
    const { data: row } = await db.from("content_items").select("responsible_id").eq("id", item.id).single();
    expect((row as { responsible_id: string }).responsible_id).toBe(ADMIN_A_ONLY);
  });

  it("una edición HUMANA (UPDATE directo, mismo camino que updateContentItem) también sube version — el trigger no distingue quién escribe", async (ctx) => {
    if (!reachable) return ctx.skip();
    const item = await createItemFixture(EMPRESA_A);
    await db.from("content_items").update({ title: "editado a mano" }).eq("id", item.id);
    const { data: row } = await db.from("content_items").select("version").eq("id", item.id).single();
    expect((row as { version: number }).version).toBe(item.version + 1);
  });

  describe("update_content_item (confirmable) — nunca pierde una edición humana concurrente", () => {
    it("confirma y aplica el parche preparado, sube version", async (ctx) => {
      if (!reachable) return ctx.skip();
      const item = await createItemFixture(EMPRESA_A, { script_hook: "viejo" });
      const token = await insertUpdatePendingAction({
        workspaceId: EMPRESA_A,
        actorUserId: ADMIN_A_ONLY,
        contentItemId: item.id,
        expectedVersion: item.version,
        patch: { script_hook: "nuevo" },
      });

      const { data, error } = await resolvePendingAction(token, "confirm", ADMIN_A_ONLY, EMPRESA_A);
      expect(error).toBeNull();
      expect(data).toMatchObject({ ok: true, code: "executed" });

      const { data: row } = await db.from("content_items").select("script_hook, version").eq("id", item.id).single();
      expect((row as { script_hook: string }).script_hook).toBe("nuevo");
      expect((row as { version: number }).version).toBe(item.version + 1);
    });

    it("si el contenido cambió desde que se preparó la confirmación (edición humana entre medias), devuelve conflicto y NO sobrescribe", async (ctx) => {
      if (!reachable) return ctx.skip();
      const item = await createItemFixture(EMPRESA_A, { script_hook: "viejo" });
      const token = await insertUpdatePendingAction({
        workspaceId: EMPRESA_A,
        actorUserId: ADMIN_A_ONLY,
        contentItemId: item.id,
        expectedVersion: item.version,
        patch: { script_hook: "propuesto por el agente" },
      });

      // Edición humana real ENTRE preparar y confirmar.
      await db.from("content_items").update({ script_hook: "editado por un humano mientras tanto" }).eq("id", item.id);

      const { data } = await resolvePendingAction(token, "confirm", ADMIN_A_ONLY, EMPRESA_A);
      expect(data).toMatchObject({ ok: false, code: "entity_already_changed" });

      const { data: row } = await db.from("content_items").select("script_hook").eq("id", item.id).single();
      expect((row as { script_hook: string }).script_hook).toBe("editado por un humano mientras tanto"); // nunca se pierde
    });

    it("entity_not_found cuando el content_item_id no existe (en este workspace)", async (ctx) => {
      if (!reachable) return ctx.skip();
      const token = await insertUpdatePendingAction({
        workspaceId: EMPRESA_A,
        actorUserId: ADMIN_A_ONLY,
        contentItemId: "00000000-0000-0000-0000-000000000000",
        expectedVersion: 1,
        patch: { title: "x" },
      });
      const { data } = await resolvePendingAction(token, "confirm", ADMIN_A_ONLY, EMPRESA_A);
      expect(data).toMatchObject({ ok: false, code: "entity_not_found" });
    });

    it("cancelar nunca toca content_items", async (ctx) => {
      if (!reachable) return ctx.skip();
      const item = await createItemFixture(EMPRESA_A, { title: "original" });
      const token = await insertUpdatePendingAction({ workspaceId: EMPRESA_A, actorUserId: ADMIN_A_ONLY, contentItemId: item.id, expectedVersion: item.version, patch: { title: "nuevo" } });

      const { data } = await resolvePendingAction(token, "cancel", ADMIN_A_ONLY, EMPRESA_A);
      expect(data).toMatchObject({ ok: true, code: "cancelled" });

      const { data: row } = await db.from("content_items").select("title, version").eq("id", item.id).single();
      expect((row as { title: string }).title).toBe("original");
      expect((row as { version: number }).version).toBe(item.version);
    });

    it("token de A confirmado desde B responde invalid_token — no revela nada, no escribe nada", async (ctx) => {
      if (!reachable) return ctx.skip();
      const item = await createItemFixture(EMPRESA_A, { title: "original" });
      const token = await insertUpdatePendingAction({ workspaceId: EMPRESA_A, actorUserId: ADMIN_A_ONLY, contentItemId: item.id, expectedVersion: item.version, patch: { title: "nuevo" } });

      const { data } = await resolvePendingAction(token, "confirm", AGENCY_ADMIN, EMPRESA_B);
      expect(data).toMatchObject({ ok: false, code: "invalid_token" });

      const { data: row } = await db.from("content_items").select("title").eq("id", item.id).single();
      expect((row as { title: string }).title).toBe("original");
    });

    it("kill switch apagado entre preparar y confirmar: permission_revoked, nunca ejecuta", async (ctx) => {
      if (!reachable) return ctx.skip();
      const item = await createItemFixture(EMPRESA_A, { title: "original" });
      const token = await insertUpdatePendingAction({ workspaceId: EMPRESA_A, actorUserId: ADMIN_A_ONLY, contentItemId: item.id, expectedVersion: item.version, patch: { title: "nuevo" } });

      await db.from("workspaces").update({ help_assistant_actions_enabled: false }).eq("id", EMPRESA_A);
      const { data } = await resolvePendingAction(token, "confirm", ADMIN_A_ONLY, EMPRESA_A);
      expect(data).toMatchObject({ ok: false, code: "permission_revoked" });

      await db.from("workspaces").update({ help_assistant_actions_enabled: true }).eq("id", EMPRESA_A); // restaura para el resto de la suite
      const { data: row } = await db.from("content_items").select("title").eq("id", item.id).single();
      expect((row as { title: string }).title).toBe("original");
    });

    it("membership desactivada entre preparar y confirmar: permission_revoked, nunca ejecuta", async (ctx) => {
      if (!reachable) return ctx.skip();
      const item = await createItemFixture(EMPRESA_A, { title: "original" });
      const token = await insertUpdatePendingAction({ workspaceId: EMPRESA_A, actorUserId: ADMIN_A_ONLY, contentItemId: item.id, expectedVersion: item.version, patch: { title: "nuevo" } });

      await db.from("memberships").update({ is_active: false }).eq("workspace_id", EMPRESA_A).eq("user_id", ADMIN_A_ONLY);
      const { data } = await resolvePendingAction(token, "confirm", ADMIN_A_ONLY, EMPRESA_A);
      expect(data).toMatchObject({ ok: false, code: "permission_revoked" });

      await db.from("memberships").update({ is_active: true }).eq("workspace_id", EMPRESA_A).eq("user_id", ADMIN_A_ONLY); // restaura para el resto de la suite
      const { data: row } = await db.from("content_items").select("title").eq("id", item.id).single();
      expect((row as { title: string }).title).toBe("original");
    });

    it("downgrade de paquete a solo Gestión entre preparar y confirmar: permission_revoked, nunca ejecuta (Contenido en Gestión no escribe)", async (ctx) => {
      if (!reachable) return ctx.skip();
      const item = await createItemFixture(EMPRESA_A, { title: "original" });
      const token = await insertUpdatePendingAction({ workspaceId: EMPRESA_A, actorUserId: ADMIN_A_ONLY, contentItemId: item.id, expectedVersion: item.version, patch: { title: "nuevo" } });

      await db.from("workspaces").update({ product_package: "gestion" }).eq("id", EMPRESA_A);
      const { data } = await resolvePendingAction(token, "confirm", ADMIN_A_ONLY, EMPRESA_A);
      expect(data).toMatchObject({ ok: false, code: "permission_revoked" });

      await db.from("workspaces").update({ product_package: "suite" }).eq("id", EMPRESA_A); // restaura para el resto de la suite
      const { data: row } = await db.from("content_items").select("title").eq("id", item.id).single();
      expect((row as { title: string }).title).toBe("original");
    });

    it("payload malformado (patch ausente) nunca lanza excepción, marca failed con código interno", async (ctx) => {
      if (!reachable) return ctx.skip();
      const item = await createItemFixture(EMPRESA_A);
      const token = randomBytes(32).toString("hex");
      const { error: insertErr } = await db.from("assistant_pending_actions").insert({
        workspace_id: EMPRESA_A,
        actor_user_id: ADMIN_A_ONLY,
        action_type: "update_content_item",
        payload: { content_item_id: item.id, expected_version: item.version }, // falta patch
        summary: "payload malo",
        token_hash: hashToken(token),
        expires_at: new Date(Date.now() + 300_000).toISOString(),
      });
      expect(insertErr).toBeNull();

      const { data, error } = await resolvePendingAction(token, "confirm", ADMIN_A_ONLY, EMPRESA_A);
      expect(error).toBeNull();
      expect(data).toMatchObject({ ok: false, code: "internal_error" });

      const { data: row } = await db.from("assistant_pending_actions").select("status, result").eq("token_hash", hashToken(token)).single();
      expect((row as { status: string }).status).toBe("failed");
      expect(((row as { result: { code: string } }).result).code).toBe("invalid_payload");
    });

    it("un campo no permitido dentro del patch confirmado tampoco tumba la transacción — falla limpio", async (ctx) => {
      if (!reachable) return ctx.skip();
      const item = await createItemFixture(EMPRESA_A, { title: "original" });
      const token = await insertUpdatePendingAction({
        workspaceId: EMPRESA_A,
        actorUserId: ADMIN_A_ONLY,
        contentItemId: item.id,
        expectedVersion: item.version,
        patch: { workspace_id: EMPRESA_B },
      });

      const { data, error } = await resolvePendingAction(token, "confirm", ADMIN_A_ONLY, EMPRESA_A);
      expect(error).toBeNull();
      expect(data).toMatchObject({ ok: false, code: "internal_error" });

      const { data: row } = await db.from("content_items").select("title, workspace_id").eq("id", item.id).single();
      expect((row as { title: string }).title).toBe("original");
      expect((row as { workspace_id: string }).workspace_id).toBe(EMPRESA_A);
    });
  });
});
