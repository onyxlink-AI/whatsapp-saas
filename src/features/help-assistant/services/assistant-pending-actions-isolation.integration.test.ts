// Fase 4B — resolve_assistant_pending_action() con Postgres/REST reales,
// mismo patrón que product-package-isolation.integration.test.ts (JWTs
// reales para la comprobación de permisos, service_role para preparar/leer
// fixtures). Se salta (no falla) si el stack local no está arriba.

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

// EMPRESA_A: paquete "suite" (whatsapp_gestion/suite requerido por
// canUseAssistantActions). EMPRESA_B: paquete "gestion" — no cumple el
// paquete, útil para probar aislamiento con un admin que SOLO pertenece a A.
const EMPRESA_A = "1b807ae9-03a2-4cf5-84af-8b72a7078ad9";
const EMPRESA_B = "9003dc6d-dafa-48b3-be17-71e36e08272d";
const ADMIN_A_ONLY = "8a0684ce-05ee-4741-a26c-5131df1924ba"; // cliente@empresaa.local — admin de A únicamente
const AGENCY_ADMIN = "94ede212-a935-4259-a0e9-5a1547422477"; // admin de A y B

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
let db: SupabaseClient; // service_role — preparar fixtures y leer resultados, nunca para ejercitar la RPC como "el atacante"

const RUN_TAG = `pending-iso-${Date.now()}`;
const createdAgendaTaskIds: string[] = [];

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

async function createAgendaTaskFixture(workspaceId: string, title: string, opts?: { cancelledAt?: string }) {
  const { data, error } = await db
    .from("agenda_tasks")
    .insert({
      workspace_id: workspaceId,
      title,
      scheduled_date: "2026-09-01",
      created_by: workspaceId === EMPRESA_A ? ADMIN_A_ONLY : AGENCY_ADMIN,
      cancelled_at: opts?.cancelledAt ?? null,
    })
    .select("id")
    .single();
  expect(error).toBeNull();
  const id = data!.id as string;
  createdAgendaTaskIds.push(id);
  return id;
}

/** Inserta una fila `pending` directamente (nunca vía pending-actions.ts — esto prueba la función SQL de forma aislada) y devuelve el token en claro. */
async function insertPendingAction(params: {
  workspaceId: string;
  actorUserId: string;
  agendaTaskId: string;
  expiresInSeconds?: number;
}): Promise<string> {
  return insertPendingActionRaw({
    workspaceId: params.workspaceId,
    actorUserId: params.actorUserId,
    payload: { agenda_task_id: params.agendaTaskId },
    expiresInSeconds: params.expiresInSeconds,
  });
}

/**
 * Igual que insertPendingAction pero con un payload arbitrario — para las
 * pruebas de validación del payload dentro de la función SQL (que Zod en
 * Node nunca debería dejar pasar, pero la función es "la última frontera
 * transaccional" y debe rechazarlo igual si de algún modo llega corrupto).
 */
async function insertPendingActionRaw(params: {
  workspaceId: string;
  actorUserId: string;
  payload: unknown;
  expiresInSeconds?: number;
}): Promise<string> {
  const token = randomBytes(32).toString("hex");
  const { error } = await db.from("assistant_pending_actions").insert({
    workspace_id: params.workspaceId,
    actor_user_id: params.actorUserId,
    action_type: "cancel_agenda_item",
    payload: params.payload,
    summary: `${RUN_TAG} — cancelación de prueba`,
    token_hash: hashToken(token),
    expires_at: new Date(Date.now() + (params.expiresInSeconds ?? 300) * 1000).toISOString(),
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
  return {
    data: data as { ok: boolean; code: string; result?: Record<string, unknown>; pending_action_id?: string; final_status?: string } | null,
    error,
  };
}

describe("resolve_assistant_pending_action — Postgres/REST reales", () => {
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
    // El kill switch está apagado por defecto — lo activa esta suite y lo
    // restaura en afterAll, igual que hace product-package-isolation con el
    // paquete.
    await db.from("workspaces").update({ help_assistant_actions_enabled: true, product_package: "suite" }).eq("id", EMPRESA_A);
  }, POLL_TIMEOUT_MS + 15_000);

  afterEach(async () => {
    if (!reachable) return;
    for (const id of createdAgendaTaskIds.splice(0)) {
      await db.from("agenda_tasks").delete().eq("id", id);
    }
    // Restaura membership/kill switch a un estado sano tras las pruebas que los tocan.
    await db.from("memberships").update({ is_active: true }).eq("workspace_id", EMPRESA_A).eq("user_id", ADMIN_A_ONLY);
    await db.from("workspaces").update({ help_assistant_actions_enabled: true, product_package: "suite" }).eq("id", EMPRESA_A);
  });

  afterAll(async () => {
    if (!reachable) return;
    await db.from("workspaces").update({ help_assistant_actions_enabled: false }).eq("id", EMPRESA_A);
  });

  describe("Seguridad: solo service_role puede ejecutarla", () => {
    it("anon no puede ejecutarla directamente vía REST", async (ctx) => {
      if (!reachable) return ctx.skip();
      const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/resolve_assistant_pending_action`, {
        method: "POST",
        headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ p_token_hash: "a".repeat(64), p_decision: "confirm", p_actor_user_id: ADMIN_A_ONLY, p_workspace_id: EMPRESA_A }),
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

      const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/resolve_assistant_pending_action`, {
        method: "POST",
        headers: { apikey: ANON_KEY, Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ p_token_hash: "a".repeat(64), p_decision: "confirm", p_actor_user_id: ADMIN_A_ONLY, p_workspace_id: EMPRESA_A }),
      });
      const body = await r.json();
      expect(r.status).toBe(403);
      expect(body.code).toBe("42501");
      await freshClient.auth.signOut().catch(() => {});
    });
  });

  it("preparar una acción confirmable nunca modifica agenda_tasks — solo tras confirmar", async (ctx) => {
    if (!reachable) return ctx.skip();
    const taskId = await createAgendaTaskFixture(EMPRESA_A, `${RUN_TAG}-prep`);
    await insertPendingAction({ workspaceId: EMPRESA_A, actorUserId: ADMIN_A_ONLY, agendaTaskId: taskId });

    const { data: task } = await db.from("agenda_tasks").select("cancelled_at").eq("id", taskId).single();
    expect((task as { cancelled_at: string | null }).cancelled_at).toBeNull();
  });

  it("confirm ejecuta exactamente una vez: cancela la tarea y marca la fila 'executed'", async (ctx) => {
    if (!reachable) return ctx.skip();
    const taskId = await createAgendaTaskFixture(EMPRESA_A, `${RUN_TAG}-confirm`);
    const token = await insertPendingAction({ workspaceId: EMPRESA_A, actorUserId: ADMIN_A_ONLY, agendaTaskId: taskId });

    const { data, error } = await resolvePendingAction(token, "confirm", ADMIN_A_ONLY, EMPRESA_A);
    expect(error).toBeNull();
    expect(data).toMatchObject({ ok: true, code: "executed" });

    const { data: task } = await db.from("agenda_tasks").select("cancelled_at, cancelled_by").eq("id", taskId).single();
    expect((task as { cancelled_at: string | null }).cancelled_at).not.toBeNull();
    expect((task as { cancelled_by: string | null }).cancelled_by).toBe(ADMIN_A_ONLY);
  });

  it("cancel descarta la preparación SIN tocar agenda_tasks", async (ctx) => {
    if (!reachable) return ctx.skip();
    const taskId = await createAgendaTaskFixture(EMPRESA_A, `${RUN_TAG}-cancel-decision`);
    const token = await insertPendingAction({ workspaceId: EMPRESA_A, actorUserId: ADMIN_A_ONLY, agendaTaskId: taskId });

    const { data } = await resolvePendingAction(token, "cancel", ADMIN_A_ONLY, EMPRESA_A);
    expect(data).toMatchObject({ ok: true, code: "cancelled" });

    const { data: task } = await db.from("agenda_tasks").select("cancelled_at").eq("id", taskId).single();
    expect((task as { cancelled_at: string | null }).cancelled_at).toBeNull();
  });

  it("expirado: rechaza y nunca toca la entidad", async (ctx) => {
    if (!reachable) return ctx.skip();
    const taskId = await createAgendaTaskFixture(EMPRESA_A, `${RUN_TAG}-expired`);
    const token = await insertPendingAction({ workspaceId: EMPRESA_A, actorUserId: ADMIN_A_ONLY, agendaTaskId: taskId, expiresInSeconds: -1 });

    const { data } = await resolvePendingAction(token, "confirm", ADMIN_A_ONLY, EMPRESA_A);
    expect(data).toMatchObject({ ok: false, code: "expired" });

    const { data: task } = await db.from("agenda_tasks").select("cancelled_at").eq("id", taskId).single();
    expect((task as { cancelled_at: string | null }).cancelled_at).toBeNull();
  });

  it("ya resuelto: confirmar dos veces el mismo token la segunda vez da already_resolved con final_status='executed' — lo que necesita Node para reconciliar un reintento como éxito", async (ctx) => {
    if (!reachable) return ctx.skip();
    const taskId = await createAgendaTaskFixture(EMPRESA_A, `${RUN_TAG}-double`);
    const token = await insertPendingAction({ workspaceId: EMPRESA_A, actorUserId: ADMIN_A_ONLY, agendaTaskId: taskId });

    const first = await resolvePendingAction(token, "confirm", ADMIN_A_ONLY, EMPRESA_A);
    expect(first.data).toMatchObject({ ok: true, code: "executed" });
    const pendingActionId = (first.data as { pending_action_id: string }).pending_action_id;
    expect(pendingActionId).toBeTruthy();

    // Simula un reintento (la respuesta de la primera llamada se perdió) —
    // MISMA decisión 'confirm'.
    const second = await resolvePendingAction(token, "confirm", ADMIN_A_ONLY, EMPRESA_A);
    expect(second.data).toMatchObject({ ok: false, code: "already_resolved", final_status: "executed", pending_action_id: pendingActionId });

    // Solo se canceló/ejecutó UNA vez — la tarea sigue teniendo exactamente un cancelled_by.
    const { data: task } = await db.from("agenda_tasks").select("cancelled_by").eq("id", taskId).single();
    expect((task as { cancelled_by: string }).cancelled_by).toBe(ADMIN_A_ONLY);
  });

  it("reintentar tras una CANCELACIÓN ya resuelta también devuelve final_status='cancelled' — nunca se confunde con 'executed'", async (ctx) => {
    if (!reachable) return ctx.skip();
    const taskId = await createAgendaTaskFixture(EMPRESA_A, `${RUN_TAG}-cancel-then-retry`);
    const token = await insertPendingAction({ workspaceId: EMPRESA_A, actorUserId: ADMIN_A_ONLY, agendaTaskId: taskId });

    const first = await resolvePendingAction(token, "cancel", ADMIN_A_ONLY, EMPRESA_A);
    expect(first.data).toMatchObject({ ok: true, code: "cancelled" });

    const retry = await resolvePendingAction(token, "cancel", ADMIN_A_ONLY, EMPRESA_A);
    expect(retry.data).toMatchObject({ ok: false, code: "already_resolved", final_status: "cancelled" });

    // Nunca se ejecutó de verdad — la tarea sigue sin cancelar.
    const { data: task } = await db.from("agenda_tasks").select("cancelled_at").eq("id", taskId).single();
    expect((task as { cancelled_at: string | null }).cancelled_at).toBeNull();
  });

  it("doble clic concurrente: dos confirmaciones simultáneas del mismo token — exactamente una ejecuta", async (ctx) => {
    if (!reachable) return ctx.skip();
    const taskId = await createAgendaTaskFixture(EMPRESA_A, `${RUN_TAG}-concurrent`);
    const token = await insertPendingAction({ workspaceId: EMPRESA_A, actorUserId: ADMIN_A_ONLY, agendaTaskId: taskId });

    const [a, b] = await Promise.all([
      resolvePendingAction(token, "confirm", ADMIN_A_ONLY, EMPRESA_A),
      resolvePendingAction(token, "confirm", ADMIN_A_ONLY, EMPRESA_A),
    ]);

    const codes = [a.data?.code, b.data?.code].sort();
    expect(codes).toEqual(["already_resolved", "executed"]);
  });

  it("repetir el mismo token tras cancelarlo también da already_resolved, nunca vuelve a intentar ejecutar", async (ctx) => {
    if (!reachable) return ctx.skip();
    const taskId = await createAgendaTaskFixture(EMPRESA_A, `${RUN_TAG}-repeat-cancel`);
    const token = await insertPendingAction({ workspaceId: EMPRESA_A, actorUserId: ADMIN_A_ONLY, agendaTaskId: taskId });

    await resolvePendingAction(token, "cancel", ADMIN_A_ONLY, EMPRESA_A);
    const second = await resolvePendingAction(token, "confirm", ADMIN_A_ONLY, EMPRESA_A);
    expect(second.data).toMatchObject({ ok: false, code: "already_resolved" });
  });

  it("token de A confirmado desde B responde invalid_token — nunca revela que el token existe en otra empresa", async (ctx) => {
    if (!reachable) return ctx.skip();
    const taskId = await createAgendaTaskFixture(EMPRESA_A, `${RUN_TAG}-cross-ws`);
    const token = await insertPendingAction({ workspaceId: EMPRESA_A, actorUserId: ADMIN_A_ONLY, agendaTaskId: taskId });

    const { data } = await resolvePendingAction(token, "confirm", AGENCY_ADMIN, EMPRESA_B);
    expect(data).toMatchObject({ ok: false, code: "invalid_token" });

    const { data: task } = await db.from("agenda_tasks").select("cancelled_at").eq("id", taskId).single();
    expect((task as { cancelled_at: string | null }).cancelled_at).toBeNull();
  });

  it("otro usuario del MISMO workspace (no quien preparó la acción) también responde invalid_token", async (ctx) => {
    if (!reachable) return ctx.skip();
    const taskId = await createAgendaTaskFixture(EMPRESA_A, `${RUN_TAG}-other-actor`);
    const token = await insertPendingAction({ workspaceId: EMPRESA_A, actorUserId: ADMIN_A_ONLY, agendaTaskId: taskId });

    // AGENCY_ADMIN también es miembro activo de A, pero no preparó esta acción.
    const { data } = await resolvePendingAction(token, "confirm", AGENCY_ADMIN, EMPRESA_A);
    expect(data).toMatchObject({ ok: false, code: "invalid_token" });
  });

  it("token inexistente responde el mismo código invalid_token que uno ajeno — indistinguible desde fuera", async (ctx) => {
    if (!reachable) return ctx.skip();
    const { data } = await resolvePendingAction(randomBytes(32).toString("hex"), "confirm", ADMIN_A_ONLY, EMPRESA_A);
    expect(data).toMatchObject({ ok: false, code: "invalid_token" });
  });

  it("membership desactivada entre preparar y confirmar: permission_revoked, nunca ejecuta", async (ctx) => {
    if (!reachable) return ctx.skip();
    const taskId = await createAgendaTaskFixture(EMPRESA_A, `${RUN_TAG}-membership-off`);
    const token = await insertPendingAction({ workspaceId: EMPRESA_A, actorUserId: ADMIN_A_ONLY, agendaTaskId: taskId });

    await db.from("memberships").update({ is_active: false }).eq("workspace_id", EMPRESA_A).eq("user_id", ADMIN_A_ONLY);

    const { data } = await resolvePendingAction(token, "confirm", ADMIN_A_ONLY, EMPRESA_A);
    expect(data).toMatchObject({ ok: false, code: "permission_revoked" });

    const { data: task } = await db.from("agenda_tasks").select("cancelled_at").eq("id", taskId).single();
    expect((task as { cancelled_at: string | null }).cancelled_at).toBeNull();
  });

  it("downgrade de paquete entre preparar y confirmar: permission_revoked, nunca ejecuta", async (ctx) => {
    if (!reachable) return ctx.skip();
    const taskId = await createAgendaTaskFixture(EMPRESA_A, `${RUN_TAG}-downgrade`);
    const token = await insertPendingAction({ workspaceId: EMPRESA_A, actorUserId: ADMIN_A_ONLY, agendaTaskId: taskId });

    await db.from("workspaces").update({ product_package: "gestion" }).eq("id", EMPRESA_A);

    const { data } = await resolvePendingAction(token, "confirm", ADMIN_A_ONLY, EMPRESA_A);
    expect(data).toMatchObject({ ok: false, code: "permission_revoked" });
  });

  it("kill switch apagado entre preparar y confirmar: permission_revoked, nunca ejecuta", async (ctx) => {
    if (!reachable) return ctx.skip();
    const taskId = await createAgendaTaskFixture(EMPRESA_A, `${RUN_TAG}-kill-switch`);
    const token = await insertPendingAction({ workspaceId: EMPRESA_A, actorUserId: ADMIN_A_ONLY, agendaTaskId: taskId });

    await db.from("workspaces").update({ help_assistant_actions_enabled: false }).eq("id", EMPRESA_A);

    const { data } = await resolvePendingAction(token, "confirm", ADMIN_A_ONLY, EMPRESA_A);
    expect(data).toMatchObject({ ok: false, code: "permission_revoked" });
  });

  it("entidad no encontrada (borrada entre preparar y confirmar): entity_not_found", async (ctx) => {
    if (!reachable) return ctx.skip();
    const taskId = await createAgendaTaskFixture(EMPRESA_A, `${RUN_TAG}-entity-gone`);
    const token = await insertPendingAction({ workspaceId: EMPRESA_A, actorUserId: ADMIN_A_ONLY, agendaTaskId: taskId });

    await db.from("agenda_tasks").delete().eq("id", taskId);
    createdAgendaTaskIds.splice(createdAgendaTaskIds.indexOf(taskId), 1);

    const { data } = await resolvePendingAction(token, "confirm", ADMIN_A_ONLY, EMPRESA_A);
    expect(data).toMatchObject({ ok: false, code: "entity_not_found" });
  });

  it("entidad ya cancelada por otra vía antes de confirmar: entity_already_changed", async (ctx) => {
    if (!reachable) return ctx.skip();
    const taskId = await createAgendaTaskFixture(EMPRESA_A, `${RUN_TAG}-already-changed`);
    const token = await insertPendingAction({ workspaceId: EMPRESA_A, actorUserId: ADMIN_A_ONLY, agendaTaskId: taskId });

    await db.from("agenda_tasks").update({ cancelled_at: new Date().toISOString(), cancelled_by: ADMIN_A_ONLY }).eq("id", taskId);

    const { data } = await resolvePendingAction(token, "confirm", ADMIN_A_ONLY, EMPRESA_A);
    expect(data).toMatchObject({ ok: false, code: "entity_already_changed" });
  });

  it("el token original nunca queda guardado en texto plano en la tabla — solo su hash", async (ctx) => {
    if (!reachable) return ctx.skip();
    const taskId = await createAgendaTaskFixture(EMPRESA_A, `${RUN_TAG}-hash-only`);
    const token = await insertPendingAction({ workspaceId: EMPRESA_A, actorUserId: ADMIN_A_ONLY, agendaTaskId: taskId });

    const { data: row } = await db
      .from("assistant_pending_actions")
      .select("token_hash")
      .eq("token_hash", hashToken(token))
      .single();

    expect((row as { token_hash: string }).token_hash).toBe(hashToken(token));
    expect((row as { token_hash: string }).token_hash).not.toBe(token);
    expect(JSON.stringify(row)).not.toContain(token);
  });

  it("pending_action_id devuelto es EXACTAMENTE el id de la fila — el identificador común de auditoría prepared/executed/cancelled", async (ctx) => {
    if (!reachable) return ctx.skip();
    const taskId = await createAgendaTaskFixture(EMPRESA_A, `${RUN_TAG}-correlation`);
    const token = await insertPendingAction({ workspaceId: EMPRESA_A, actorUserId: ADMIN_A_ONLY, agendaTaskId: taskId });

    const { data: row } = await db.from("assistant_pending_actions").select("id").eq("token_hash", hashToken(token)).single();
    const realId = (row as { id: string }).id;

    const { data } = await resolvePendingAction(token, "confirm", ADMIN_A_ONLY, EMPRESA_A);
    expect((data as { pending_action_id: string }).pending_action_id).toBe(realId);
  });

  describe("validación del payload dentro de la función — última frontera transaccional", () => {
    const BAD_PAYLOADS: Array<{ label: string; payload: unknown }> = [
      { label: "no es un objeto (array)", payload: ["not-an-object"] },
      { label: "objeto vacío", payload: {} },
      { label: "clave extra además de agenda_task_id", payload: { agenda_task_id: "11111111-1111-4111-8111-111111111111", extra: "x" } },
      { label: "clave distinta a agenda_task_id", payload: { other_field: "11111111-1111-4111-8111-111111111111" } },
      { label: "valor no-string (número)", payload: { agenda_task_id: 12345 } },
      { label: "valor string pero no es un UUID válido", payload: { agenda_task_id: "not-a-uuid" } },
      { label: "UUID con un carácter de más", payload: { agenda_task_id: "11111111-1111-4111-8111-111111111111x" } },
    ];

    for (const { label, payload } of BAD_PAYLOADS) {
      it(`payload inválido (${label}): nunca lanza excepción, marca la fila 'failed' con código interno, nunca queda 'pending'`, async (ctx) => {
        if (!reachable) return ctx.skip();
        const token = await insertPendingActionRaw({ workspaceId: EMPRESA_A, actorUserId: ADMIN_A_ONLY, payload });

        const { data, error } = await resolvePendingAction(token, "confirm", ADMIN_A_ONLY, EMPRESA_A);

        // Nunca una excepción de casting — la llamada RPC siempre vuelve
        // con error=null y un resultado estructurado.
        expect(error).toBeNull();
        expect(data).toMatchObject({ ok: false, code: "internal_error" });

        const { data: row } = await db.from("assistant_pending_actions").select("status, result").eq("token_hash", hashToken(token)).single();
        expect((row as { status: string }).status).toBe("failed");
        expect((row as { status: string }).status).not.toBe("pending");
        expect((row as { result: { code: string } }).result?.code).toBe("invalid_payload");
      });
    }
  });
});

describe("reserve_help_assistant_confirm_attempt — Postgres/REST reales", () => {
  const rateLimitTag = `rate-${Date.now()}`;

  describe("Seguridad: solo service_role puede ejecutarla", () => {
    it("anon no puede ejecutarla directamente vía REST", async (ctx) => {
      if (!reachable) return ctx.skip();
      const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/reserve_help_assistant_confirm_attempt`, {
        method: "POST",
        headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ p_workspace_id: EMPRESA_A, p_user_id: ADMIN_A_ONLY }),
      });
      const body = await r.json();
      expect(r.status).toBe(401);
      expect(body.code).toBe("42501");
    });

    it("un usuario authenticated normal tampoco puede ejecutarla", async (ctx) => {
      if (!reachable) return ctx.skip();
      const freshClient = createClient(SUPABASE_URL, ANON_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
      const { data: signInData, error: signInErr } = await freshClient.auth.signInWithPassword({
        email: "cliente@empresaa.local",
        password: "TestLocal123!",
      });
      expect(signInErr).toBeNull();
      const jwt = signInData.session?.access_token;

      const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/reserve_help_assistant_confirm_attempt`, {
        method: "POST",
        headers: { apikey: ANON_KEY, Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ p_workspace_id: EMPRESA_A, p_user_id: ADMIN_A_ONLY }),
      });
      const body = await r.json();
      expect(r.status).toBe(403);
      expect(body.code).toBe("42501");
      await freshClient.auth.signOut().catch(() => {});
    });
  });

  it("cuenta Y reserva en una sola llamada — used sube en cada intento permitido", async (ctx) => {
    if (!reachable) return ctx.skip();
    const userId = `00000000-0000-4000-8000-${rateLimitTag.slice(-12).padStart(12, "0")}`;
    // Usuario sintético — no necesita existir en `users` para esta prueba
    // porque reserve_help_assistant_confirm_attempt no hace ningún JOIN
    // contra esa tabla, solo cuenta/inserta en `events`.
    const { data: first } = await db.rpc("reserve_help_assistant_confirm_attempt", {
      p_workspace_id: EMPRESA_A,
      p_user_id: userId,
      p_window_seconds: 300,
      p_max_per_window: 5,
    });
    expect(first).toMatchObject({ allowed: true, used: 1, limit: 5 });

    const { data: second } = await db.rpc("reserve_help_assistant_confirm_attempt", {
      p_workspace_id: EMPRESA_A,
      p_user_id: userId,
      p_window_seconds: 300,
      p_max_per_window: 5,
    });
    expect(second).toMatchObject({ allowed: true, used: 2, limit: 5 });
  });

  it("30 intentos concurrentes con un límite de 20 -> exactamente 20 reservados (allowed:true), el resto bloqueado", async (ctx) => {
    if (!reachable) return ctx.skip();
    const userId = `00000000-0000-4000-9000-${Date.now().toString().slice(-12).padStart(12, "0")}`;

    const calls = Array.from({ length: 30 }, () =>
      db.rpc("reserve_help_assistant_confirm_attempt", {
        p_workspace_id: EMPRESA_A,
        p_user_id: userId,
        p_window_seconds: 300,
        p_max_per_window: 20,
      }),
    );
    const results = await Promise.all(calls);

    const allowedCount = results.filter((r) => (r.data as { allowed: boolean } | null)?.allowed === true).length;
    const blockedCount = results.filter((r) => (r.data as { allowed: boolean } | null)?.allowed === false).length;

    expect(allowedCount).toBe(20);
    expect(blockedCount).toBe(10);
    // Nadie recibió un error — el advisory lock serializa, nunca falla.
    expect(results.every((r) => r.error === null)).toBe(true);
  });

  it("workspaces/usuarios distintos tienen contadores independientes — el límite es por (workspace, actor)", async (ctx) => {
    if (!reachable) return ctx.skip();
    const userA = `00000000-0000-4000-a000-${Date.now().toString().slice(-12).padStart(12, "0")}`;
    const userB = `00000000-0000-4000-b000-${Date.now().toString().slice(-12).padStart(12, "0")}`;

    for (let i = 0; i < 20; i++) {
      await db.rpc("reserve_help_assistant_confirm_attempt", { p_workspace_id: EMPRESA_A, p_user_id: userA, p_window_seconds: 300, p_max_per_window: 20 });
    }
    const { data: exhausted } = await db.rpc("reserve_help_assistant_confirm_attempt", {
      p_workspace_id: EMPRESA_A,
      p_user_id: userA,
      p_window_seconds: 300,
      p_max_per_window: 20,
    });
    expect(exhausted).toMatchObject({ allowed: false });

    // userB en el mismo workspace, sin ningún intento previo, empieza limpio.
    const { data: fresh } = await db.rpc("reserve_help_assistant_confirm_attempt", {
      p_workspace_id: EMPRESA_A,
      p_user_id: userB,
      p_window_seconds: 300,
      p_max_per_window: 20,
    });
    expect(fresh).toMatchObject({ allowed: true, used: 1 });
  });
});
