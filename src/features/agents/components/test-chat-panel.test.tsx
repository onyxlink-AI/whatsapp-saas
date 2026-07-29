// @vitest-environment jsdom
//
// Regression test for the stale-closure bug found in the E2E production-
// polish audit: `send` (a useCallback wrapping sendMessage) omitted
// `agent.id`/`workspaceId` from its dependency array. TestChatPanel is
// mounted WITHOUT a per-agent key in src/features/reminders/components/
// reminder-simulator.tsx, so switching the active agent there reuses the
// same component instance — before the fix, a message sent right after
// switching agents could still POST to the PREVIOUS agent's test-chat
// endpoint. The fix added `agent.id, workspaceId` to `send`'s deps.

import { describe, expect, it, vi, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { AgentDto } from "@/features/agents/types";

if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}

const { TestChatPanel } = await import("./test-chat-panel");

function agent(id: string, name: string): AgentDto {
  return {
    id,
    type: "setter",
    name,
    avatarKey: "setter",
    model: "openrouter/auto",
    isActive: true,
    promptId: "prompt-1",
    promptBody: "Eres un agente de prueba.",
    promptGuardrails: null,
    config: {},
  } as AgentDto;
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("TestChatPanel — cambio de agente/workspace sin desmontar", () => {
  it("el primer mensaje se envía al agente y workspace montados inicialmente", async () => {
    const fetchSpy = vi.fn((url: string) => {
      if (String(url).includes("/business-info")) {
        return Promise.resolve({ json: async () => ({ data: null }) });
      }
      return Promise.resolve({ ok: true, json: async () => ({ text: "Respuesta A" }) });
    });
    vi.stubGlobal("fetch", fetchSpy as unknown as typeof fetch);

    render(<TestChatPanel workspaceId="empresa-a" agent={agent("agent-a", "Sofía")} />);

    const textarea = await screen.findByPlaceholderText("Escribe un mensaje de prueba...");
    fireEvent.change(textarea, { target: { value: "Hola" } });
    fireEvent.click(screen.getByLabelText("Enviar mensaje de prueba"));

    await vi.waitFor(() => {
      const testChatCall = fetchSpy.mock.calls.find(([url]) => String(url).includes("/test-chat"));
      expect(testChatCall).toBeTruthy();
    });

    const [url] = fetchSpy.mock.calls.find(([u]) => String(u).includes("/test-chat"))!;
    expect(url).toBe("/api/workspace/empresa-a/agents/agent-a/test-chat");

    vi.unstubAllGlobals();
  });

  it("tras reutilizar el mismo componente con Agente B/workspace B SIN volver a tocar el input, el envío usa EXCLUSIVAMENTE los nuevos valores — nunca el closure anterior", async () => {
    // This is the exact condition that exposes a stale useCallback closure:
    // the user types a message, then (elsewhere in the real app) the active
    // agent changes — e.g. reminder-simulator.tsx re-renders TestChatPanel
    // with a new `activeAgent` prop with NO key, so the panel is reused, not
    // remounted — and only THEN does the user click send, without touching
    // the input again. If `send`'s useCallback deps don't include
    // `agent.id`/`workspaceId`, none of its OTHER deps (input/loading/
    // messages) changed between the prop swap and the click, so React
    // reuses the stale memoized callback — which closes over the PREVIOUS
    // render's sendMessage, i.e. the previous agent/workspace.
    const fetchSpy = vi.fn((url: string) => {
      if (String(url).includes("/business-info")) {
        return Promise.resolve({ json: async () => ({ data: null }) });
      }
      return Promise.resolve({ ok: true, json: async () => ({ text: "Respuesta" }) });
    });
    vi.stubGlobal("fetch", fetchSpy as unknown as typeof fetch);

    const { rerender } = render(
      <TestChatPanel workspaceId="empresa-a" agent={agent("agent-a", "Sofía")} />,
    );

    const textarea = await screen.findByPlaceholderText("Escribe un mensaje de prueba...");
    fireEvent.change(textarea, { target: { value: "Mensaje escrito antes del cambio de agente" } });

    // Reused WITHOUT unmounting and WITHOUT touching the input again —
    // exactly how reminder-simulator.tsx renders TestChatPanel without a
    // per-agent key when the active agent changes underneath it.
    rerender(<TestChatPanel workspaceId="empresa-b" agent={agent("agent-b", "Andrés")} />);

    fireEvent.click(screen.getByLabelText("Enviar mensaje de prueba"));

    await vi.waitFor(() => {
      const testChatCall = fetchSpy.mock.calls.find(([u]) => String(u).includes("/test-chat"));
      expect(testChatCall).toBeTruthy();
    });

    const [url] = fetchSpy.mock.calls.find(([u]) => String(u).includes("/test-chat"))!;
    expect(url).toBe("/api/workspace/empresa-b/agents/agent-b/test-chat");
    expect(url).not.toContain("empresa-a");
    expect(url).not.toContain("agent-a");

    vi.unstubAllGlobals();
  });
});
