// Fase 4A — Endurecimiento de note-actions.ts antes de exponerlo al
// Asistente de Ayuda: renameNote, updateNoteContent, setNoteArchived.

import { describe, it, expect, vi, beforeEach } from "vitest";

const getUser = vi.fn();

type Result = { data: unknown; error: { message: string } | null };
const results: Record<string, Result> = {};
// Cuenta llamadas a .update() y guarda el último patch — para comprobar
// que updateNote hace UNA sola escritura combinada, nunca dos separadas.
let updateCallCount = 0;
let lastUpdatePatch: Record<string, unknown> | null = null;

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
  from: () => ({
    update: (patch: Record<string, unknown>) => {
      updateCallCount += 1;
      lastUpdatePatch = patch;
      return chain(results.notes ?? { data: null, error: null });
    },
  }),
};
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => sessionClient }));

const { renameNote, updateNoteContent, setNoteArchived, updateNote } = await import("./note-actions");

const WORKSPACE_A = "11111111-1111-4111-8111-111111111111";
const FOREIGN_NOTE_ID = "99999999-9999-4999-8999-999999999999";
const USER_ID = "33333333-3333-4333-8333-333333333333";

beforeEach(() => {
  vi.clearAllMocks();
  delete results.notes;
  updateCallCount = 0;
  lastUpdatePatch = null;
  getUser.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null });
});

describe("note-actions — endurecimiento", () => {
  it("renameNote: 0 filas (nota de otro workspace) nunca es éxito", async () => {
    results.notes = { data: null, error: null };
    const result = await renameNote(WORKSPACE_A, FOREIGN_NOTE_ID, "Título nuevo");
    expect(result).toEqual({ ok: false, error: "not_found_or_forbidden" });
  });

  it("renameNote: error real de BD nunca se confunde con not_found_or_forbidden", async () => {
    results.notes = { data: null, error: { message: "connection reset" } };
    const result = await renameNote(WORKSPACE_A, FOREIGN_NOTE_ID, "X");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).not.toBe("not_found_or_forbidden");
      expect(result.error).not.toContain("connection reset");
    }
  });

  it("renameNote: 1 fila afectada es éxito", async () => {
    results.notes = { data: { id: FOREIGN_NOTE_ID }, error: null };
    const result = await renameNote(WORKSPACE_A, FOREIGN_NOTE_ID, "X");
    expect(result).toEqual({ ok: true, data: null });
  });

  it("updateNoteContent: 0 filas nunca es éxito", async () => {
    results.notes = { data: null, error: null };
    const result = await updateNoteContent(WORKSPACE_A, FOREIGN_NOTE_ID, { type: "doc", content: [] });
    expect(result).toEqual({ ok: false, error: "not_found_or_forbidden" });
  });

  it("setNoteArchived: 0 filas nunca es éxito — nunca simula haber archivado algo ajeno", async () => {
    results.notes = { data: null, error: null };
    const result = await setNoteArchived(WORKSPACE_A, FOREIGN_NOTE_ID, true);
    expect(result).toEqual({ ok: false, error: "not_found_or_forbidden" });
  });
});

describe("updateNote — revisión correctiva: título+contenido en UNA sola sentencia", () => {
  it("0 filas (nota de otro workspace) nunca es éxito", async () => {
    results.notes = { data: null, error: null };
    const result = await updateNote(WORKSPACE_A, FOREIGN_NOTE_ID, { title: "hackeado" });
    expect(result).toEqual({ ok: false, error: "not_found_or_forbidden" });
  });

  it("error real de BD nunca se confunde con not_found_or_forbidden ni filtra el mensaje crudo", async () => {
    results.notes = { data: null, error: { message: "connection reset" } };
    const result = await updateNote(WORKSPACE_A, FOREIGN_NOTE_ID, { title: "X" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).not.toBe("not_found_or_forbidden");
      expect(result.error).not.toContain("connection reset");
    }
  });

  it("1 fila afectada es éxito", async () => {
    results.notes = { data: { id: FOREIGN_NOTE_ID }, error: null };
    const result = await updateNote(WORKSPACE_A, FOREIGN_NOTE_ID, { title: "X" });
    expect(result).toEqual({ ok: true, data: null });
  });

  it("título y contenido juntos se guardan en UNA sola llamada a .update(), nunca dos escrituras separadas", async () => {
    results.notes = { data: { id: FOREIGN_NOTE_ID }, error: null };
    const content = { type: "doc" as const, content: [] };
    const result = await updateNote(WORKSPACE_A, FOREIGN_NOTE_ID, { title: "Nuevo título", content });
    expect(result).toEqual({ ok: true, data: null });
    expect(updateCallCount).toBe(1);
    expect(lastUpdatePatch).toEqual({ title: "Nuevo título", content });
  });

  it("solo título (sin content) no incluye content en el patch", async () => {
    results.notes = { data: { id: FOREIGN_NOTE_ID }, error: null };
    await updateNote(WORKSPACE_A, FOREIGN_NOTE_ID, { title: "Solo título" });
    expect(updateCallCount).toBe(1);
    expect(lastUpdatePatch).toEqual({ title: "Solo título" });
  });

  it("rechaza cuando no se da ni título ni contenido, sin llegar a escribir", async () => {
    const result = await updateNote(WORKSPACE_A, FOREIGN_NOTE_ID, {});
    expect(result.ok).toBe(false);
    expect(updateCallCount).toBe(0);
  });
});
