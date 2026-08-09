// Fase 4C (revisión correctiva) — board-tools.ts: concurrencia por elemento
// (expected_element_version), reintento en conflicto disjunto, rechazo
// inmediato en conflicto del mismo elemento, borrado vía la
// infraestructura de confirmación de 4B, y que el modelo nunca reciba/
// devuelva el JSON completo de la escena.
//
// updateWhiteboardSceneCas ahora recibe SOLO el array de elementos (§4 de
// la revisión correctiva) — mock.calls[N][3] es directamente el array, no
// {elements, appState}.
//
// Además cubre explícitamente los tres puntos de la revisión correctiva:
// §1 nota como unidad semántica (list_board_elements fusiona el texto
// ligado; update_board_element_text acepta el id del CONTENEDOR — el que
// realmente devuelve add_board_note — y redirige a su texto ligado);
// §2 movimiento coherente (mover el contenedor mueve su texto ligado con
// el mismo delta y recoloca las flechas conectadas sin tocar bindings;
// nunca se puede mover el texto ligado por separado);
// §3 borrado reversible por grupo (restaurar el contenedor restaura
// también su texto y las flechas que se retiraron con él, nunca un
// elemento de otro grupo, y solo limpia la clave de restauración).

import { describe, it, expect, vi, beforeEach } from "vitest";

const getWhiteboard = vi.fn();
const updateWhiteboardSceneCas = vi.fn();
vi.mock("@/features/whiteboard/services/whiteboard-actions", () => ({
  getWhiteboard: (...args: unknown[]) => getWhiteboard(...args),
  updateWhiteboardSceneCas: (...args: unknown[]) => updateWhiteboardSceneCas(...args),
}));

const logAudit = vi.fn();
vi.mock("@/features/audit/services/audit-log", () => ({ logAudit: (...args: unknown[]) => logAudit(...args) }));

const assertHelpActionAccess = vi.fn();
vi.mock("../assistant-access", () => ({
  assertHelpActionAccess: (...args: unknown[]) => assertHelpActionAccess(...args),
  assistantAccessErrorMessage: (reason: string) => `denied:${reason}`,
}));

const prepareConfirmableAction = vi.fn();
vi.mock("../pending-actions", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../pending-actions")>();
  return { ...actual, prepareConfirmableAction: (...args: unknown[]) => prepareConfirmableAction(...args) };
});

const { buildBoardTools } = await import("./board-tools");
const { createPendingConfirmationSlot } = await import("../pending-actions");

const ctx = { workspaceId: "ws1", actorUserId: "user1" };
const BOARD_ID = "11111111-1111-4111-8111-111111111111";

function board(elements: Record<string, unknown>[], version = 1) {
  return { id: BOARD_ID, workspace_id: "ws1", name: "Tablero", version, scene_data: { elements, appState: {} }, created_by: "user1", created_at: "", updated_at: "" };
}

function el(id: string, type: string, extra: Record<string, unknown> = {}) {
  return { id, type, x: 0, y: 0, width: 100, height: 100, version: 1, isDeleted: false, boundElements: null, ...extra };
}

function writtenElements(callIndex = 0): Record<string, unknown>[] {
  return updateWhiteboardSceneCas.mock.calls[callIndex][3] as Record<string, unknown>[];
}

beforeEach(() => {
  vi.clearAllMocks();
  assertHelpActionAccess.mockResolvedValue({ ok: true, role: "admin" });
});

describe("list_board_elements", () => {
  it("devuelve resúmenes mínimos de un elemento suelto, nunca el JSON completo (boundElements no se filtra al modelo)", async () => {
    getWhiteboard.mockResolvedValue(board([el("e1", "rectangle")]));
    const tools = buildBoardTools(ctx, createPendingConfirmationSlot());

    const result = await tools.list_board_elements.execute!({ whiteboard_id: BOARD_ID }, { toolCallId: "t1", messages: [] } as never);

    expect(result).toEqual({
      ok: true,
      elements: [expect.objectContaining({ element_id: "e1", type: "rectangle", element_version: 1 })],
    });
    expect(JSON.stringify(result)).not.toContain("boundElements");
  });

  it("excluye elementos borrados por defecto, los incluye con include_deleted", async () => {
    getWhiteboard.mockResolvedValue(board([el("e1", "rectangle"), el("e2", "rectangle", { isDeleted: true })]));
    const tools = buildBoardTools(ctx, createPendingConfirmationSlot());

    const withoutDeleted = await tools.list_board_elements.execute!({ whiteboard_id: BOARD_ID }, { toolCallId: "t1", messages: [] } as never);
    expect((withoutDeleted as { elements: unknown[] }).elements).toHaveLength(1);

    const withDeleted = await tools.list_board_elements.execute!({ whiteboard_id: BOARD_ID, include_deleted: true }, { toolCallId: "t1", messages: [] } as never);
    expect((withDeleted as { elements: unknown[] }).elements).toHaveLength(2);
  });

  it("tablero de otro workspace -> error, nunca expone nada", async () => {
    getWhiteboard.mockResolvedValue(board([]));
    const tools = buildBoardTools({ workspaceId: "ws-other", actorUserId: "user1" }, createPendingConfirmationSlot());
    const result = await tools.list_board_elements.execute!({ whiteboard_id: BOARD_ID }, { toolCallId: "t1", messages: [] } as never);
    expect(result).toEqual({ ok: false, error: "No encontré ese tablero en esta empresa" });
  });

  describe("revisión correctiva §1 — una nota (contenedor+texto ligado) es UNA fila, nunca dos", () => {
    it("fusiona el texto ligado en la fila del contenedor: text_excerpt visible, text_element_id opcional, sin fila propia para el texto", async () => {
      getWhiteboard.mockResolvedValue(
        board([
          el("container-1", "rectangle", { version: 1, boundElements: [{ id: "label-1", type: "text" }] }),
          el("label-1", "text", { version: 1, containerId: "container-1", text: "Comprar leche" }),
        ]),
      );
      const tools = buildBoardTools(ctx, createPendingConfirmationSlot());

      const result = await tools.list_board_elements.execute!({ whiteboard_id: BOARD_ID }, { toolCallId: "t1", messages: [] } as never);
      const elements = (result as { elements: { element_id: string; text_excerpt?: string; text_element_id?: string }[] }).elements;

      expect(elements).toHaveLength(1);
      expect(elements[0]).toMatchObject({ element_id: "container-1", text_excerpt: "Comprar leche", text_element_id: "label-1" });
      expect(elements.find((e) => e.element_id === "label-1")).toBeUndefined(); // nunca aparece como fila propia
    });

    it("una forma sin texto ligado no lleva text_excerpt ni text_element_id — nunca inventa contenido", async () => {
      getWhiteboard.mockResolvedValue(board([el("shape-1", "diamond", { version: 1, boundElements: null })]));
      const tools = buildBoardTools(ctx, createPendingConfirmationSlot());

      const result = await tools.list_board_elements.execute!({ whiteboard_id: BOARD_ID }, { toolCallId: "t1", messages: [] } as never);
      const [summary] = (result as { elements: { text_excerpt?: string; text_element_id?: string }[] }).elements;
      expect(summary.text_excerpt).toBeUndefined();
      expect(summary.text_element_id).toBeUndefined();
    });
  });
});

describe("add_board_note — creación directa, sin confirmación", () => {
  it("añade contenedor+etiqueta a la escena y guarda con CAS usando la version leída — p_elements es SOLO el array de elementos", async () => {
    getWhiteboard.mockResolvedValue(board([], 3));
    updateWhiteboardSceneCas.mockResolvedValue({ ok: true, data: { result: "updated", version: 4 } });
    const tools = buildBoardTools(ctx, createPendingConfirmationSlot());

    const result = await tools.add_board_note.execute!({ whiteboard_id: BOARD_ID, text: "Nota nueva" }, { toolCallId: "t1", messages: [] } as never);

    expect(result).toMatchObject({ ok: true });
    expect(updateWhiteboardSceneCas).toHaveBeenCalledWith("ws1", BOARD_ID, 3, expect.any(Array));
    const patch = writtenElements();
    expect(patch).toHaveLength(2); // rectángulo + texto
    expect(logAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "help_assistant.add_board_note" }));
  });

  it("devuelve el element_id del CONTENEDOR — el mismo que luego debe usarse en el resto de tools, nunca el del texto interno", async () => {
    getWhiteboard.mockResolvedValue(board([], 1));
    updateWhiteboardSceneCas.mockResolvedValue({ ok: true, data: { result: "updated", version: 2 } });
    const tools = buildBoardTools(ctx, createPendingConfirmationSlot());

    const result = await tools.add_board_note.execute!({ whiteboard_id: BOARD_ID, text: "Nota" }, { toolCallId: "t1", messages: [] } as never);
    const patch = writtenElements();
    const container = patch.find((e) => e.type === "rectangle")!;

    expect((result as { element_id: string }).element_id).toBe(container.id);
  });

  it("reintenta en conflicto de tablero (releyendo escena fresca) hasta lograr escribir", async () => {
    getWhiteboard.mockResolvedValueOnce(board([], 1)).mockResolvedValueOnce(board([el("other", "rectangle")], 2));
    updateWhiteboardSceneCas.mockResolvedValueOnce({ ok: true, data: { result: "conflict" } }).mockResolvedValueOnce({ ok: true, data: { result: "updated", version: 3 } });
    const tools = buildBoardTools(ctx, createPendingConfirmationSlot());

    const result = await tools.add_board_note.execute!({ whiteboard_id: BOARD_ID, text: "X" }, { toolCallId: "t1", messages: [] } as never);

    expect(result).toMatchObject({ ok: true });
    expect(updateWhiteboardSceneCas).toHaveBeenCalledTimes(2);
    expect(getWhiteboard).toHaveBeenCalledTimes(2); // releyó tras el conflicto
    const secondCallPatch = writtenElements(1);
    // La segunda escritura parte de la escena FRESCA (con "other"), no de la vieja.
    expect(secondCallPatch.some((e) => e.id === "other")).toBe(true);
  });
});

describe("update_board_element_text — revisión correctiva §1: redirección contenedor→texto", () => {
  it("recibe el ID del CONTENEDOR (el que devuelve add_board_note), edita su texto ligado y sube AMBAS versiones", async () => {
    getWhiteboard.mockResolvedValue(
      board(
        [
          el("container-1", "rectangle", { version: 3, boundElements: [{ id: "label-1", type: "text" }] }),
          el("label-1", "text", { version: 2, containerId: "container-1", text: "viejo" }),
        ],
        1,
      ),
    );
    updateWhiteboardSceneCas.mockResolvedValue({ ok: true, data: { result: "updated", version: 2 } });
    const tools = buildBoardTools(ctx, createPendingConfirmationSlot());

    const result = await tools.update_board_element_text.execute!(
      { whiteboard_id: BOARD_ID, element_id: "container-1", expected_element_version: 3, text: "nuevo" },
      { toolCallId: "t1", messages: [] } as never,
    );

    // El modelo recibe de vuelta el MISMO id que pasó (el del contenedor) — nunca necesita el id interno del texto.
    expect(result).toEqual({ ok: true, element_id: "container-1", element_version: 4 });

    const patch = writtenElements();
    const patchedContainer = patch.find((e) => e.id === "container-1")!;
    const patchedLabel = patch.find((e) => e.id === "label-1")!;
    expect(patchedLabel.text).toBe("nuevo");
    expect(patchedLabel.version).toBe(3); // el texto realmente cambió
    expect(patchedContainer.version).toBe(4); // sigue siendo un token de concurrencia válido para "la nota cambió"
    expect(patchedContainer.text).toBeUndefined(); // NUNCA se le añade una propiedad text propia
  });

  it("recibir directamente el id del texto (no el del contenedor) también funciona — lo edita a él mismo", async () => {
    getWhiteboard.mockResolvedValue(board([el("label-1", "text", { version: 2, containerId: "container-1", text: "viejo" })], 1));
    updateWhiteboardSceneCas.mockResolvedValue({ ok: true, data: { result: "updated", version: 2 } });
    const tools = buildBoardTools(ctx, createPendingConfirmationSlot());

    const result = await tools.update_board_element_text.execute!(
      { whiteboard_id: BOARD_ID, element_id: "label-1", expected_element_version: 2, text: "nuevo" },
      { toolCallId: "t1", messages: [] } as never,
    );

    expect(result).toEqual({ ok: true, element_id: "label-1", element_version: 3 });
    expect(writtenElements()[0].text).toBe("nuevo");
  });

  it("un rectangle/ellipse/diamond SIN texto ligado da error claro, nunca le añade una propiedad text", async () => {
    getWhiteboard.mockResolvedValue(board([el("shape-1", "ellipse", { version: 1, boundElements: null })], 1));
    const tools = buildBoardTools(ctx, createPendingConfirmationSlot());

    const result = await tools.update_board_element_text.execute!(
      { whiteboard_id: BOARD_ID, element_id: "shape-1", expected_element_version: 1, text: "x" },
      { toolCallId: "t1", messages: [] } as never,
    );

    expect(result).toEqual({ ok: false, error: expect.stringContaining("no tiene ningún texto") });
    expect(updateWhiteboardSceneCas).not.toHaveBeenCalled();
  });

  it("éxito cuando expected_element_version coincide (elemento de texto suelto)", async () => {
    getWhiteboard.mockResolvedValue(board([el("e1", "text", { text: "viejo", version: 5 })], 1));
    updateWhiteboardSceneCas.mockResolvedValue({ ok: true, data: { result: "updated", version: 2 } });
    const tools = buildBoardTools(ctx, createPendingConfirmationSlot());

    const result = await tools.update_board_element_text.execute!(
      { whiteboard_id: BOARD_ID, element_id: "e1", expected_element_version: 5, text: "nuevo" },
      { toolCallId: "t1", messages: [] } as never,
    );

    expect(result).toEqual({ ok: true, element_id: "e1", element_version: 6 });
    expect(writtenElements()[0].text).toBe("nuevo");
  });

  it("RECHAZA inmediatamente (nunca reintenta) si el MISMO elemento cambió de versión — pide releer", async () => {
    getWhiteboard.mockResolvedValue(board([el("e1", "text", { text: "viejo", version: 9 })], 1));
    const tools = buildBoardTools(ctx, createPendingConfirmationSlot());

    const result = await tools.update_board_element_text.execute!(
      { whiteboard_id: BOARD_ID, element_id: "e1", expected_element_version: 5, text: "nuevo" },
      { toolCallId: "t1", messages: [] } as never,
    );

    expect(result).toEqual({ ok: false, error: expect.stringContaining("Vuelve a listarlo") });
    expect(updateWhiteboardSceneCas).not.toHaveBeenCalled(); // nunca intenta escribir sobre un conflicto conocido
    expect(getWhiteboard).toHaveBeenCalledTimes(1); // sin reintentos
  });

  it("si el conflicto de TABLERO fue por OTRO elemento, relee y reintenta el MISMO parche sobre datos frescos", async () => {
    getWhiteboard
      .mockResolvedValueOnce(board([el("e1", "text", { text: "viejo", version: 5 }), el("other", "rectangle", { version: 1 })], 1))
      .mockResolvedValueOnce(board([el("e1", "text", { text: "viejo", version: 5 }), el("other", "rectangle", { version: 2 })], 2));
    updateWhiteboardSceneCas.mockResolvedValueOnce({ ok: true, data: { result: "conflict" } }).mockResolvedValueOnce({ ok: true, data: { result: "updated", version: 3 } });
    const tools = buildBoardTools(ctx, createPendingConfirmationSlot());

    const result = await tools.update_board_element_text.execute!(
      { whiteboard_id: BOARD_ID, element_id: "e1", expected_element_version: 5, text: "nuevo" },
      { toolCallId: "t1", messages: [] } as never,
    );

    expect(result).toEqual({ ok: true, element_id: "e1", element_version: 6 });
    expect(updateWhiteboardSceneCas).toHaveBeenCalledTimes(2);
  });

  it("elemento inexistente -> error, sin intentar escribir", async () => {
    getWhiteboard.mockResolvedValue(board([], 1));
    const tools = buildBoardTools(ctx, createPendingConfirmationSlot());
    const result = await tools.update_board_element_text.execute!(
      { whiteboard_id: BOARD_ID, element_id: "no-existe", expected_element_version: 1, text: "x" },
      { toolCallId: "t1", messages: [] } as never,
    );
    expect(result).toEqual({ ok: false, error: expect.stringContaining("No encontré ese elemento") });
    expect(updateWhiteboardSceneCas).not.toHaveBeenCalled();
  });
});

describe("move_board_element — revisión correctiva §2: movimiento coherente de la unidad completa", () => {
  it("mueve un elemento suelto: actualiza x/y y sube la versión del elemento", async () => {
    getWhiteboard.mockResolvedValue(board([el("e1", "rectangle", { version: 2, x: 0, y: 0 })], 1));
    updateWhiteboardSceneCas.mockResolvedValue({ ok: true, data: { result: "updated", version: 2 } });
    const tools = buildBoardTools(ctx, createPendingConfirmationSlot());

    const result = await tools.move_board_element.execute!(
      { whiteboard_id: BOARD_ID, element_id: "e1", expected_element_version: 2, x: 500, y: 300 },
      { toolCallId: "t1", messages: [] } as never,
    );

    expect(result).toEqual({ ok: true, element_id: "e1", element_version: 3 });
    expect(writtenElements().find((e) => e.id === "e1")).toMatchObject({ x: 500, y: 300 });
  });

  it("mueve el contenedor: el texto ligado se desplaza EXACTAMENTE el mismo delta, y también sube de versión", async () => {
    getWhiteboard.mockResolvedValue(
      board(
        [
          el("container-1", "rectangle", { version: 1, x: 0, y: 0, width: 220, height: 160, boundElements: [{ id: "label-1", type: "text" }] }),
          el("label-1", "text", { version: 1, x: 110, y: 80, containerId: "container-1" }),
        ],
        1,
      ),
    );
    updateWhiteboardSceneCas.mockResolvedValue({ ok: true, data: { result: "updated", version: 2 } });
    const tools = buildBoardTools(ctx, createPendingConfirmationSlot());

    const result = await tools.move_board_element.execute!(
      { whiteboard_id: BOARD_ID, element_id: "container-1", expected_element_version: 1, x: 300, y: 250 },
      { toolCallId: "t1", messages: [] } as never,
    );

    expect(result).toMatchObject({ ok: true, element_id: "container-1" });
    const patch = writtenElements();
    const patchedContainer = patch.find((e) => e.id === "container-1")!;
    const patchedLabel = patch.find((e) => e.id === "label-1")!;
    expect(patchedContainer).toMatchObject({ x: 300, y: 250 });
    // delta = (300-0, 250-0) = (300, 250) — el mismo delta aplicado al texto ligado.
    expect(patchedLabel).toMatchObject({ x: 410, y: 330 });
    expect(patchedLabel.version).toBe(2); // se movió de verdad, sube de versión
  });

  it("mover un contenedor recoloca la flecha conectada: el extremo unido sigue al contenedor, el otro extremo NO se mueve, bindings intactos", async () => {
    getWhiteboard.mockResolvedValue(
      board(
        [
          el("container-1", "rectangle", { version: 1, x: 0, y: 0, width: 100, height: 100, boundElements: [{ id: "arrow-1", type: "arrow" }] }),
          el("other", "rectangle", { version: 1, x: 500, y: 500, width: 100, height: 100, boundElements: [{ id: "arrow-1", type: "arrow" }] }),
          el("arrow-1", "arrow", {
            version: 1,
            x: 50,
            y: 50,
            points: [
              [0, 0],
              [500, 500],
            ],
            startBinding: { elementId: "container-1", focus: 0, gap: 4 },
            endBinding: { elementId: "other", focus: 0, gap: 4 },
          }),
        ],
        1,
      ),
    );
    updateWhiteboardSceneCas.mockResolvedValue({ ok: true, data: { result: "updated", version: 2 } });
    const tools = buildBoardTools(ctx, createPendingConfirmationSlot());

    await tools.move_board_element.execute!(
      { whiteboard_id: BOARD_ID, element_id: "container-1", expected_element_version: 1, x: 300, y: 300 },
      { toolCallId: "t1", messages: [] } as never,
    );

    const arrow = writtenElements().find((e) => e.id === "arrow-1") as {
      x: number;
      y: number;
      points: [number, number][];
      version: number;
      startBinding: { elementId: string };
      endBinding: { elementId: string };
    };

    // Nuevo centro del contenedor: (300+50, 300+50) = (350, 350).
    expect(arrow.x).toBe(350);
    expect(arrow.y).toBe(350);
    const endAbs: [number, number] = [arrow.x + arrow.points[arrow.points.length - 1][0], arrow.y + arrow.points[arrow.points.length - 1][1]];
    expect(endAbs).toEqual([550, 550]); // el otro extremo (centro de "other") no se mueve
    expect(arrow.version).toBe(2); // la flecha realmente cambió, sube de versión
    // Bindings conservados en ambos extremos — nunca se tocan al mover.
    expect(arrow.startBinding.elementId).toBe("container-1");
    expect(arrow.endBinding.elementId).toBe("other");
  });

  it("nunca permite mover el texto ligado por separado — devuelve una instrucción clara en vez de desincronizarlo", async () => {
    getWhiteboard.mockResolvedValue(
      board(
        [
          el("container-1", "rectangle", { version: 1, boundElements: [{ id: "label-1", type: "text" }] }),
          el("label-1", "text", { version: 1, containerId: "container-1" }),
        ],
        1,
      ),
    );
    const tools = buildBoardTools(ctx, createPendingConfirmationSlot());

    const result = await tools.move_board_element.execute!(
      { whiteboard_id: BOARD_ID, element_id: "label-1", expected_element_version: 1, x: 999, y: 999 },
      { toolCallId: "t1", messages: [] } as never,
    );

    expect(result).toEqual({ ok: false, error: expect.stringContaining("Mueve el contenedor") });
    expect(updateWhiteboardSceneCas).not.toHaveBeenCalled();
  });
});

describe("connect_board_elements", () => {
  it("conecta dos elementos, conserva boundElements existentes de ambos", async () => {
    getWhiteboard.mockResolvedValue(
      board([el("a", "rectangle", { x: 0, y: 0, boundElements: [{ id: "label-a", type: "text" }] }), el("b", "rectangle", { x: 500, y: 0, boundElements: null })], 1),
    );
    updateWhiteboardSceneCas.mockResolvedValue({ ok: true, data: { result: "updated", version: 2 } });
    const tools = buildBoardTools(ctx, createPendingConfirmationSlot());

    const result = await tools.connect_board_elements.execute!({ whiteboard_id: BOARD_ID, source_element_id: "a", target_element_id: "b" }, { toolCallId: "t1", messages: [] } as never);

    expect(result).toMatchObject({ ok: true });
    const patch = writtenElements();
    const patchedA = patch.find((e) => e.id === "a") as { boundElements: { id: string; type: string }[] };
    expect(patchedA.boundElements).toEqual(expect.arrayContaining([{ id: "label-a", type: "text" }]));
    expect(patchedA.boundElements.some((b) => b.type === "arrow")).toBe(true);
    expect(patch.some((e) => e.type === "arrow")).toBe(true);
  });

  it("rechaza conectar un elemento consigo mismo, sin leer nada", async () => {
    const tools = buildBoardTools(ctx, createPendingConfirmationSlot());
    const result = await tools.connect_board_elements.execute!({ whiteboard_id: BOARD_ID, source_element_id: "a", target_element_id: "a" }, { toolCallId: "t1", messages: [] } as never);
    expect(result).toEqual({ ok: false, error: expect.stringContaining("consigo mismo") });
    expect(getWhiteboard).not.toHaveBeenCalled();
  });
});

describe("delete_board_element — SOLO prepara, nunca ejecuta directo", () => {
  it("prepara la confirmación con el payload correcto y NUNCA llama a updateWhiteboardSceneCas", async () => {
    getWhiteboard.mockResolvedValue(board([el("e1", "rectangle", { version: 3, text: "Nota a borrar" })], 1));
    prepareConfirmableAction.mockResolvedValue({ token: "raw-token-xyz", expiresInSeconds: 300, pendingActionId: "pending-1" });
    const slot = createPendingConfirmationSlot();
    const tools = buildBoardTools(ctx, slot);

    const result = await tools.delete_board_element.execute!(
      { whiteboard_id: BOARD_ID, element_id: "e1", expected_element_version: 3 },
      { toolCallId: "t1", messages: [] } as never,
    );

    expect(result).toMatchObject({ ok: true, requiresConfirmation: true });
    expect(JSON.stringify(result)).not.toContain("raw-token-xyz");
    expect(slot.prepared).toMatchObject({ token: "raw-token-xyz" });
    expect(updateWhiteboardSceneCas).not.toHaveBeenCalled();
    expect(prepareConfirmableAction).toHaveBeenCalledWith(
      expect.objectContaining({ actionType: "delete_board_element", payload: { whiteboard_id: BOARD_ID, element_id: "e1", expected_element_version: 3 } }),
    );
    expect(logAudit).toHaveBeenCalledWith(expect.objectContaining({ targetType: "assistant_pending_action", targetId: "pending-1" }));
  });

  it("describe el TEXTO VISIBLE de la nota (no el rectángulo en abstracto) cuando el objetivo es un contenedor con texto ligado", async () => {
    getWhiteboard.mockResolvedValue(
      board(
        [
          el("container-1", "rectangle", { version: 1, boundElements: [{ id: "label-1", type: "text" }] }),
          el("label-1", "text", { version: 1, containerId: "container-1", text: "Comprar leche" }),
        ],
        1,
      ),
    );
    prepareConfirmableAction.mockResolvedValue({ token: "tok", expiresInSeconds: 300, pendingActionId: "pending-1" });
    const tools = buildBoardTools(ctx, createPendingConfirmationSlot());

    const result = await tools.delete_board_element.execute!(
      { whiteboard_id: BOARD_ID, element_id: "container-1", expected_element_version: 1 },
      { toolCallId: "t1", messages: [] } as never,
    );

    expect((result as { summary: string }).summary).toContain("Comprar leche");
  });

  it("respeta el límite de una preparación confirmable por petición", async () => {
    const slot = createPendingConfirmationSlot();
    slot.remaining = 0;
    const tools = buildBoardTools(ctx, slot);
    const result = await tools.delete_board_element.execute!(
      { whiteboard_id: BOARD_ID, element_id: "e1", expected_element_version: 1 },
      { toolCallId: "t1", messages: [] } as never,
    );
    expect(result).toMatchObject({ ok: false });
    expect(prepareConfirmableAction).not.toHaveBeenCalled();
  });

  it("rechaza si expected_element_version no coincide con la versión real leída ahora mismo", async () => {
    getWhiteboard.mockResolvedValue(board([el("e1", "rectangle", { version: 9 })], 1));
    const tools = buildBoardTools(ctx, createPendingConfirmationSlot());
    const result = await tools.delete_board_element.execute!(
      { whiteboard_id: BOARD_ID, element_id: "e1", expected_element_version: 3 },
      { toolCallId: "t1", messages: [] } as never,
    );
    expect(result).toEqual({ ok: false, error: expect.stringContaining("cambió") });
    expect(prepareConfirmableAction).not.toHaveBeenCalled();
  });
});

describe("restore_board_element — revisión correctiva §3: restaura el GRUPO de borrado completo", () => {
  it("restaura un elemento suelto y sube su versión", async () => {
    getWhiteboard.mockResolvedValue(board([el("e1", "rectangle", { version: 4, isDeleted: true })], 1));
    updateWhiteboardSceneCas.mockResolvedValue({ ok: true, data: { result: "updated", version: 2 } });
    const tools = buildBoardTools(ctx, createPendingConfirmationSlot());

    const result = await tools.restore_board_element.execute!({ whiteboard_id: BOARD_ID, element_id: "e1", expected_element_version: 4 }, { toolCallId: "t1", messages: [] } as never);

    expect(result).toEqual({ ok: true, element_id: "e1", element_version: 5 });
    expect(writtenElements()[0].isDeleted).toBe(false);
  });

  it("restaurar el contenedor restaura TAMBIÉN el texto ligado y la flecha del mismo grupo — nunca un elemento de OTRO grupo — y limpia SOLO la clave de restauración", async () => {
    const GROUP = "group-abc";
    getWhiteboard.mockResolvedValue(
      board(
        [
          el("container-1", "rectangle", {
            version: 5,
            isDeleted: true,
            boundElements: [
              { id: "label-1", type: "text" },
              { id: "arrow-1", type: "arrow" },
            ],
            customData: { onyxlinkDeletionGroup: GROUP, miClave: "conservar" },
          }),
          el("label-1", "text", { version: 3, isDeleted: true, containerId: "container-1", customData: { onyxlinkDeletionGroup: GROUP } }),
          el("arrow-1", "arrow", { version: 2, isDeleted: true, startBinding: { elementId: "container-1", focus: 0, gap: 4 }, endBinding: null, customData: { onyxlinkDeletionGroup: GROUP } }),
          el("otro-borrado-antes", "rectangle", { version: 1, isDeleted: true, customData: { onyxlinkDeletionGroup: "otro-grupo-distinto" } }),
        ],
        1,
      ),
    );
    updateWhiteboardSceneCas.mockResolvedValue({ ok: true, data: { result: "updated", version: 2 } });
    const tools = buildBoardTools(ctx, createPendingConfirmationSlot());

    const result = await tools.restore_board_element.execute!(
      { whiteboard_id: BOARD_ID, element_id: "container-1", expected_element_version: 5 },
      { toolCallId: "t1", messages: [] } as never,
    );

    expect(result).toEqual({ ok: true, element_id: "container-1", element_version: 6 });
    const patch = writtenElements();
    const container = patch.find((e) => e.id === "container-1")!;
    const label = patch.find((e) => e.id === "label-1")!;
    const arrow = patch.find((e) => e.id === "arrow-1")!;
    const otro = patch.find((e) => e.id === "otro-borrado-antes")!;

    expect(container.isDeleted).toBe(false);
    expect(label.isDeleted).toBe(false);
    expect(arrow.isDeleted).toBe(false);
    expect(otro.isDeleted).toBe(true); // NUNCA restaura un elemento de otro grupo

    expect((container.customData as Record<string, unknown>).onyxlinkDeletionGroup).toBeUndefined();
    expect((container.customData as Record<string, unknown>).miClave).toBe("conservar"); // otras claves de customData sobreviven
    expect(label.customData).toBeUndefined(); // no tenía más claves — se limpia entero
    expect(arrow.customData).toBeUndefined();
  });

  it("restaurar una flecha borrada recupera sus bindings intactos — nunca se tocaron al borrar", async () => {
    getWhiteboard.mockResolvedValue(
      board(
        [el("arrow-1", "arrow", { version: 4, isDeleted: true, startBinding: { elementId: "a", focus: 0, gap: 4 }, endBinding: { elementId: "b", focus: 0, gap: 4 }, customData: { onyxlinkDeletionGroup: "g1" } })],
        1,
      ),
    );
    updateWhiteboardSceneCas.mockResolvedValue({ ok: true, data: { result: "updated", version: 2 } });
    const tools = buildBoardTools(ctx, createPendingConfirmationSlot());

    await tools.restore_board_element.execute!({ whiteboard_id: BOARD_ID, element_id: "arrow-1", expected_element_version: 4 }, { toolCallId: "t1", messages: [] } as never);

    const arrow = writtenElements().find((e) => e.id === "arrow-1") as { startBinding: { elementId: string }; endBinding: { elementId: string } };
    expect(arrow.startBinding.elementId).toBe("a");
    expect(arrow.endBinding.elementId).toBe("b");
  });

  it("rechaza restaurar un elemento que no está borrado", async () => {
    getWhiteboard.mockResolvedValue(board([el("e1", "rectangle", { version: 1, isDeleted: false })], 1));
    const tools = buildBoardTools(ctx, createPendingConfirmationSlot());
    const result = await tools.restore_board_element.execute!({ whiteboard_id: BOARD_ID, element_id: "e1", expected_element_version: 1 }, { toolCallId: "t1", messages: [] } as never);
    expect(result).toEqual({ ok: false, error: "Ese elemento no está eliminado" });
  });
});

describe("denegación de acceso — assertHelpActionAccess se comprueba en TODAS las tools", () => {
  it("bloquea cuando el plan no incluye whiteboard, sin tocar ninguna capa de datos", async () => {
    assertHelpActionAccess.mockResolvedValue({ ok: false, reason: "plan_not_included" });
    const tools = buildBoardTools(ctx, createPendingConfirmationSlot());
    const result = await tools.add_board_note.execute!({ whiteboard_id: BOARD_ID, text: "x" }, { toolCallId: "t1", messages: [] } as never);
    expect(result).toEqual({ ok: false, error: "denied:plan_not_included" });
    expect(getWhiteboard).not.toHaveBeenCalled();
  });
});
