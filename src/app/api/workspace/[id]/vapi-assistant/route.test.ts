// Auth/isolation/status regression tests for the Voice (Vapi) assistant
// link. GET is member-readable (any real member can see whether Voice is
// configured for their own workspace); PATCH is superadmin-only (paid
// add-on, same tier as other Onyxlink-gated toggles). The status field must
// always come from the real verification service, never be fabricated here.

import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const getUser = vi.fn();
let membershipData: { role?: string } | null = { role: "admin" };
let isSuperAdminData: { is_super_admin?: boolean } | null = { is_super_admin: true };

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
    from: (table: string) => {
      if (table === "users") return chainable(() => ({ data: isSuperAdminData, error: null }));
      return chainable(() => ({ data: membershipData, error: null }));
    },
  })),
}));

let workspaceRow: { vapi_assistant_id: string | null } = { vapi_assistant_id: null };
const updateSpy = vi.fn();
let updateError: { code?: string; message: string } | null = null;

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => ({
    from: () => {
      const builder: Record<string, unknown> = {
        select: () => builder,
        update: (...args: unknown[]) => {
          updateSpy(...args);
          return builder;
        },
        eq: () => builder,
        single: async () => ({ data: workspaceRow, error: null }),
        then: (resolve: (v: unknown) => unknown) => resolve({ error: updateError }),
      };
      return builder;
    },
  })),
}));

const getVapiConnectionStatus = vi.fn();
vi.mock("@/features/voice-agent/services/vapi-verification", () => ({ getVapiConnectionStatus }));

const logAudit = vi.fn();
vi.mock("@/features/audit/services/audit-log", () => ({ logAudit }));

const { GET, PATCH } = await import("./route");

function params(workspaceId: string) {
  return { params: Promise.resolve({ id: workspaceId }) };
}

beforeEach(() => {
  vi.clearAllMocks();
  membershipData = { role: "admin" };
  isSuperAdminData = { is_super_admin: true };
  workspaceRow = { vapi_assistant_id: null };
  updateError = null;
  getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
  getVapiConnectionStatus.mockResolvedValue({ status: "not_configured", detail: null });
});

describe("GET .../vapi-assistant", () => {
  it("sin sesión -> 401", async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    const req = new NextRequest("http://localhost/x");
    const res = await GET(req, params("empresa-a"));
    expect(res.status).toBe(401);
  });

  it("sin membresía en ESTE workspace -> 403 (aislamiento Empresa A/B)", async () => {
    membershipData = null; // simulates: member of A only, requesting B
    const req = new NextRequest("http://localhost/x");
    const res = await GET(req, params("empresa-b"));
    expect(res.status).toBe(403);
  });

  it("miembro real -> 200 con assistantId y status derivados del servicio real, nunca inventados aquí", async () => {
    workspaceRow = { vapi_assistant_id: "asst_123" };
    getVapiConnectionStatus.mockResolvedValue({ status: "configured", detail: null });
    const req = new NextRequest("http://localhost/x");
    const res = await GET(req, params("empresa-a"));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json).toEqual({ assistantId: "asst_123", status: "configured", detail: null });
    expect(getVapiConnectionStatus).toHaveBeenCalledWith("asst_123");
  });

  it("nunca expone VAPI_API_KEY ni ningún detalle de credencial en la respuesta", async () => {
    workspaceRow = { vapi_assistant_id: "asst_123" };
    getVapiConnectionStatus.mockResolvedValue({ status: "needs_attention", detail: "Vapi respondió con un error (401)" });
    const req = new NextRequest("http://localhost/x");
    const res = await GET(req, params("empresa-a"));
    const text = await res.text();
    expect(text).not.toMatch(/sk_|Bearer |api[_-]?key/i);
  });
});

describe("PATCH .../vapi-assistant — solo superadmin", () => {
  it("admin de workspace normal (no superadmin) -> 403", async () => {
    isSuperAdminData = { is_super_admin: false };
    const req = new NextRequest("http://localhost/x", {
      method: "PATCH",
      body: JSON.stringify({ assistantId: "asst_new" }),
    });
    const res = await PATCH(req, params("empresa-a"));
    expect(res.status).toBe(403);
    expect(updateSpy).not.toHaveBeenCalled();
  });

  it("superadmin SÍ puede vincular un assistantId", async () => {
    isSuperAdminData = { is_super_admin: true };
    const req = new NextRequest("http://localhost/x", {
      method: "PATCH",
      body: JSON.stringify({ assistantId: "asst_new" }),
    });
    const res = await PATCH(req, params("empresa-a"));
    expect(res.status).toBe(200);
    expect(updateSpy).toHaveBeenCalledWith({ vapi_assistant_id: "asst_new" });
    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "vapi_assistant.set" }),
    );
  });

  it("superadmin puede desvincular (assistantId: null)", async () => {
    const req = new NextRequest("http://localhost/x", {
      method: "PATCH",
      body: JSON.stringify({ assistantId: null }),
    });
    const res = await PATCH(req, params("empresa-a"));
    expect(res.status).toBe(200);
    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "vapi_assistant.clear" }),
    );
  });
});
