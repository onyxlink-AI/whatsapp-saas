// The "Evaluar conversación" endpoint must: require the same admin/manager
// permission and IDOR guard as test-chat, never pass tools to the model (an
// audit is text-only and must never trigger a simulated OR real tool call),
// and never auto-apply its suggestions — it only returns them.

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
      throw new Error(`unexpected table: ${table}`);
    },
  })),
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => ({
    from: () => ({
      insert: () => ({ then: (onFulfilled: () => void) => onFulfilled() }),
    }),
  })),
}));

const loadTestAgent = vi.fn();
const resolveTestPrompt = vi.fn();
vi.mock("@/features/agents/services/agent-test-context", () => ({
  loadTestAgent,
  resolveTestPrompt,
}));

vi.mock("@/features/inbox/services/business-info", () => ({
  getBusinessInfo: vi.fn(async () => ({
    structured: { name: "Acme" },
    free_text: null,
  })),
}));

const generateChatReply = vi.fn();
vi.mock("@/features/inbox/services/openrouter", () => ({ generateChatReply }));

const { POST } = await import("./route");

function params(workspaceId: string, agentId = "agent-1") {
  return { params: Promise.resolve({ id: workspaceId, agentId }) };
}

function req(body: unknown) {
  return new NextRequest(
    "http://localhost/api/workspace/empresa-a/agents/agent-1/test-chat/evaluate",
    { method: "POST", body: JSON.stringify(body) },
  );
}

const VALID_EVAL = {
  followed_prompt: "si",
  used_business_info_correctly: "si",
  clarity: "alta",
  invented_information: false,
  respected_restrictions: true,
  asked_unnecessary_data: false,
  handoff_awareness: "no_aplica",
  recommendations: ["Aclara el horario de atención."],
  summary: "Buen desempeño general.",
};

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
  resolveTestPrompt.mockResolvedValue({
    promptBody: "Eres un asistente de WhatsApp.",
    guardrails: null,
  });
  generateChatReply.mockResolvedValue({
    text: JSON.stringify(VALID_EVAL),
    promptTokens: 20,
    completionTokens: 15,
  });
});

const SAMPLE_MESSAGES = [
  { role: "user", content: "Hola, quiero información" },
  { role: "assistant", content: "Claro, ¿en qué te ayudo?" },
];

describe("POST .../test-chat/evaluate — permissions and isolation", () => {
  it("403s a caller without admin/manager role", async () => {
    membershipData = { role: "viewer" };
    const res = await POST(
      req({ messages: SAMPLE_MESSAGES }),
      params("empresa-a"),
    );
    expect(res.status).toBe(403);
    expect(generateChatReply).not.toHaveBeenCalled();
  });

  it("404s when the agent belongs to a different workspace", async () => {
    loadTestAgent.mockResolvedValue(null);
    const res = await POST(
      req({ messages: SAMPLE_MESSAGES }),
      params("empresa-b"),
    );
    expect(res.status).toBe(404);
  });
});

describe("POST .../test-chat/evaluate — behavior", () => {
  it("returns a structured evaluation without modifying the prompt", async () => {
    const res = await POST(
      req({ messages: SAMPLE_MESSAGES }),
      params("empresa-a"),
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.evaluation).toEqual(VALID_EVAL);
    // The route never writes back to agents/prompts — it only returns suggestions.
  });

  it("never passes tools to the model — an evaluation must never trigger a tool call", async () => {
    await POST(req({ messages: SAMPLE_MESSAGES }), params("empresa-a"));

    const call = generateChatReply.mock.calls[0][0];
    expect(call.tools).toBeUndefined();
    expect(call.toolContext).toBeUndefined();
  });

  it("returns a diagnosable error when the model doesn't return valid JSON", async () => {
    generateChatReply.mockResolvedValue({
      text: "no soy JSON",
      promptTokens: 1,
      completionTokens: 1,
    });
    const res = await POST(
      req({ messages: SAMPLE_MESSAGES }),
      params("empresa-a"),
    );
    expect(res.status).toBe(502);
  });

  it("rejects a single-message transcript (nothing to evaluate yet)", async () => {
    const res = await POST(
      req({ messages: [{ role: "user", content: "Hola" }] }),
      params("empresa-a"),
    );
    expect(res.status).toBe(400);
    expect(generateChatReply).not.toHaveBeenCalled();
  });
});
