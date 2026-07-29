// Regression coverage for the test-chat playground's safety + isolation
// invariants: it must never require YCloud/WhatsApp, must always run tools
// in simulate mode (never for real), must 404 on cross-workspace agent
// access (IDOR), must 403 non-admin/manager callers, and must never write to
// contacts/conversations/messages — only a best-effort `events` log row.

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
    from: (table: string) => {
      if (table === "memberships") {
        return chainable(() => ({ data: membershipData, error: null }));
      }
      throw new Error(`unexpected table on the user-session client: ${table}`);
    },
  })),
}));

const fromSpy = vi.fn((table: string) => ({
  insert: () => ({ then: (onFulfilled: () => void) => onFulfilled() }),
  select: () => ({
    eq: () => ({
      maybeSingle: async () => ({ data: null }),
    }),
  }),
}));
vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => ({ from: fromSpy })),
}));

const loadTestAgent = vi.fn();
const resolveTestModel = vi.fn();
const resolveTestPrompt = vi.fn();
vi.mock("@/features/agents/services/agent-test-context", () => ({
  loadTestAgent,
  resolveTestModel,
  resolveTestPrompt,
}));

vi.mock("@/features/inbox/services/business-info", () => ({
  getBusinessInfo: vi.fn(async () => null),
  buildBusinessInfoContext: vi.fn(() => ""),
  buildNowContext: vi.fn(() => "now"),
}));

vi.mock("@/features/inbox/services/kb-service", () => ({
  searchKb: vi.fn(async () => []),
  formatKbContext: vi.fn(() => ""),
  listKbSourceLinks: vi.fn(async () => []),
  formatKbReferenceLinks: vi.fn(() => ""),
}));

vi.mock("@/features/inbox/services/prompt-builder", () => ({
  buildSystemPrompt: vi.fn(() => "SYSTEM PROMPT"),
}));

const generateChatReply = vi.fn();
vi.mock("@/features/inbox/services/openrouter", () => ({ generateChatReply }));

const getEnabledTools = vi.fn(async () => []);
vi.mock("@/features/tools/services/tool-configs", () => ({ getEnabledTools }));

const { POST } = await import("./route");

function params(workspaceId: string, agentId = "agent-1") {
  return { params: Promise.resolve({ id: workspaceId, agentId }) };
}

function req(body: unknown) {
  return new NextRequest(
    "http://localhost/api/workspace/empresa-a/agents/agent-1/test-chat",
    { method: "POST", body: JSON.stringify(body) },
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  membershipData = { role: "admin" };
  getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
  loadTestAgent.mockResolvedValue({
    id: "agent-1",
    workspace_id: "empresa-a",
    type: "setter",
    name: "Carlos",
    model: null,
    config: {},
  });
  resolveTestModel.mockResolvedValue("openai/gpt-4o-mini");
  resolveTestPrompt.mockResolvedValue({
    promptBody: "Eres un asistente de WhatsApp.",
    guardrails: null,
  });
  generateChatReply.mockResolvedValue({
    text: "Hola, ¿en qué te ayudo?",
    promptTokens: 10,
    completionTokens: 5,
  });
});

describe("POST .../test-chat — auth and isolation", () => {
  it("401s when there is no authenticated user", async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    const res = await POST(
      req({ messages: [{ role: "user", content: "hola" }] }),
      params("empresa-a"),
    );
    expect(res.status).toBe(401);
    expect(loadTestAgent).not.toHaveBeenCalled();
  });

  it("403s a member without admin/manager role", async () => {
    membershipData = { role: "viewer" };
    const res = await POST(
      req({ messages: [{ role: "user", content: "hola" }] }),
      params("empresa-a"),
    );
    expect(res.status).toBe(403);
    expect(loadTestAgent).not.toHaveBeenCalled();
  });

  it("403s a caller with no membership row at all", async () => {
    membershipData = null;
    const res = await POST(
      req({ messages: [{ role: "user", content: "hola" }] }),
      params("empresa-b"),
    );
    expect(res.status).toBe(403);
  });

  it("404s when the agent belongs to a different workspace (IDOR)", async () => {
    loadTestAgent.mockResolvedValue(null); // agent-test-context enforces the workspace match itself
    const res = await POST(
      req({ messages: [{ role: "user", content: "hola" }] }),
      params("empresa-b", "agent-from-empresa-a"),
    );
    expect(res.status).toBe(404);
    expect(generateChatReply).not.toHaveBeenCalled();
  });
});

describe("POST .../test-chat — OpenRouter-only, no YCloud/WhatsApp dependency", () => {
  it("succeeds using only OpenRouter (model+prompt+KB), never touching YCloud", async () => {
    const res = await POST(
      req({ messages: [{ role: "user", content: "Hola" }] }),
      params("empresa-a"),
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.text).toBe("Hola, ¿en qué te ayudo?");
    expect(json.model).toBe("openai/gpt-4o-mini");

    // Never references ycloud/whatsapp tables or services anywhere in the call.
    const touchedTables = fromSpy.mock.calls.map(([table]) => table);
    expect(touchedTables.every((t) => !/ycloud|whatsapp/i.test(t))).toBe(true);
  });

  it("always runs tools in simulate mode — never lets the model act for real", async () => {
    await POST(
      req({ messages: [{ role: "user", content: "Quiero agendar una cita" }] }),
      params("empresa-a"),
    );

    expect(generateChatReply).toHaveBeenCalledWith(
      expect.objectContaining({ simulateTools: true }),
    );
  });

  it("never writes to contacts, conversations, or messages — only a best-effort events row", async () => {
    await POST(
      req({ messages: [{ role: "user", content: "Hola" }] }),
      params("empresa-a"),
    );

    const touchedTables = fromSpy.mock.calls.map(([table]) => table);
    expect(touchedTables).not.toContain("contacts");
    expect(touchedTables).not.toContain("conversations");
    expect(touchedTables).not.toContain("messages");
  });

  it("surfaces a diagnosable 502 (not a raw crash) when the model call fails", async () => {
    generateChatReply.mockRejectedValue(new Error("User not found."));
    const res = await POST(
      req({ messages: [{ role: "user", content: "Hola" }] }),
      params("empresa-a"),
    );
    expect(res.status).toBe(502);
    const json = await res.json();
    expect(json.error).toContain("User not found.");
  });
});
