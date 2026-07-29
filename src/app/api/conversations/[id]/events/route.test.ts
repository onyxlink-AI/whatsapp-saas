// Regression test for a cross-tenant bug found in the E2E production-polish
// audit: this route used to resolve "the user's workspace" by grabbing ANY
// ONE of their membership rows (`.eq("user_id", ...).limit(1).single()`)
// instead of checking membership for the conversation's ACTUAL workspace,
// and never filtered by is_active. For a user who belongs to only one
// workspace this happened to still work, but it meant a deactivated member
// kept access, and the logic was fragile by construction rather than
// correct by construction. The fix resolves the conversation's real
// workspace_id FIRST, then checks active membership for THAT workspace.

import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const getUser = vi.fn();

// The user in these tests really is an active member of Empresa A only.
const CALLER_WORKSPACE_ID = "empresa-a";
let membershipIsActive = true;

function conversationsChainable(conversation: { id: string; workspace_id: string } | null) {
  const obj: Record<string, unknown> = {};
  obj.select = () => obj;
  obj.eq = () => obj;
  obj.maybeSingle = async () => ({ data: conversation, error: null });
  return obj;
}

function membershipsChainable() {
  let queriedWorkspaceId: string | undefined;
  const obj: Record<string, unknown> = {};
  obj.select = () => obj;
  obj.eq = (col: string, val: string) => {
    if (col === "workspace_id") queriedWorkspaceId = val;
    return obj;
  };
  obj.maybeSingle = async () => {
    const isCallerWorkspace = queriedWorkspaceId === CALLER_WORKSPACE_ID;
    if (isCallerWorkspace && membershipIsActive) {
      return { data: { workspace_id: CALLER_WORKSPACE_ID }, error: null };
    }
    return { data: null, error: null };
  };
  return obj;
}

let conversationRow: { id: string; workspace_id: string } | null = null;

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser },
    from: (table: string) => {
      if (table === "conversations") return conversationsChainable(conversationRow);
      if (table === "memberships") return membershipsChainable();
      throw new Error(`unexpected table in test: ${table}`);
    },
  })),
}));

vi.mock("@/features/inbox/services/observability", () => ({
  getConversationMetrics: vi.fn(async () => ({})),
  getConversationEvents: vi.fn(async () => []),
}));

const { GET } = await import("./route");

function params(conversationId: string) {
  return { params: Promise.resolve({ id: conversationId }) };
}

beforeEach(() => {
  vi.clearAllMocks();
  membershipIsActive = true;
  getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
});

describe("GET /api/conversations/[id]/events — aislamiento por workspace real", () => {
  it("rechaza (403) una conversación de OTRA empresa aunque el usuario tenga alguna membership propia", async () => {
    conversationRow = { id: "conv-b", workspace_id: "empresa-b" };
    const req = new NextRequest("http://localhost/x");
    const res = await GET(req, params("conv-b"));
    expect(res.status).toBe(403);
  });

  it("permite el acceso cuando la conversación SÍ pertenece al workspace del usuario", async () => {
    conversationRow = { id: "conv-a", workspace_id: CALLER_WORKSPACE_ID };
    const req = new NextRequest("http://localhost/x");
    const res = await GET(req, params("conv-a"));
    expect(res.status).toBe(200);
  });

  it("rechaza (403) a un miembro desactivado (is_active=false) aunque la conversación sí sea de su empresa", async () => {
    membershipIsActive = false;
    conversationRow = { id: "conv-a", workspace_id: CALLER_WORKSPACE_ID };
    const req = new NextRequest("http://localhost/x");
    const res = await GET(req, params("conv-a"));
    expect(res.status).toBe(403);
  });

  it("devuelve 404 cuando la conversación no existe", async () => {
    conversationRow = null;
    const req = new NextRequest("http://localhost/x");
    const res = await GET(req, params("conv-inexistente"));
    expect(res.status).toBe(404);
  });
});
