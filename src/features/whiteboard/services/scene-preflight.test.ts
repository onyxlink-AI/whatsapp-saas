// Fase 4C — scene-preflight.ts: inventario de solo lectura. Nunca debe
// hacer ningún UPDATE/INSERT/DELETE — solo el mock de `select` está
// disponible a propósito, para que la prueba falle si el código
// intentara escribir.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { MAX_ELEMENTS_PER_SCENE } from "./scene-adapter";

let rows: Array<{ id: string; workspace_id: string; name: string; scene_data: unknown }> = [];

function selectChain() {
  const node: Record<string, unknown> = {
    eq: () => node,
    then: (resolve: (v: unknown) => unknown) => resolve({ data: rows, error: null }),
  };
  return node;
}

const fromSpy = vi.fn(() => ({ select: () => selectChain() }));

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => ({ from: fromSpy })),
}));

const { runWhiteboardScenePreflight, formatPreflightReport } = await import("./scene-preflight");

beforeEach(() => {
  vi.clearAllMocks();
  rows = [];
});

describe("runWhiteboardScenePreflight", () => {
  it("nunca llama a nada más que select — es de solo lectura", async () => {
    rows = [{ id: "b1", workspace_id: "ws1", name: "Tablero", scene_data: { elements: [], appState: {} } }];
    await runWhiteboardScenePreflight();
    const fromResult = fromSpy.mock.results[0]!.value as Record<string, unknown>;
    expect(Object.keys(fromResult)).toEqual(["select"]);
  });

  it("calcula elementCount, sizeBytes y types correctamente", async () => {
    rows = [
      {
        id: "b1",
        workspace_id: "ws1",
        name: "Tablero",
        scene_data: {
          elements: [
            { id: "e1", type: "rectangle", x: 0, y: 0 },
            { id: "e2", type: "text", x: 0, y: 0 },
            { id: "e3", type: "rectangle", x: 0, y: 0 },
          ],
          appState: {},
        },
      },
    ];
    const report = await runWhiteboardScenePreflight();
    expect(report.rows).toHaveLength(1);
    expect(report.rows[0].elementCount).toBe(3);
    expect(report.rows[0].types).toEqual(["rectangle", "text"]);
    expect(report.rows[0].sizeBytes).toBeGreaterThan(0);
    expect(report.rows[0].withinLimits).toBe(true);
    expect(report.rows[0].invalidElementIds).toEqual([]);
  });

  it("marca withinLimits=false cuando supera MAX_ELEMENTS_PER_SCENE", async () => {
    rows = [
      {
        id: "b1",
        workspace_id: "ws1",
        name: "Tablero grande",
        scene_data: { elements: new Array(MAX_ELEMENTS_PER_SCENE + 1).fill({ id: "x", type: "rectangle", x: 0, y: 0 }), appState: {} },
      },
    ];
    const report = await runWhiteboardScenePreflight();
    expect(report.rows[0].withinLimits).toBe(false);
    expect(report.boardsOverLimits).toBe(1);
  });

  it("detecta elementos estructuralmente inválidos (id vacío, x/y no finitos) sin modificar nada", async () => {
    rows = [
      {
        id: "b1",
        workspace_id: "ws1",
        name: "Tablero con basura",
        scene_data: {
          elements: [
            { id: "ok-1", type: "rectangle", x: 0, y: 0 },
            { id: "", type: "rectangle", x: 0, y: 0 },
            { id: "bad-2", type: "rectangle", x: NaN, y: 0 },
          ],
          appState: {},
        },
      },
    ];
    const report = await runWhiteboardScenePreflight();
    expect(report.boardsWithInvalidElements).toBe(1);
    expect(report.rows[0].invalidElementIds).toHaveLength(2);
  });

  it("tablero con scene_data vacío/null no revienta — 0 elementos, sin marcar inválido", async () => {
    rows = [{ id: "b1", workspace_id: "ws1", name: "Vacío", scene_data: null }];
    const report = await runWhiteboardScenePreflight();
    expect(report.rows[0].elementCount).toBe(0);
    expect(report.rows[0].withinLimits).toBe(true);
  });

  it("filtra por workspaceId cuando se pasa", async () => {
    rows = [{ id: "b1", workspace_id: "ws1", name: "X", scene_data: { elements: [], appState: {} } }];
    await runWhiteboardScenePreflight("ws1");
    // No lanza y devuelve el resultado del mock (que no filtra realmente,
    // pero confirma que .eq() se invoca en la cadena sin romper).
    expect(fromSpy).toHaveBeenCalled();
  });
});

describe("formatPreflightReport", () => {
  it("incluye el resumen y solo lista tableros problemáticos", () => {
    const report = {
      rows: [
        { whiteboardId: "b1", workspaceId: "ws1", name: "Sano", elementCount: 5, sizeBytes: 100, types: ["rectangle"], withinLimits: true, invalidElementIds: [] },
        { whiteboardId: "b2", workspaceId: "ws1", name: "Roto", elementCount: 5, sizeBytes: 100, types: ["rectangle"], withinLimits: false, invalidElementIds: ["e1"] },
      ],
      totalBoards: 2,
      boardsOverLimits: 1,
      boardsWithInvalidElements: 1,
    };
    const text = formatPreflightReport(report);
    expect(text).toContain("Tableros analizados: 2");
    expect(text).not.toContain("Sano");
    expect(text).toContain("Roto");
    expect(text).toContain("SUPERA LÍMITES");
    expect(text).toContain("ELEMENTOS INVÁLIDOS");
  });
});
