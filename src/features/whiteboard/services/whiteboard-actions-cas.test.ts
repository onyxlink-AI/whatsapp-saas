// Fase 4C — updateWhiteboardSceneCas: valida el payload (solo `elements`),
// precomprueba el tamaño antes de tocar la BD, y delega el resto a
// update_whiteboard_scene_cas() vía RPC — nunca un UPDATE directo.
//
// Revisión correctiva §4: updateWhiteboardSceneCas ya NO acepta
// {elements, appState} — solo un array de elementos, para que nunca pueda
// pisar con una copia vieja un appState más fresco (ver
// updateWhiteboardAppState, cubierta en el segundo describe de este
// archivo).

import { describe, it, expect, vi, beforeEach } from "vitest";
import { MAX_SCENE_BYTES, MAX_APP_STATE_BYTES } from "./scene-adapter";

const getUser = vi.fn();
let rpcResult: { data: unknown; error: unknown } = { data: null, error: null };
const rpcCalls: { name: string; args: unknown }[] = [];

const sessionClient = {
  auth: { getUser: (...a: unknown[]) => getUser(...a) },
  rpc: (name: string, args: unknown) => {
    rpcCalls.push({ name, args });
    return Promise.resolve(rpcResult);
  },
};
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => sessionClient }));

const { updateWhiteboardSceneCas, updateWhiteboardAppState } = await import("./whiteboard-actions");

const WORKSPACE_A = "11111111-1111-4111-8111-111111111111";
const BOARD_ID = "99999999-9999-4999-8999-999999999999";
const USER_ID = "33333333-3333-4333-8333-333333333333";

beforeEach(() => {
  vi.clearAllMocks();
  rpcCalls.length = 0;
  rpcResult = { data: { result: "updated", version: 2 }, error: null };
  getUser.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null });
});

describe("updateWhiteboardSceneCas", () => {
  it("llama a update_whiteboard_scene_cas con workspace_id, whiteboard_id, expected_version y p_elements (solo el array, nunca appState)", async () => {
    const elements = [{ id: "a", type: "rectangle" }];
    const result = await updateWhiteboardSceneCas(WORKSPACE_A, BOARD_ID, 3, elements);

    expect(result).toEqual({ ok: true, data: { result: "updated", version: 2 } });
    expect(rpcCalls).toHaveLength(1);
    expect(rpcCalls[0].name).toBe("update_whiteboard_scene_cas");
    expect(rpcCalls[0].args).toEqual({
      p_workspace_id: WORKSPACE_A,
      p_whiteboard_id: BOARD_ID,
      p_expected_version: 3,
      p_elements: elements,
    });
  });

  it("rechaza sin sesión, nunca llega a la RPC", async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: null });
    const result = await updateWhiteboardSceneCas(WORKSPACE_A, BOARD_ID, 1, []);
    expect(result).toEqual({ ok: false, error: "No autorizado" });
    expect(rpcCalls).toHaveLength(0);
  });

  it("rechaza elements mal formado con Zod, nunca llega a la RPC", async () => {
    const result = await updateWhiteboardSceneCas(WORKSPACE_A, BOARD_ID, 1, "not-an-array" as never);
    expect(result.ok).toBe(false);
    expect(rpcCalls).toHaveLength(0);
  });

  it("scene_too_large se detecta ANTES de llamar a la RPC (precomprobación rápida por tamaño)", async () => {
    const hugeText = "x".repeat(MAX_SCENE_BYTES + 1000);
    const result = await updateWhiteboardSceneCas(WORKSPACE_A, BOARD_ID, 1, [{ id: "a", type: "text", text: hugeText }]);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.result).toBe("scene_too_large");
    }
    expect(rpcCalls).toHaveLength(0);
  });

  it("un error de RPC nunca se confunde con un resultado estructurado válido", async () => {
    rpcResult = { data: null, error: { message: "connection reset" } };
    const result = await updateWhiteboardSceneCas(WORKSPACE_A, BOARD_ID, 1, []);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).not.toContain("connection reset");
    }
  });

  it("propaga el resultado 'conflict' tal cual, sin reinterpretarlo", async () => {
    rpcResult = { data: { result: "conflict" }, error: null };
    const result = await updateWhiteboardSceneCas(WORKSPACE_A, BOARD_ID, 1, []);
    expect(result).toEqual({ ok: true, data: { result: "conflict" } });
  });

  it("propaga el resultado 'not_found_or_forbidden' tal cual", async () => {
    rpcResult = { data: { result: "not_found_or_forbidden" }, error: null };
    const result = await updateWhiteboardSceneCas(WORKSPACE_A, BOARD_ID, 1, []);
    expect(result).toEqual({ ok: true, data: { result: "not_found_or_forbidden" } });
  });
});

describe("updateWhiteboardAppState", () => {
  it("llama a update_whiteboard_app_state con workspace_id, whiteboard_id y p_app_state — sin expected_version, nunca toca elements", async () => {
    rpcResult = { data: { result: "updated" }, error: null };
    const appState = { zoom: { value: 1.5 }, scrollX: 10, scrollY: -20 };
    const result = await updateWhiteboardAppState(WORKSPACE_A, BOARD_ID, appState);

    expect(result).toEqual({ ok: true, data: { result: "updated" } });
    expect(rpcCalls).toHaveLength(1);
    expect(rpcCalls[0].name).toBe("update_whiteboard_app_state");
    expect(rpcCalls[0].args).toEqual({
      p_workspace_id: WORKSPACE_A,
      p_whiteboard_id: BOARD_ID,
      p_app_state: appState,
    });
  });

  it("rechaza sin sesión, nunca llega a la RPC", async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: null });
    const result = await updateWhiteboardAppState(WORKSPACE_A, BOARD_ID, { zoom: { value: 1 } });
    expect(result).toEqual({ ok: false, error: "No autorizado" });
    expect(rpcCalls).toHaveLength(0);
  });

  it("rechaza una clave fuera de la whitelist de pickPersistableAppState, nunca llega a la RPC", async () => {
    const result = await updateWhiteboardAppState(WORKSPACE_A, BOARD_ID, {
      zoom: { value: 1 },
      selectedElementIds: { "elem-1": true },
    });
    expect(result.ok).toBe(false);
    expect(rpcCalls).toHaveLength(0);
  });

  it("scene_too_large se detecta ANTES de llamar a la RPC", async () => {
    const result = await updateWhiteboardAppState(WORKSPACE_A, BOARD_ID, {
      viewBackgroundColor: "x".repeat(MAX_APP_STATE_BYTES + 100),
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.result).toBe("scene_too_large");
    }
    expect(rpcCalls).toHaveLength(0);
  });

  it("propaga 'not_found_or_forbidden' tal cual", async () => {
    rpcResult = { data: { result: "not_found_or_forbidden" }, error: null };
    const result = await updateWhiteboardAppState(WORKSPACE_A, BOARD_ID, { zoom: { value: 1 } });
    expect(result).toEqual({ ok: true, data: { result: "not_found_or_forbidden" } });
  });

  it("un error de RPC nunca se confunde con un resultado estructurado válido", async () => {
    rpcResult = { data: null, error: { message: "connection reset" } };
    const result = await updateWhiteboardAppState(WORKSPACE_A, BOARD_ID, { zoom: { value: 1 } });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).not.toContain("connection reset");
    }
  });
});
