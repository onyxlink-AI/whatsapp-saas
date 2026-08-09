// Fase 4B — POST .../help-assistant/confirm: nunca pasa por el LLM, valida
// membership igual que cualquier otra ruta, reserva el intento de forma
// atómica y fail-closed, y nunca deja escapar el token (ni en logs ni en
// el cuerpo de error) más allá de lo que el propio cliente ya conocía.

import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const getUser = vi.fn();
let membershipData: { role?: string } | null = { role: "admin" };

function chainable(resolve: () => unknown) {
  const obj: Record<string, unknown> = {};
  obj.select = () => obj;
  obj.eq = () => obj;
  obj.maybeSingle = async () => resolve();
  return obj;
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser },
    from: () => chainable(() => ({ data: membershipData, error: null })),
  })),
}));

const resolveConfirmableAction = vi.fn();
const reserveConfirmAttempt = vi.fn();
vi.mock("@/features/help-assistant/services/pending-actions", () => ({
  resolveConfirmableAction: (...args: unknown[]) => resolveConfirmableAction(...args),
  reserveConfirmAttempt: (...args: unknown[]) => reserveConfirmAttempt(...args),
}));

const logAudit = vi.fn();
vi.mock("@/features/audit/services/audit-log", () => ({ logAudit: (...args: unknown[]) => logAudit(...args) }));

const { POST } = await import("./route");

// Formato exacto que genera prepareConfirmableAction: 32 bytes -> 64 hex.
const VALID_TOKEN = "a".repeat(64);

function params(workspaceId: string) {
  return { params: Promise.resolve({ id: workspaceId }) };
}

function req(body: unknown) {
  return new NextRequest("http://localhost/api/workspace/ws1/help-assistant/confirm", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  membershipData = { role: "admin" };
  getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
  reserveConfirmAttempt.mockResolvedValue({ ok: true, allowed: true, used: 1, limit: 20 });
});

describe("POST .../help-assistant/confirm", () => {
  it("sin sesión -> 401, nunca llega a resolveConfirmableAction", async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    const res = await POST(req({ token: VALID_TOKEN, decision: "confirm" }), params("ws1"));
    expect(res.status).toBe(401);
    expect(resolveConfirmableAction).not.toHaveBeenCalled();
  });

  it("no miembro del workspace -> 403, nunca llega a resolveConfirmableAction", async () => {
    membershipData = null;
    const res = await POST(req({ token: VALID_TOKEN, decision: "confirm" }), params("ws1"));
    expect(res.status).toBe(403);
    expect(resolveConfirmableAction).not.toHaveBeenCalled();
  });

  it("body inválido (decision fuera del enum) -> 400", async () => {
    const res = await POST(req({ token: VALID_TOKEN, decision: "delete" }), params("ws1"));
    expect(res.status).toBe(400);
    expect(resolveConfirmableAction).not.toHaveBeenCalled();
  });

  describe("formato del token", () => {
    const BAD_TOKENS = [
      "too-short",
      "g".repeat(64), // 'g' no es hex
      "A".repeat(64), // mayúsculas — el formato exige minúsculas
      "a".repeat(63), // 63 en vez de 64
      "a".repeat(65), // 65 en vez de 64
      `${"a".repeat(64)}\n`, // basura tras el token válido
    ];

    for (const bad of BAD_TOKENS) {
      it(`rechaza "${bad.slice(0, 20)}..." (formato incorrecto) con 400, antes de tocar la reserva o la BD`, async () => {
        const res = await POST(req({ token: bad, decision: "confirm" }), params("ws1"));
        expect(res.status).toBe(400);
        expect(reserveConfirmAttempt).not.toHaveBeenCalled();
        expect(resolveConfirmableAction).not.toHaveBeenCalled();
      });
    }

    it("acepta el formato exacto de 64 hex en minúsculas", async () => {
      resolveConfirmableAction.mockResolvedValue({ ok: true, code: "executed", result: {}, pendingActionId: "p1" });
      const res = await POST(req({ token: VALID_TOKEN, decision: "confirm" }), params("ws1"));
      expect(res.status).toBe(200);
    });
  });

  it("solo POST — el objeto de ruta no exporta GET/PUT/DELETE", async () => {
    const routeModule: Record<string, unknown> = await import("./route");
    expect(routeModule.GET).toBeUndefined();
    expect(routeModule.PUT).toBeUndefined();
    expect(routeModule.DELETE).toBeUndefined();
  });

  describe("reserva de intentos — atómica y fail-closed", () => {
    it("límite excedido (ok=true, allowed=false) -> 429, nunca llega a resolveConfirmableAction", async () => {
      reserveConfirmAttempt.mockResolvedValue({ ok: true, allowed: false, used: 20, limit: 20 });
      const res = await POST(req({ token: VALID_TOKEN, decision: "confirm" }), params("ws1"));
      expect(res.status).toBe(429);
      expect(resolveConfirmableAction).not.toHaveBeenCalled();
    });

    it("fallo de la propia reserva (ok=false) -> 503 fail-closed, nunca llega a resolveConfirmableAction", async () => {
      reserveConfirmAttempt.mockResolvedValue({ ok: false, allowed: false });
      const res = await POST(req({ token: VALID_TOKEN, decision: "confirm" }), params("ws1"));
      expect(res.status).toBe(503);
      expect(resolveConfirmableAction).not.toHaveBeenCalled();
    });
  });

  it("confirmación exitosa -> 200, code executed, audita help_assistant.action_executed con pendingActionId como targetId, Cache-Control no-store", async () => {
    resolveConfirmableAction.mockResolvedValue({ ok: true, code: "executed", result: { agenda_task_id: "a1" }, pendingActionId: "pending-1" });
    const res = await POST(req({ token: VALID_TOKEN, decision: "confirm" }), params("ws1"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ ok: true, code: "executed" });
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(resolveConfirmableAction).toHaveBeenCalledWith({
      workspaceId: "ws1",
      actorUserId: "user-1",
      token: VALID_TOKEN,
      decision: "confirm",
    });
    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "help_assistant.action_executed",
        targetType: "assistant_pending_action",
        targetId: "pending-1",
        metadata: { agenda_task_id: "a1" },
      }),
    );
  });

  it("Fase 4C: confirmación de un delete_board_element pasa su resultado (whiteboard_id/element_id) tal cual como metadata, genérico para cualquier action_type futuro", async () => {
    resolveConfirmableAction.mockResolvedValue({
      ok: true,
      code: "executed",
      result: { whiteboard_id: "wb-1", element_id: "el-1" },
      pendingActionId: "pending-3",
    });
    const res = await POST(req({ token: VALID_TOKEN, decision: "confirm" }), params("ws1"));
    const body = await res.json();

    expect(body).toEqual({ ok: true, code: "executed" });
    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "help_assistant.action_executed", targetId: "pending-3", metadata: { whiteboard_id: "wb-1", element_id: "el-1" } }),
    );
  });

  it("cancelación exitosa -> 200, code cancelled, audita help_assistant.action_cancelled con pendingActionId como targetId", async () => {
    resolveConfirmableAction.mockResolvedValue({ ok: true, code: "cancelled", pendingActionId: "pending-2" });
    const res = await POST(req({ token: VALID_TOKEN, decision: "cancel" }), params("ws1"));
    const body = await res.json();

    expect(body).toEqual({ ok: true, code: "cancelled" });
    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "help_assistant.action_cancelled", targetType: "assistant_pending_action", targetId: "pending-2" }),
    );
  });

  it("reconciled=true (reintento tras perder la respuesta) nunca vuelve a auditar — nada nuevo ocurrió", async () => {
    resolveConfirmableAction.mockResolvedValue({ ok: true, code: "executed", pendingActionId: "pending-1", reconciled: true });
    const res = await POST(req({ token: VALID_TOKEN, decision: "confirm" }), params("ws1"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ ok: true, code: "executed" });
    expect(logAudit).not.toHaveBeenCalled();
  });

  it("pendingActionId nunca se incluye en la respuesta al navegador — no aporta nada a la interfaz", async () => {
    resolveConfirmableAction.mockResolvedValue({ ok: true, code: "executed", result: {}, pendingActionId: "pending-1" });
    const res = await POST(req({ token: VALID_TOKEN, decision: "confirm" }), params("ws1"));
    const text = await res.text();
    expect(text).not.toContain("pending-1");
    expect(text).not.toContain("pendingActionId");
  });

  const DENIAL_CASES: Array<{ code: string; status: number }> = [
    { code: "invalid_token", status: 404 },
    { code: "already_resolved", status: 409 },
    { code: "expired", status: 410 },
    { code: "permission_revoked", status: 403 },
    { code: "entity_not_found", status: 404 },
    { code: "entity_already_changed", status: 409 },
    { code: "internal_error", status: 500 },
  ];

  for (const { code, status } of DENIAL_CASES) {
    it(`code ${code} -> ${status}, nunca audita como éxito`, async () => {
      resolveConfirmableAction.mockResolvedValue({ ok: false, code, pendingActionId: "pending-1" });
      const res = await POST(req({ token: VALID_TOKEN, decision: "confirm" }), params("ws1"));
      const body = await res.json();

      expect(res.status).toBe(status);
      expect(body.code).toBe(code);
      expect(logAudit).not.toHaveBeenCalled();
    });
  }

  it("nunca incluye el token en el cuerpo de una respuesta de error", async () => {
    resolveConfirmableAction.mockResolvedValue({ ok: false, code: "invalid_token" });
    const res = await POST(req({ token: VALID_TOKEN, decision: "confirm" }), params("ws1"));
    const text = await res.text();
    expect(text).not.toContain(VALID_TOKEN);
  });
});
