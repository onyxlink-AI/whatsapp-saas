// Fase 4C — update_whiteboard_scene_cas() y la rama delete_board_element de
// resolve_assistant_pending_action() con Postgres/REST reales. Mismo
// patrón que las suites de integración de 4A/4B/4C previas: JWTs reales
// para RLS (SECURITY INVOKER exige un rol authenticated real, no basta
// service_role), service_role solo para preparar/leer fixtures. Se salta
// (no falla) si el stack local no está arriba.

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

const RUN_TAG = `board-cas-${Date.now()}`;
const createdBoardIds: string[] = [];

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function el(id: string, type: string, extra: Record<string, unknown> = {}) {
  return { id, type, x: 0, y: 0, width: 100, height: 100, version: 1, isDeleted: false, boundElements: null, ...extra };
}

async function createBoardFixture(workspaceId: string, elements: Record<string, unknown>[]) {
  const { data, error } = await db
    .from("whiteboards")
    .insert({ workspace_id: workspaceId, name: `${RUN_TAG}-board`, scene_data: { elements, appState: {} }, created_by: workspaceId === EMPRESA_A ? ADMIN_A_ONLY : AGENCY_ADMIN })
    .select("id, version")
    .single();
  expect(error).toBeNull();
  createdBoardIds.push(data!.id as string);
  return data as { id: string; version: number };
}

async function insertDeletePendingAction(params: { workspaceId: string; actorUserId: string; whiteboardId: string; elementId: string; expectedElementVersion: number }) {
  const token = randomBytes(32).toString("hex");
  const { error } = await db.from("assistant_pending_actions").insert({
    workspace_id: params.workspaceId,
    actor_user_id: params.actorUserId,
    action_type: "delete_board_element",
    payload: { whiteboard_id: params.whiteboardId, element_id: params.elementId, expected_element_version: params.expectedElementVersion },
    summary: `${RUN_TAG} — borrado de prueba`,
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

describe("update_whiteboard_scene_cas / delete_board_element — Postgres/REST reales", () => {
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
    for (const id of createdBoardIds.splice(0)) {
      await db.from("whiteboards").delete().eq("id", id);
    }
  });

  afterAll(async () => {
    if (!reachable) return;
    await jwtA?.auth.signOut().catch(() => {});
    await jwtBoth?.auth.signOut().catch(() => {});
    await db.from("workspaces").update({ help_assistant_actions_enabled: false }).eq("id", EMPRESA_A);
  });

  describe("Seguridad: authenticated puede ejecutarla (RLS decide el resto), anon no puede en absoluto", () => {
    it("anon no puede ejecutar update_whiteboard_scene_cas directamente vía REST", async (ctx) => {
      if (!reachable) return ctx.skip();
      const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/update_whiteboard_scene_cas`, {
        method: "POST",
        headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ p_workspace_id: EMPRESA_A, p_whiteboard_id: "00000000-0000-0000-0000-000000000000", p_expected_version: 1, p_elements: [] }),
      });
      const body = await r.json();
      expect(r.status).toBe(401);
      expect(body.code).toBe("42501");
    });

    it("anon no puede ejecutar update_whiteboard_app_state directamente vía REST", async (ctx) => {
      if (!reachable) return ctx.skip();
      const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/update_whiteboard_app_state`, {
        method: "POST",
        headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ p_workspace_id: EMPRESA_A, p_whiteboard_id: "00000000-0000-0000-0000-000000000000", p_app_state: { zoom: { value: 1 } } }),
      });
      const body = await r.json();
      expect(r.status).toBe(401);
      expect(body.code).toBe("42501");
    });
  });

  it("un miembro real de A puede actualizar un tablero de A — version sube exactamente 1, p_elements es SOLO el array (nunca appState)", async (ctx) => {
    if (!reachable) return ctx.skip();
    const board = await createBoardFixture(EMPRESA_A, [el("e1", "rectangle")]);

    const { data, error } = await jwtA.rpc("update_whiteboard_scene_cas", {
      p_workspace_id: EMPRESA_A,
      p_whiteboard_id: board.id,
      p_expected_version: board.version,
      p_elements: [el("e1", "rectangle", { x: 50 })],
    });

    expect(error).toBeNull();
    expect(data).toMatchObject({ result: "updated", version: board.version + 1 });

    const { data: row } = await db.from("whiteboards").select("version, scene_data").eq("id", board.id).single();
    expect((row as { version: number }).version).toBe(board.version + 1);
    expect(((row as { scene_data: { elements: { x: number }[] } }).scene_data.elements[0]).x).toBe(50);
  });

  it("filtro EXPLÍCITO de workspace: pasar el workspace_id equivocado (aunque el llamador sea miembro de él) da not_found_or_forbidden, nunca escribe", async (ctx) => {
    if (!reachable) return ctx.skip();
    const board = await createBoardFixture(EMPRESA_A, [el("e1", "rectangle")]);

    // jwtBoth SÍ es miembro de B — pero el tablero es de A. Pasar
    // p_workspace_id=B (un workspace real y accesible para el llamador,
    // solo que no es el del tablero) debe fallar igual que "no autorizado".
    const { data } = await jwtBoth.rpc("update_whiteboard_scene_cas", {
      p_workspace_id: EMPRESA_B,
      p_whiteboard_id: board.id,
      p_expected_version: board.version,
      p_elements: [el("e1", "rectangle", { x: 999 })],
    });

    expect(data).toMatchObject({ result: "not_found_or_forbidden" });
    const { data: row } = await db.from("whiteboards").select("version").eq("id", board.id).single();
    expect((row as { version: number }).version).toBe(board.version);
  });

  it("RLS: un admin SOLO de A no puede tocar un tablero de B ni aunque adivine su id — nunca revela si existe", async (ctx) => {
    if (!reachable) return ctx.skip();
    const board = await createBoardFixture(EMPRESA_B, [el("e1", "rectangle")]);

    const { data } = await jwtA.rpc("update_whiteboard_scene_cas", {
      p_workspace_id: EMPRESA_B,
      p_whiteboard_id: board.id,
      p_expected_version: board.version,
      p_elements: [el("e1", "rectangle", { x: 999 })],
    });

    expect(data).toMatchObject({ result: "not_found_or_forbidden" });
  });

  it("conflicto de versión: expected_version desactualizado da 'conflict', nunca escribe", async (ctx) => {
    if (!reachable) return ctx.skip();
    const board = await createBoardFixture(EMPRESA_A, [el("e1", "rectangle")]);

    const { data } = await jwtA.rpc("update_whiteboard_scene_cas", {
      p_workspace_id: EMPRESA_A,
      p_whiteboard_id: board.id,
      p_expected_version: board.version + 5, // versión que nunca existió aún
      p_elements: [],
    });

    expect(data).toMatchObject({ result: "conflict" });
  });

  it("CAS concurrente: dos escrituras simultáneas con el mismo expected_version — exactamente una gana", async (ctx) => {
    if (!reachable) return ctx.skip();
    const board = await createBoardFixture(EMPRESA_A, [el("e1", "rectangle")]);

    const [a, b] = await Promise.all([
      jwtA.rpc("update_whiteboard_scene_cas", { p_workspace_id: EMPRESA_A, p_whiteboard_id: board.id, p_expected_version: board.version, p_elements: [el("e1", "rectangle", { x: 1 })] }),
      jwtA.rpc("update_whiteboard_scene_cas", { p_workspace_id: EMPRESA_A, p_whiteboard_id: board.id, p_expected_version: board.version, p_elements: [el("e1", "rectangle", { x: 2 })] }),
    ]);

    const results = [a.data?.result, b.data?.result].sort();
    expect(results).toEqual(["conflict", "updated"]);

    const { data: row } = await db.from("whiteboards").select("version").eq("id", board.id).single();
    expect((row as { version: number }).version).toBe(board.version + 1); // solo UNA escritura ganó
  });

  it("más de 1000 elementos -> scene_too_large, nunca escribe", async (ctx) => {
    if (!reachable) return ctx.skip();
    const board = await createBoardFixture(EMPRESA_A, [el("e1", "rectangle")]);
    const tooMany = Array.from({ length: 1001 }, (_, i) => el(`e${i}`, "rectangle"));

    const { data } = await jwtA.rpc("update_whiteboard_scene_cas", {
      p_workspace_id: EMPRESA_A,
      p_whiteboard_id: board.id,
      p_expected_version: board.version,
      p_elements: tooMany,
    });

    expect(data).toMatchObject({ result: "scene_too_large" });
    const { data: row } = await db.from("whiteboards").select("version").eq("id", board.id).single();
    expect((row as { version: number }).version).toBe(board.version);
  });

  it("más de 5 MiB -> scene_too_large, nunca escribe", async (ctx) => {
    if (!reachable) return ctx.skip();
    const board = await createBoardFixture(EMPRESA_A, [el("e1", "rectangle")]);
    const bigText = "x".repeat(6 * 1024 * 1024);

    const { data } = await jwtA.rpc("update_whiteboard_scene_cas", {
      p_workspace_id: EMPRESA_A,
      p_whiteboard_id: board.id,
      p_expected_version: board.version,
      p_elements: [el("e1", "text", { text: bigText })],
    });

    expect(data).toMatchObject({ result: "scene_too_large" });
  });

  describe("update_whiteboard_app_state — revisión correctiva §4: separada de elements, nunca toca version", () => {
    it("un miembro real de A puede actualizar solo el appState de un tablero de A — nunca toca elements ni version", async (ctx) => {
      if (!reachable) return ctx.skip();
      const board = await createBoardFixture(EMPRESA_A, [el("e1", "rectangle", { x: 42 })]);

      const { data, error } = await jwtA.rpc("update_whiteboard_app_state", {
        p_workspace_id: EMPRESA_A,
        p_whiteboard_id: board.id,
        p_app_state: { zoom: { value: 2 }, scrollX: 10, scrollY: -5 },
      });

      expect(error).toBeNull();
      expect(data).toMatchObject({ result: "updated" });

      const { data: row } = await db.from("whiteboards").select("version, scene_data").eq("id", board.id).single();
      expect((row as { version: number }).version).toBe(board.version); // NUNCA sube version
      const sceneData = (row as { scene_data: { elements: { x: number }[]; appState: Record<string, unknown> } }).scene_data;
      expect(sceneData.elements[0].x).toBe(42); // elements intacto
      expect(sceneData.appState).toMatchObject({ zoom: { value: 2 }, scrollX: 10, scrollY: -5 });
    });

    it("rechaza una clave de appState fuera de la whitelist — nunca escribe", async (ctx) => {
      if (!reachable) return ctx.skip();
      const board = await createBoardFixture(EMPRESA_A, [el("e1", "rectangle")]);

      const { data, error } = await jwtA.rpc("update_whiteboard_app_state", {
        p_workspace_id: EMPRESA_A,
        p_whiteboard_id: board.id,
        p_app_state: { selectedElementIds: { "e1": true } },
      });

      expect(data).toBeNull();
      expect(error).not.toBeNull();

      const { data: row } = await db.from("whiteboards").select("scene_data").eq("id", board.id).single();
      expect((row as { scene_data: { appState: Record<string, unknown> } }).scene_data.appState).toEqual({});
    });

    it("RLS: un admin SOLO de A no puede tocar el appState de un tablero de B", async (ctx) => {
      if (!reachable) return ctx.skip();
      const board = await createBoardFixture(EMPRESA_B, [el("e1", "rectangle")]);

      const { data } = await jwtA.rpc("update_whiteboard_app_state", {
        p_workspace_id: EMPRESA_B,
        p_whiteboard_id: board.id,
        p_app_state: { zoom: { value: 3 } },
      });

      expect(data).toMatchObject({ result: "not_found_or_forbidden" });
    });

    it("más de 10 KiB -> scene_too_large, nunca escribe", async (ctx) => {
      if (!reachable) return ctx.skip();
      const board = await createBoardFixture(EMPRESA_A, [el("e1", "rectangle")]);

      const { data } = await jwtA.rpc("update_whiteboard_app_state", {
        p_workspace_id: EMPRESA_A,
        p_whiteboard_id: board.id,
        p_app_state: { viewBackgroundColor: "x".repeat(11 * 1024) },
      });

      expect(data).toMatchObject({ result: "scene_too_large" });
    });

    it("concurrencia real: un usuario cambia zoom mientras el asistente añade una nota — ambos cambios sobreviven", async (ctx) => {
      if (!reachable) return ctx.skip();
      const board = await createBoardFixture(EMPRESA_A, [el("e1", "rectangle")]);

      const [appStateResult, elementsResult] = await Promise.all([
        jwtA.rpc("update_whiteboard_app_state", { p_workspace_id: EMPRESA_A, p_whiteboard_id: board.id, p_app_state: { zoom: { value: 1.75 } } }),
        jwtA.rpc("update_whiteboard_scene_cas", { p_workspace_id: EMPRESA_A, p_whiteboard_id: board.id, p_expected_version: board.version, p_elements: [el("e1", "rectangle"), el("e2", "rectangle", { x: 300 })] }),
      ]);

      expect(appStateResult.data).toMatchObject({ result: "updated" });
      expect(elementsResult.data).toMatchObject({ result: "updated", version: board.version + 1 });

      const { data: row } = await db.from("whiteboards").select("version, scene_data").eq("id", board.id).single();
      const sceneData = (row as { version: number; scene_data: { elements: { id: string }[]; appState: Record<string, unknown> } }).scene_data;
      expect((row as { version: number }).version).toBe(board.version + 1); // solo la escritura de elements incrementa version
      expect(sceneData.elements.map((e) => e.id).sort()).toEqual(["e1", "e2"]); // la nota del asistente sobrevive
      expect(sceneData.appState).toMatchObject({ zoom: { value: 1.75 } }); // el zoom del usuario sobrevive, sin ser pisado por la escritura de elements
    });
  });

  describe("delete_board_element — grupo de borrado persistente (customData.onyxlinkDeletionGroup), nunca nulifica bindings", () => {
    it("borra un elemento suelto: isDeleted=true, version del elemento Y del tablero suben, se estampa un deletion_group_id propio", async (ctx) => {
      if (!reachable) return ctx.skip();
      const board = await createBoardFixture(EMPRESA_A, [el("solo-1", "rectangle", { version: 3 })]);
      const token = await insertDeletePendingAction({ workspaceId: EMPRESA_A, actorUserId: ADMIN_A_ONLY, whiteboardId: board.id, elementId: "solo-1", expectedElementVersion: 3 });

      const { data, error } = await resolvePendingAction(token, "confirm", ADMIN_A_ONLY, EMPRESA_A);
      expect(error).toBeNull();
      expect(data).toMatchObject({ ok: true, code: "executed" });
      expect((data!.result as { deletion_group_id: string }).deletion_group_id).toEqual(expect.any(String));

      const { data: row } = await db.from("whiteboards").select("version, scene_data").eq("id", board.id).single();
      expect((row as { version: number }).version).toBe(board.version + 1);
      const elements = (row as { scene_data: { elements: Record<string, unknown>[] } }).scene_data.elements;
      const target = elements.find((e) => e.id === "solo-1")!;
      expect(target.isDeleted).toBe(true);
      expect(target.version).toBe(4);
      expect((target.customData as { onyxlinkDeletionGroup: string }).onyxlinkDeletionGroup).toBe((data!.result as { deletion_group_id: string }).deletion_group_id);
    });

    it("borrar un CONTENEDOR (nota adhesiva) borra en cascada su texto ligado, ambos con el MISMO deletion_group_id, sin tocar boundElements/containerId", async (ctx) => {
      if (!reachable) return ctx.skip();
      const board = await createBoardFixture(EMPRESA_A, [
        el("container-1", "rectangle", { version: 2, boundElements: [{ id: "label-1", type: "text" }] }),
        el("label-1", "text", { version: 2, containerId: "container-1" }),
      ]);
      const token = await insertDeletePendingAction({ workspaceId: EMPRESA_A, actorUserId: ADMIN_A_ONLY, whiteboardId: board.id, elementId: "container-1", expectedElementVersion: 2 });

      const { data } = await resolvePendingAction(token, "confirm", ADMIN_A_ONLY, EMPRESA_A);
      const groupId = (data!.result as { deletion_group_id: string }).deletion_group_id;

      const { data: row } = await db.from("whiteboards").select("scene_data").eq("id", board.id).single();
      const elements = (row as { scene_data: { elements: Record<string, unknown>[] } }).scene_data.elements;
      const container = elements.find((e) => e.id === "container-1")!;
      const label = elements.find((e) => e.id === "label-1")!;
      expect(container.isDeleted).toBe(true);
      expect(label.isDeleted).toBe(true); // cascada
      expect((container.customData as { onyxlinkDeletionGroup: string }).onyxlinkDeletionGroup).toBe(groupId);
      expect((label.customData as { onyxlinkDeletionGroup: string }).onyxlinkDeletionGroup).toBe(groupId);
      // La relación original NUNCA se toca al borrar — se conserva intacta para poder restaurarla exacta.
      expect(container.boundElements).toEqual([{ id: "label-1", type: "text" }]);
      expect(label.containerId).toBe("container-1");
    });

    it("borrar un elemento con una flecha conectada la incluye en la MISMA cascada — la flecha también queda isDeleted, bindings de AMBOS extremos intactos (nunca nulificados)", async (ctx) => {
      if (!reachable) return ctx.skip();
      const board = await createBoardFixture(EMPRESA_A, [
        el("shape-1", "rectangle", { version: 1, boundElements: [{ id: "arrow-1", type: "arrow" }] }),
        el("shape-2", "rectangle", { version: 1, boundElements: [{ id: "arrow-1", type: "arrow" }] }),
        el("arrow-1", "arrow", { version: 1, startBinding: { elementId: "shape-1", focus: 0, gap: 4 }, endBinding: { elementId: "shape-2", focus: 0, gap: 4 } }),
      ]);
      const token = await insertDeletePendingAction({ workspaceId: EMPRESA_A, actorUserId: ADMIN_A_ONLY, whiteboardId: board.id, elementId: "shape-1", expectedElementVersion: 1 });

      const { data } = await resolvePendingAction(token, "confirm", ADMIN_A_ONLY, EMPRESA_A);
      const groupId = (data!.result as { deletion_group_id: string }).deletion_group_id;

      const { data: row } = await db.from("whiteboards").select("scene_data").eq("id", board.id).single();
      const elements = (row as { scene_data: { elements: Record<string, unknown>[] } }).scene_data.elements;
      const arrow = elements.find((e) => e.id === "arrow-1")!;
      const shape2 = elements.find((e) => e.id === "shape-2")!;

      expect(arrow.isDeleted).toBe(true); // la flecha entra en la MISMA cascada de borrado — no queda huérfana
      expect((arrow.customData as { onyxlinkDeletionGroup: string }).onyxlinkDeletionGroup).toBe(groupId);
      // Bindings NUNCA nulificados — es lo que permite reconstruir la relación original al restaurar.
      expect((arrow.startBinding as { elementId: string }).elementId).toBe("shape-1");
      expect((arrow.endBinding as { elementId: string }).elementId).toBe("shape-2");
      // shape-2 nunca se marca eliminado (no es el objetivo ni depende de shape-1) — solo la flecha que los unía.
      expect(shape2.isDeleted).toBe(false);
      expect(shape2.customData).toBeUndefined();
    });

    it("no vuelve a marcar (ni cambia de grupo) un elemento que YA estaba borrado antes de esta operación", async (ctx) => {
      if (!reachable) return ctx.skip();
      const board = await createBoardFixture(EMPRESA_A, [
        el("container-1", "rectangle", { version: 1, boundElements: [{ id: "label-1", type: "text" }, { id: "arrow-1", type: "arrow" }] }),
        el("label-1", "text", { version: 1, containerId: "container-1" }),
        // arrow-1 ya estaba borrada por una operación PREVIA distinta — su propio deletionGroup no debe cambiar.
        el("arrow-1", "arrow", { version: 3, isDeleted: true, startBinding: { elementId: "container-1", focus: 0, gap: 4 }, endBinding: null, customData: { onyxlinkDeletionGroup: "grupo-anterior" } }),
      ]);
      const token = await insertDeletePendingAction({ workspaceId: EMPRESA_A, actorUserId: ADMIN_A_ONLY, whiteboardId: board.id, elementId: "container-1", expectedElementVersion: 1 });

      const { data } = await resolvePendingAction(token, "confirm", ADMIN_A_ONLY, EMPRESA_A);
      const newGroupId = (data!.result as { deletion_group_id: string }).deletion_group_id;

      const { data: row } = await db.from("whiteboards").select("scene_data").eq("id", board.id).single();
      const elements = (row as { scene_data: { elements: Record<string, unknown>[] } }).scene_data.elements;
      const arrow = elements.find((e) => e.id === "arrow-1")!;

      // arrow-1 no formaba parte de ESTA operación (ya estaba borrada antes) — conserva su grupo y su versión, tal cual.
      expect(arrow.version).toBe(3);
      expect((arrow.customData as { onyxlinkDeletionGroup: string }).onyxlinkDeletionGroup).toBe("grupo-anterior");
      expect((arrow.customData as { onyxlinkDeletionGroup: string }).onyxlinkDeletionGroup).not.toBe(newGroupId);
    });

    it("conserva otras claves de customData del elemento al estampar el deletionGroup — nunca las pisa", async (ctx) => {
      if (!reachable) return ctx.skip();
      const board = await createBoardFixture(EMPRESA_A, [el("solo-1", "rectangle", { version: 1, customData: { miClaveDeUsuario: "no tocar" } })]);
      const token = await insertDeletePendingAction({ workspaceId: EMPRESA_A, actorUserId: ADMIN_A_ONLY, whiteboardId: board.id, elementId: "solo-1", expectedElementVersion: 1 });

      await resolvePendingAction(token, "confirm", ADMIN_A_ONLY, EMPRESA_A);

      const { data: row } = await db.from("whiteboards").select("scene_data").eq("id", board.id).single();
      const elements = (row as { scene_data: { elements: Record<string, unknown>[] } }).scene_data.elements;
      const target = elements.find((e) => e.id === "solo-1")!;
      const customData = target.customData as Record<string, unknown>;
      expect(customData.miClaveDeUsuario).toBe("no tocar");
      expect(customData.onyxlinkDeletionGroup).toEqual(expect.any(String));
    });

    it("entity_already_changed cuando expected_element_version no coincide con la versión real del elemento", async (ctx) => {
      if (!reachable) return ctx.skip();
      const board = await createBoardFixture(EMPRESA_A, [el("e1", "rectangle", { version: 5 })]);
      const token = await insertDeletePendingAction({ workspaceId: EMPRESA_A, actorUserId: ADMIN_A_ONLY, whiteboardId: board.id, elementId: "e1", expectedElementVersion: 2 });

      const { data } = await resolvePendingAction(token, "confirm", ADMIN_A_ONLY, EMPRESA_A);
      expect(data).toMatchObject({ ok: false, code: "entity_already_changed" });

      const { data: row } = await db.from("whiteboards").select("scene_data").eq("id", board.id).single();
      const elements = (row as { scene_data: { elements: Record<string, unknown>[] } }).scene_data.elements;
      expect(elements.find((e) => e.id === "e1")!.isDeleted).toBe(false);
    });

    it("entity_already_changed cuando el elemento ya estaba borrado", async (ctx) => {
      if (!reachable) return ctx.skip();
      const board = await createBoardFixture(EMPRESA_A, [el("e1", "rectangle", { version: 1, isDeleted: true })]);
      const token = await insertDeletePendingAction({ workspaceId: EMPRESA_A, actorUserId: ADMIN_A_ONLY, whiteboardId: board.id, elementId: "e1", expectedElementVersion: 1 });

      const { data } = await resolvePendingAction(token, "confirm", ADMIN_A_ONLY, EMPRESA_A);
      expect(data).toMatchObject({ ok: false, code: "entity_already_changed" });
    });

    it("entity_not_found cuando el whiteboard no existe (en este workspace) o el element_id no está en la escena", async (ctx) => {
      if (!reachable) return ctx.skip();
      const board = await createBoardFixture(EMPRESA_A, [el("e1", "rectangle", { version: 1 })]);
      const token = await insertDeletePendingAction({ workspaceId: EMPRESA_A, actorUserId: ADMIN_A_ONLY, whiteboardId: board.id, elementId: "no-existe", expectedElementVersion: 1 });

      const { data } = await resolvePendingAction(token, "confirm", ADMIN_A_ONLY, EMPRESA_A);
      expect(data).toMatchObject({ ok: false, code: "entity_not_found" });
    });

    it("token de A (borrado de un elemento de A) confirmado desde B responde invalid_token — no revela nada, no borra nada", async (ctx) => {
      if (!reachable) return ctx.skip();
      const board = await createBoardFixture(EMPRESA_A, [el("e1", "rectangle", { version: 1 })]);
      const token = await insertDeletePendingAction({ workspaceId: EMPRESA_A, actorUserId: ADMIN_A_ONLY, whiteboardId: board.id, elementId: "e1", expectedElementVersion: 1 });

      const { data } = await resolvePendingAction(token, "confirm", AGENCY_ADMIN, EMPRESA_B);
      expect(data).toMatchObject({ ok: false, code: "invalid_token" });

      const { data: row } = await db.from("whiteboards").select("scene_data").eq("id", board.id).single();
      const elements = (row as { scene_data: { elements: Record<string, unknown>[] } }).scene_data.elements;
      expect(elements.find((e) => e.id === "e1")!.isDeleted).toBe(false);
    });

    it("payload malformado (element_id ausente) nunca lanza excepción, marca failed con código interno", async (ctx) => {
      if (!reachable) return ctx.skip();
      const board = await createBoardFixture(EMPRESA_A, [el("e1", "rectangle", { version: 1 })]);
      const token = randomBytes(32).toString("hex");
      const { error: insertErr } = await db.from("assistant_pending_actions").insert({
        workspace_id: EMPRESA_A,
        actor_user_id: ADMIN_A_ONLY,
        action_type: "delete_board_element",
        payload: { whiteboard_id: board.id, expected_element_version: 1 }, // falta element_id
        summary: "payload malo",
        token_hash: hashToken(token),
        expires_at: new Date(Date.now() + 300_000).toISOString(),
      });
      expect(insertErr).toBeNull();

      const { data, error } = await resolvePendingAction(token, "confirm", ADMIN_A_ONLY, EMPRESA_A);
      expect(error).toBeNull(); // nunca una excepción de casting
      expect(data).toMatchObject({ ok: false, code: "internal_error" });

      const { data: row } = await db.from("assistant_pending_actions").select("status, result").eq("token_hash", hashToken(token)).single();
      expect((row as { status: string }).status).toBe("failed");
      expect(((row as { result: { code: string } }).result).code).toBe("invalid_payload");
    });
  });
});
