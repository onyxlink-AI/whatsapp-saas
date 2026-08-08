// Fase 4A — Endurecimiento de renameWhiteboard antes de exponerlo al
// Asistente de Ayuda (rename_whiteboard es la única mutación que la tool ya
// ofrecía antes de esta revisión).

import { describe, it, expect, vi, beforeEach } from "vitest";

const getUser = vi.fn();

type Result = { data: unknown; error: { message: string } | null };
let updateResult: Result = { data: null, error: null };

function chain(result: Result) {
  const node: Record<string, unknown> = {
    eq: () => node,
    select: () => node,
    maybeSingle: () => Promise.resolve(result),
  };
  return node;
}

const sessionClient = {
  auth: { getUser: (...a: unknown[]) => getUser(...a) },
  from: () => ({ update: () => chain(updateResult) }),
};
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => sessionClient }));

const { renameWhiteboard } = await import("./whiteboard-actions");

const WORKSPACE_A = "11111111-1111-4111-8111-111111111111";
const FOREIGN_BOARD_ID = "99999999-9999-4999-8999-999999999999";
const USER_ID = "33333333-3333-4333-8333-333333333333";

beforeEach(() => {
  vi.clearAllMocks();
  updateResult = { data: null, error: null };
  getUser.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null });
});

describe("whiteboard-actions — endurecimiento", () => {
  it("renameWhiteboard: 0 filas (tablero de otro workspace) nunca es éxito", async () => {
    const result = await renameWhiteboard(WORKSPACE_A, FOREIGN_BOARD_ID, "Nombre nuevo");
    expect(result).toEqual({ ok: false, error: "not_found_or_forbidden" });
  });

  it("renameWhiteboard: error real de BD nunca se confunde con not_found_or_forbidden", async () => {
    updateResult = { data: null, error: { message: "connection reset" } };
    const result = await renameWhiteboard(WORKSPACE_A, FOREIGN_BOARD_ID, "X");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).not.toBe("not_found_or_forbidden");
      expect(result.error).not.toContain("connection reset");
    }
  });

  it("renameWhiteboard: 1 fila afectada es éxito", async () => {
    updateResult = { data: { id: FOREIGN_BOARD_ID }, error: null };
    const result = await renameWhiteboard(WORKSPACE_A, FOREIGN_BOARD_ID, "X");
    expect(result).toEqual({ ok: true, data: null });
  });
});
