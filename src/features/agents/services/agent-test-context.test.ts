import { describe, expect, it, vi, beforeEach } from "vitest";

// Proves the actual IDOR guard used by both the test-chat and evaluate
// playground routes: an agent row is only returned when its own
// workspace_id matches the workspaceId the caller is scoped to — this is
// what stops Empresa A's admin from ever reaching Empresa B's agent (or
// vice versa) through the playground.

let agentRow: Record<string, unknown> | null = null;

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: agentRow, error: null }),
        }),
      }),
    }),
  })),
}));

const { loadTestAgent } = await import("./agent-test-context");

beforeEach(() => {
  agentRow = null;
});

describe("loadTestAgent — cross-workspace IDOR guard", () => {
  it("returns the agent when its workspace_id matches the requested workspaceId", async () => {
    agentRow = {
      id: "agent-1",
      workspace_id: "empresa-a",
      type: "setter",
      name: "Carlos",
      model: null,
      config: {},
    };
    const agent = await loadTestAgent("empresa-a", "agent-1");
    expect(agent?.id).toBe("agent-1");
  });

  it("returns null when the agent belongs to a different workspace than requested", async () => {
    agentRow = {
      id: "agent-1",
      workspace_id: "empresa-a",
      type: "setter",
      name: "Carlos",
      model: null,
      config: {},
    };
    const agent = await loadTestAgent("empresa-b", "agent-1");
    expect(agent).toBeNull();
  });

  it("returns null when no agent row exists at all", async () => {
    agentRow = null;
    const agent = await loadTestAgent("empresa-a", "does-not-exist");
    expect(agent).toBeNull();
  });
});
