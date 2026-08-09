// @vitest-environment jsdom
//
// Fase 4B: la tarjeta de confirmación y su resultado son locales —
// use-help-assistant-chat.ts nunca debe reenviarlas al servidor/LLM como si
// fueran texto que el usuario escribió. Esta es la prueba más importante de
// esta fase de UI: confirma que el filtrado de `history` es real, no solo
// una intención en un comentario.

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";

const { useHelpAssistantChat } = await import("./use-help-assistant-chat");

function jsonResponse(body: unknown, status = 200) {
  return Promise.resolve({ ok: status < 400, status, json: async () => body } as Response);
}

let fetchSpy: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchSpy = vi.fn();
  vi.stubGlobal("fetch", fetchSpy);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useHelpAssistantChat — sendMessage", () => {
  it("a reply carrying pendingConfirmation appends a local confirmation card, separate from the text bubble", async () => {
    fetchSpy.mockReturnValueOnce(
      jsonResponse({
        text: "Voy a preparar la cancelación.",
        used: 1,
        limit: 30,
        pendingConfirmation: { token: "raw-token-abc", summary: "Vas a cancelar «X»", expiresInSeconds: 300 },
      }),
    );

    const { result } = renderHook(() => useHelpAssistantChat("ws1"));
    act(() => result.current.sendMessage("cancela la tarea X"));

    await waitFor(() => expect(result.current.messages.some((m) => m.kind === "confirmation")).toBe(true));

    const card = result.current.messages.find((m) => m.kind === "confirmation");
    expect(card).toMatchObject({ kind: "confirmation", token: "raw-token-abc", summary: "Vas a cancelar «X»", status: "pending" });
  });

  it("the raw token from pendingConfirmation is never included in the history sent on the NEXT message", async () => {
    fetchSpy.mockReturnValueOnce(
      jsonResponse({
        text: "Voy a preparar la cancelación.",
        used: 1,
        limit: 30,
        pendingConfirmation: { token: "should-never-leak-into-history", summary: "resumen", expiresInSeconds: 300 },
      }),
    );
    fetchSpy.mockReturnValueOnce(jsonResponse({ text: "ok", used: 2, limit: 30 }));

    const { result } = renderHook(() => useHelpAssistantChat("ws1"));
    act(() => result.current.sendMessage("cancela la tarea X"));
    await waitFor(() => expect(result.current.messages.some((m) => m.kind === "confirmation")).toBe(true));

    act(() => result.current.sendMessage("otro mensaje"));
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(2));

    const secondCallBody = JSON.parse(fetchSpy.mock.calls[1][1].body as string);
    expect(JSON.stringify(secondCallBody.history)).not.toContain("should-never-leak-into-history");
    expect(JSON.stringify(secondCallBody.history)).not.toContain("resumen");
    // El historial solo debe contener los DOS turnos de texto reales.
    expect(secondCallBody.history).toEqual([
      { role: "user", content: "cancela la tarea X" },
      { role: "assistant", content: "Voy a preparar la cancelación." },
    ]);
  });
});

describe("useHelpAssistantChat — resolveConfirmation", () => {
  async function setupWithPendingCard() {
    fetchSpy.mockReturnValueOnce(
      jsonResponse({
        text: "Voy a preparar la cancelación.",
        used: 1,
        limit: 30,
        pendingConfirmation: { token: "raw-token-abc", summary: "resumen", expiresInSeconds: 300 },
      }),
    );
    const { result } = renderHook(() => useHelpAssistantChat("ws1"));
    act(() => result.current.sendMessage("cancela"));
    await waitFor(() => expect(result.current.messages.some((m) => m.kind === "confirmation")).toBe(true));
    const cardId = result.current.messages.find((m) => m.kind === "confirmation")!.id;
    return { result, cardId };
  }

  it("posts to the confirm endpoint with the card's token and the given decision, never through the LLM endpoint", async () => {
    const { result, cardId } = await setupWithPendingCard();
    fetchSpy.mockReturnValueOnce(jsonResponse({ ok: true, code: "executed" }));

    act(() => result.current.resolveConfirmation(cardId, "confirm"));
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(2));

    const [url, init] = fetchSpy.mock.calls[1];
    expect(url).toBe("/api/workspace/ws1/help-assistant/confirm");
    expect(JSON.parse(init.body as string)).toEqual({ token: "raw-token-abc", decision: "confirm" });
  });

  it("marks the card resolved on success and buttons should be considered final (status !== pending)", async () => {
    const { result, cardId } = await setupWithPendingCard();
    fetchSpy.mockReturnValueOnce(jsonResponse({ ok: true, code: "executed" }));

    act(() => result.current.resolveConfirmation(cardId, "confirm"));
    await waitFor(() => {
      const card = result.current.messages.find((m) => m.id === cardId);
      expect(card && "status" in card ? card.status : undefined).toBe("resolved");
    });
  });

  it("marks the card as error (not silently resolved) when the server rejects it, and clears the token — it's a real, deterministic denial", async () => {
    const { result, cardId } = await setupWithPendingCard();
    fetchSpy.mockReturnValueOnce(jsonResponse({ ok: false, code: "expired", error: "Esta confirmación caducó." }, 410));

    act(() => result.current.resolveConfirmation(cardId, "confirm"));
    await waitFor(() => {
      const card = result.current.messages.find((m) => m.id === cardId);
      expect(card && "status" in card ? card.status : undefined).toBe("error");
    });
    const card = result.current.messages.find((m) => m.id === cardId);
    expect(card && "resultText" in card ? card.resultText : undefined).toBe("Esta confirmación caducó.");
    expect(card && "token" in card ? card.token : undefined).toBe("");
  });

  it("is a no-op if the card is already resolving/resolved — never double-posts", async () => {
    const { result, cardId } = await setupWithPendingCard();
    fetchSpy.mockReturnValueOnce(new Promise(() => {})); // never resolves — simulates in-flight

    act(() => result.current.resolveConfirmation(cardId, "confirm"));
    act(() => result.current.resolveConfirmation(cardId, "confirm"));

    expect(fetchSpy).toHaveBeenCalledTimes(2); // 1 sendMessage + 1 resolve (not 2)
  });

  it("a transport error (fetch throws — no HTTP response at all) keeps the token and marks the card retryable, never a dead-end error", async () => {
    const { result, cardId } = await setupWithPendingCard();
    fetchSpy.mockRejectedValueOnce(new TypeError("Failed to fetch"));

    act(() => result.current.resolveConfirmation(cardId, "confirm"));
    await waitFor(() => {
      const card = result.current.messages.find((m) => m.id === cardId);
      expect(card && "status" in card ? card.status : undefined).toBe("retryable");
    });
    const card = result.current.messages.find((m) => m.id === cardId);
    // El token se conserva EXACTAMENTE — la resolución en el servidor es
    // idempotente, así que reintentar con el mismo token es seguro.
    expect(card && "token" in card ? card.token : undefined).toBe("raw-token-abc");
  });

  it("a broken JSON response (connection succeeded but the body is unreadable) is also treated as retryable, token preserved", async () => {
    const { result, cardId } = await setupWithPendingCard();
    fetchSpy.mockReturnValueOnce(Promise.resolve({ ok: true, status: 200, json: async () => { throw new SyntaxError("Unexpected end of JSON input"); } } as unknown as Response));

    act(() => result.current.resolveConfirmation(cardId, "confirm"));
    await waitFor(() => {
      const card = result.current.messages.find((m) => m.id === cardId);
      expect(card && "status" in card ? card.status : undefined).toBe("retryable");
    });
    const card = result.current.messages.find((m) => m.id === cardId);
    expect(card && "token" in card ? card.token : undefined).toBe("raw-token-abc");
  });

  it("retrying from 'retryable' re-POSTs the SAME token and the SAME original decision", async () => {
    const { result, cardId } = await setupWithPendingCard();
    fetchSpy.mockRejectedValueOnce(new TypeError("Failed to fetch"));

    act(() => result.current.resolveConfirmation(cardId, "confirm"));
    await waitFor(() => {
      const card = result.current.messages.find((m) => m.id === cardId);
      expect(card && "status" in card ? card.status : undefined).toBe("retryable");
    });

    fetchSpy.mockReturnValueOnce(jsonResponse({ ok: true, code: "executed" }));
    act(() => result.current.resolveConfirmation(cardId, "confirm"));
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(3)); // sendMessage + failed resolve + retry

    const [, retryInit] = fetchSpy.mock.calls[2];
    expect(JSON.parse(retryInit.body as string)).toEqual({ token: "raw-token-abc", decision: "confirm" });

    await waitFor(() => {
      const card = result.current.messages.find((m) => m.id === cardId);
      expect(card && "status" in card ? card.status : undefined).toBe("resolved");
    });
  });

  it("a reconciled success from the server (already_resolved translated to ok:true by the route) resolves the card normally — no special handling needed client-side", async () => {
    const { result, cardId } = await setupWithPendingCard();
    // La ruta ya traduce un already_resolved reconciliado a ok:true — el
    // hook no necesita saber que fue un reintento, solo ve un éxito normal.
    fetchSpy.mockReturnValueOnce(jsonResponse({ ok: true, code: "executed" }));

    act(() => result.current.resolveConfirmation(cardId, "confirm"));
    await waitFor(() => {
      const card = result.current.messages.find((m) => m.id === cardId);
      expect(card && "status" in card ? card.status : undefined).toBe("resolved");
    });
  });
});
