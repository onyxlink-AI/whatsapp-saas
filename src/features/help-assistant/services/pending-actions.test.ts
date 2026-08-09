// Fase 4B — pending-actions.ts: generación/hash del token, preparación
// (lista cerrada, payload mínimo validado con Zod) y resolución (delega
// TODO a la función SQL, nunca ejecuta nada por su cuenta desde Node).
//
// Revisión correctiva: reserveConfirmAttempt sustituye el par
// "SELECT count -> INSERT" por una única llamada RPC atómica
// (reserve_help_assistant_confirm_attempt), y resolveConfirmableAction
// reconcilia un reintento contra una fila ya resuelta (final_status)
// devuelto por la función SQL.

import { createHash } from "node:crypto";
import { describe, it, expect, vi, beforeEach } from "vitest";

let insertResult: { data: { id: string } | null; error: unknown } = { data: { id: "pending-1" }, error: null };
let rpcResult: { data: unknown; error: unknown } = { data: null, error: null };
const insertedRows: Record<string, unknown>[] = [];
const rpcCalls: { name: string; args: unknown }[] = [];

function insertChain(row: Record<string, unknown>, table: string) {
  insertedRows.push({ table, ...row });
  const node: Record<string, unknown> = {
    select: () => node,
    single: () => Promise.resolve(insertResult),
  };
  return node;
}

const fromSpy = vi.fn((table: string) => ({
  insert: (row: Record<string, unknown>) => insertChain(row, table),
}));

const rpcSpy = vi.fn((name: string, args: unknown) => {
  rpcCalls.push({ name, args });
  return Promise.resolve(rpcResult);
});

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => ({ from: fromSpy, rpc: rpcSpy })),
}));

const {
  prepareConfirmableAction,
  resolveConfirmableAction,
  reserveConfirmAttempt,
  createPendingConfirmationSlot,
  PENDING_ACTION_TTL_SECONDS,
} = await import("./pending-actions");

beforeEach(() => {
  vi.clearAllMocks();
  insertedRows.length = 0;
  rpcCalls.length = 0;
  insertResult = { data: { id: "pending-1" }, error: null };
  rpcResult = { data: null, error: null };
});

describe("prepareConfirmableAction", () => {
  it("generates a 32-byte token (64 hex chars), stores only its SHA-256 hash, and returns the inserted row's id", async () => {
    const prepared = await prepareConfirmableAction({
      workspaceId: "ws1",
      actorUserId: "user1",
      actionType: "cancel_agenda_item",
      payload: { agenda_task_id: "11111111-1111-4111-8111-111111111111" },
      summary: "Vas a cancelar «X»",
    });

    expect(prepared).not.toBeNull();
    expect(prepared!.token).toMatch(/^[0-9a-f]{64}$/);
    expect(prepared!.expiresInSeconds).toBe(PENDING_ACTION_TTL_SECONDS);
    expect(prepared!.pendingActionId).toBe("pending-1");

    expect(insertedRows).toHaveLength(1);
    const row = insertedRows[0];
    expect(row.table).toBe("assistant_pending_actions");
    const expectedHash = createHash("sha256").update(prepared!.token).digest("hex");
    expect(row.token_hash).toBe(expectedHash);
    // El token en claro NUNCA se guarda en la fila.
    expect(JSON.stringify(row)).not.toContain(prepared!.token);
  });

  it("rejects a payload that doesn't match the closed schema for its action_type, without inserting anything", async () => {
    const prepared = await prepareConfirmableAction({
      workspaceId: "ws1",
      actorUserId: "user1",
      actionType: "cancel_agenda_item",
      // @ts-expect-error -- deliberately wrong shape, must be rejected before any insert
      payload: { not_a_valid_field: "x" },
      summary: "x",
    });

    expect(prepared).toBeNull();
    expect(insertedRows).toHaveLength(0);
  });

  it("returns null (never throws, never a partial token) when the insert fails", async () => {
    insertResult = { data: null, error: { message: "connection reset" } };
    const prepared = await prepareConfirmableAction({
      workspaceId: "ws1",
      actorUserId: "user1",
      actionType: "cancel_agenda_item",
      payload: { agenda_task_id: "11111111-1111-4111-8111-111111111111" },
      summary: "x",
    });
    expect(prepared).toBeNull();
  });

  it("stores only the minimal payload (IDs), never arbitrary/large content", async () => {
    await prepareConfirmableAction({
      workspaceId: "ws1",
      actorUserId: "user1",
      actionType: "cancel_agenda_item",
      payload: { agenda_task_id: "11111111-1111-4111-8111-111111111111" },
      summary: "x",
    });
    expect(insertedRows[0].payload).toEqual({ agenda_task_id: "11111111-1111-4111-8111-111111111111" });
  });
});

describe("resolveConfirmableAction", () => {
  it("hashes the token and delegates entirely to resolve_assistant_pending_action — never sends the raw token as a separate mutation", async () => {
    rpcResult = { data: { ok: true, code: "executed", result: { agenda_task_id: "a1" }, pending_action_id: "pending-1" }, error: null };

    const result = await resolveConfirmableAction({
      workspaceId: "ws1",
      actorUserId: "user1",
      token: "raw-token-value",
      decision: "confirm",
    });

    expect(result).toEqual({ ok: true, code: "executed", result: { agenda_task_id: "a1" }, pendingActionId: "pending-1" });
    expect(rpcCalls).toHaveLength(1);
    expect(rpcCalls[0].name).toBe("resolve_assistant_pending_action");
    const args = rpcCalls[0].args as Record<string, unknown>;
    expect(args.p_token_hash).toBe(createHash("sha256").update("raw-token-value").digest("hex"));
    expect(args.p_decision).toBe("confirm");
    expect(args.p_actor_user_id).toBe("user1");
    expect(args.p_workspace_id).toBe("ws1");
    // Nunca se manda el token en claro como argumento.
    expect(JSON.stringify(args)).not.toContain("raw-token-value");
  });

  it("maps an RPC error to internal_error, never throws, never echoes the token", async () => {
    rpcResult = { data: null, error: { message: "connection reset" } };
    const result = await resolveConfirmableAction({ workspaceId: "ws1", actorUserId: "user1", token: "t", decision: "cancel" });
    expect(result).toEqual({ ok: false, code: "internal_error" });
  });

  describe("reconciliation — a retry that lands on an already-resolved row", () => {
    it("reconciles final_status='executed' as a fresh success, not a false error", async () => {
      rpcResult = { data: { ok: false, code: "already_resolved", final_status: "executed", pending_action_id: "pending-1" }, error: null };
      const result = await resolveConfirmableAction({ workspaceId: "ws1", actorUserId: "user1", token: "t", decision: "confirm" });
      expect(result).toEqual({ ok: true, code: "executed", pendingActionId: "pending-1", reconciled: true });
    });

    it("reconciles final_status='cancelled' as a fresh success", async () => {
      rpcResult = { data: { ok: false, code: "already_resolved", final_status: "cancelled", pending_action_id: "pending-1" }, error: null };
      const result = await resolveConfirmableAction({ workspaceId: "ws1", actorUserId: "user1", token: "t", decision: "cancel" });
      expect(result).toEqual({ ok: true, code: "cancelled", pendingActionId: "pending-1", reconciled: true });
    });

    it("final_status='expired' stays a real denial, never reconciled as success", async () => {
      rpcResult = { data: { ok: false, code: "already_resolved", final_status: "expired", pending_action_id: "pending-1" }, error: null };
      const result = await resolveConfirmableAction({ workspaceId: "ws1", actorUserId: "user1", token: "t", decision: "confirm" });
      expect(result).toEqual({ ok: false, code: "expired", pendingActionId: "pending-1", reconciled: true });
    });

    it("final_status='failed' falls back to a generic already_resolved denial", async () => {
      rpcResult = { data: { ok: false, code: "already_resolved", final_status: "failed", pending_action_id: "pending-1" }, error: null };
      const result = await resolveConfirmableAction({ workspaceId: "ws1", actorUserId: "user1", token: "t", decision: "confirm" });
      expect(result).toEqual({ ok: false, code: "already_resolved", pendingActionId: "pending-1" });
    });
  });
});

describe("createPendingConfirmationSlot — máximo una preparación confirmable por petición", () => {
  it("starts with remaining=1 and prepared=null", () => {
    expect(createPendingConfirmationSlot()).toEqual({ remaining: 1, prepared: null });
  });

  it("returns a fresh independent object on every call", () => {
    const a = createPendingConfirmationSlot();
    const b = createPendingConfirmationSlot();
    a.remaining = 0;
    expect(b.remaining).toBe(1);
  });
});

describe("reserveConfirmAttempt — reserva atómica, fail-closed", () => {
  it("allowed=true when the RPC reports room under the limit", async () => {
    rpcResult = { data: { allowed: true, used: 4, limit: 20 }, error: null };
    const result = await reserveConfirmAttempt({ workspaceId: "ws1", actorUserId: "user1" });
    expect(result).toEqual({ ok: true, allowed: true, used: 4, limit: 20 });
    expect(rpcCalls[0]).toEqual({
      name: "reserve_help_assistant_confirm_attempt",
      args: { p_workspace_id: "ws1", p_user_id: "user1" },
    });
  });

  it("ok=true but allowed=false when the RPC reports the window is exhausted — the check itself succeeded, it's just over the limit", async () => {
    rpcResult = { data: { allowed: false, used: 20, limit: 20 }, error: null };
    const result = await reserveConfirmAttempt({ workspaceId: "ws1", actorUserId: "user1" });
    expect(result).toEqual({ ok: true, allowed: false, used: 20, limit: 20 });
  });

  it("FAIL-CLOSED: ok=false, allowed=false on an RPC error — never fails open", async () => {
    rpcResult = { data: null, error: { message: "connection reset" } };
    const result = await reserveConfirmAttempt({ workspaceId: "ws1", actorUserId: "user1" });
    expect(result).toEqual({ ok: false, allowed: false });
  });
});
