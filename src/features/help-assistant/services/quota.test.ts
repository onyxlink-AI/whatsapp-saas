import { describe, it, expect, vi, beforeEach } from "vitest";

let queryResult: { count: number | null; error: unknown } = { count: 0, error: null };
let insertResult: { error: unknown } = { error: null };
const insertedRows: Record<string, unknown>[] = [];

function selectChain() {
  const obj: Record<string, unknown> = {};
  obj.eq = () => obj;
  obj.gte = () => Promise.resolve(queryResult);
  return obj;
}

const fromSpy = vi.fn((table: string) => ({
  select: () => selectChain(),
  insert: (row: Record<string, unknown>) => {
    insertedRows.push({ table, ...row });
    return Promise.resolve(insertResult);
  },
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => ({ from: fromSpy })),
}));

const { checkHelpAssistantQuota, recordHelpAssistantQuestion } = await import("./quota");

beforeEach(() => {
  vi.clearAllMocks();
  insertedRows.length = 0;
  queryResult = { count: 0, error: null };
  insertResult = { error: null };
});

describe("checkHelpAssistantQuota", () => {
  it("allows when used count is below the limit", async () => {
    queryResult = { count: 5, error: null };
    const result = await checkHelpAssistantQuota("ws1", 30);
    expect(result).toEqual({ allowed: true, used: 5, limit: 30 });
  });

  it("blocks at the exact boundary (used === limit)", async () => {
    queryResult = { count: 30, error: null };
    const result = await checkHelpAssistantQuota("ws1", 30);
    expect(result.allowed).toBe(false);
  });

  it("fails open when the count query errors", async () => {
    queryResult = { count: null, error: new Error("boom") };
    const result = await checkHelpAssistantQuota("ws1", 30);
    expect(result.allowed).toBe(true);
  });
});

describe("recordHelpAssistantQuestion", () => {
  it("inserts an events row with the right type and payload, no conversation_id", async () => {
    await recordHelpAssistantQuestion({
      workspaceId: "ws1",
      userId: "user1",
      model: "openai/gpt-4o-mini",
      promptTokens: 10,
      completionTokens: 20,
    });

    expect(insertedRows).toHaveLength(1);
    expect(insertedRows[0]).toMatchObject({
      table: "events",
      type: "help_assistant_question",
      workspace_id: "ws1",
      conversation_id: null,
      payload: {
        user_id: "user1",
        model: "openai/gpt-4o-mini",
        prompt_tokens: 10,
        completion_tokens: 20,
      },
    });
  });
});
