import { describe, expect, it, vi, beforeEach } from "vitest";

// Proves the reminders/follow-up safety net (task requirement: "escalado a
// persona ante una respuesta sensible") is wired into the real decision
// path, and that it's additive — a workspace without the reminders engine
// enabled behaves exactly as before (detectsHandoffTrigger / rate limit /
// respond), never touched by this change.

const checkSensitiveSignal = vi.fn();
const flagNeedsAttentionForContact = vi.fn(async () => undefined);
const checkRateLimits = vi.fn(async () => ({ allowed: true }));
const getEnabledTools = vi.fn(async () => []);

let conversationRow: { state: string } | null = { state: "ai_active" };
const updates: Array<{ table: string; patch: Record<string, unknown> }> = [];
const inserts: Array<{ table: string; row: Record<string, unknown> }> = [];

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => ({
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          single: async () => ({ data: conversationRow, error: conversationRow ? null : { message: "not found" } }),
        }),
      }),
      update: (patch: Record<string, unknown>) => ({
        eq: () => {
          updates.push({ table, patch });
          return Promise.resolve({ error: null });
        },
      }),
      insert: (row: Record<string, unknown>) => {
        inserts.push({ table, row });
        return Promise.resolve({ error: null });
      },
    }),
  })),
}));

vi.mock("@/features/tools/services/tool-configs", () => ({ getEnabledTools }));
vi.mock("./cost-tracker", () => ({ checkRateLimits }));
vi.mock("@/features/reminders/services/sensitive-guard", () => ({
  checkSensitiveSignal,
  flagNeedsAttentionForContact,
}));

const { decide } = await import("./decision-engine");

beforeEach(() => {
  vi.clearAllMocks();
  updates.length = 0;
  inserts.length = 0;
  conversationRow = { state: "ai_active" };
  checkSensitiveSignal.mockResolvedValue({ matched: false });
  checkRateLimits.mockResolvedValue({ allowed: true });
});

describe("decide() — sensitive-signal handoff (reminders safety net)", () => {
  it("a sensitive keyword forces handoff, pauses the sequence, and never lets the AI respond", async () => {
    checkSensitiveSignal.mockResolvedValue({ matched: true, keyword: "mucho dolor" });

    const result = await decide({
      workspaceId: "ws-1",
      conversationId: "conv-1",
      mergedText: "tengo mucho dolor y está hinchado",
      contactId: "contact-1",
    });

    expect(result.decision).toBe("handoff");
    expect(result.reason).toBe("sensitive_signal");
    expect(getEnabledTools).not.toHaveBeenCalled(); // never reaches "respond"

    const stateUpdate = updates.find((u) => u.table === "conversations");
    expect(stateUpdate?.patch.state).toBe("handoff_pending");
    expect(stateUpdate?.patch.ai_enabled).toBe(false);

    expect(flagNeedsAttentionForContact).toHaveBeenCalledWith("contact-1", "mucho dolor");
  });

  it("takes priority over a normal response even when nothing else would trigger handoff", async () => {
    checkSensitiveSignal.mockResolvedValue({ matched: true, keyword: "fiebre" });
    const result = await decide({
      workspaceId: "ws-1",
      conversationId: "conv-1",
      mergedText: "tengo fiebre desde ayer",
      contactId: "contact-1",
    });
    expect(result.decision).toBe("handoff");
  });

  it("is a no-op for workspaces without the reminders engine enabled — normal respond flow is untouched", async () => {
    checkSensitiveSignal.mockResolvedValue({ matched: false }); // sensitive-guard itself no-ops when reminders aren't enabled
    const result = await decide({
      workspaceId: "ws-1",
      conversationId: "conv-1",
      mergedText: "hola, quiero información",
      contactId: "contact-1",
    });
    expect(result.decision).toBe("respond");
    expect(flagNeedsAttentionForContact).not.toHaveBeenCalled();
  });

  it("does not attempt a transition when the conversation is already in a terminal state", async () => {
    conversationRow = { state: "closed" };
    checkSensitiveSignal.mockResolvedValue({ matched: false });
    const result = await decide({
      workspaceId: "ws-1",
      conversationId: "conv-1",
      mergedText: "hola",
      contactId: "contact-1",
    });
    expect(result.decision).toBe("abstain");
  });
});
