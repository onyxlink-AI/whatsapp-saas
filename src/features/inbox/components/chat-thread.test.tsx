// @vitest-environment jsdom
//
// Regression test for the cross-conversation stale-state bug: ChatThread is
// rendered without a `key` in inbox/[id]/page.tsx would let React reuse the
// same component instance (and the same useRealtimeMessages internal state)
// across two different conversations, so a message/draft from conversation A
// could still be visible for a render or two after navigating to B. The fix
// is `key={conversation.id}` on <ChatThread> in that page — this test proves
// the fix's mechanism actually works, and fails if the key is removed or an
// equivalent (defective) alternative takes its place.

import { describe, expect, it, vi, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// jsdom doesn't implement scrollIntoView — ChatThread calls it on every
// message-list update purely as a UX nicety, unrelated to what this test
// verifies, so a no-op polyfill is the standard, harmless workaround.
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

const channelStub = {
  on: vi.fn().mockReturnThis(),
  subscribe: vi.fn().mockReturnThis(),
};
const removeChannelSpy = vi.fn();
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    channel: vi.fn(() => channelStub),
    removeChannel: removeChannelSpy,
  }),
}));

vi.mock("./ai-toggle-button", () => ({ AiToggleButton: () => null }));
vi.mock("./window-banner", () => ({ WindowBanner: () => null }));
vi.mock("./template-picker", () => ({ TemplatePicker: () => null }));
vi.mock("./crm-panel", () => ({ CrmPanel: () => null }));
vi.mock("./observability-panel", () => ({ ObservabilityPanel: () => null }));

const { ChatThread } = await import("./chat-thread");

function conversation(id: string, contactName: string) {
  return {
    id,
    contact_id: `contact-${id}`,
    workspace_id: "empresa-a",
    status: "open",
    window_expires_at: null,
    contact: { id: `contact-${id}`, name: contactName, phone: "+52100000000" },
  } as unknown as Parameters<typeof ChatThread>[0]["conversation"];
}

function message(id: string, convId: string, body: string) {
  return {
    id,
    conversation_id: convId,
    direction: "inbound",
    body,
    created_at: "2026-07-28T10:00:00.000Z",
    status: "delivered",
    type: "text",
    meta: {},
  } as unknown as Parameters<typeof ChatThread>[0]["initialMessages"][number];
}

// Mirrors exactly how src/app/(main)/inbox/[id]/page.tsx mounts ChatThread —
// `key={conversation.id}` is the fix under test, applied the same way here.
function InboxThreadSwitcher({
  conv,
  messages,
}: {
  conv: ReturnType<typeof conversation>;
  messages: ReturnType<typeof message>[];
}) {
  return (
    <ChatThread
      key={conv.id}
      conversation={conv}
      initialMessages={messages}
      currentUserId="user-1"
      role="agent"
    />
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("ChatThread — cambio de conversación sin fuga de estado", () => {
  it("A muestra sus propios mensajes", () => {
    const { rerender } = render(
      <InboxThreadSwitcher
        conv={conversation("conv-a", "Cliente A")}
        messages={[message("m1", "conv-a", "Hola desde A")]}
      />,
    );
    expect(screen.getByText("Hola desde A")).toBeTruthy();
    rerender(
      <InboxThreadSwitcher
        conv={conversation("conv-a", "Cliente A")}
        messages={[message("m1", "conv-a", "Hola desde A")]}
      />,
    );
  });

  it("A -> B: ningún mensaje de A aparece en B, ni en el primer render estable", () => {
    const { rerender } = render(
      <InboxThreadSwitcher
        conv={conversation("conv-a", "Cliente A")}
        messages={[message("m1", "conv-a", "Mensaje único de A")]}
      />,
    );
    expect(screen.getByText("Mensaje único de A")).toBeTruthy();

    rerender(
      <InboxThreadSwitcher
        conv={conversation("conv-b", "Cliente B")}
        messages={[message("m2", "conv-b", "Mensaje único de B")]}
      />,
    );

    expect(screen.queryByText("Mensaje único de A")).toBeNull();
    expect(screen.getByText("Mensaje único de B")).toBeTruthy();
  });

  it("B -> A: repite en la otra dirección, sin arrastrar el mensaje de B", () => {
    const { rerender } = render(
      <InboxThreadSwitcher
        conv={conversation("conv-b", "Cliente B")}
        messages={[message("m2", "conv-b", "Solo en B")]}
      />,
    );
    expect(screen.getByText("Solo en B")).toBeTruthy();

    rerender(
      <InboxThreadSwitcher
        conv={conversation("conv-a", "Cliente A")}
        messages={[message("m1", "conv-a", "Solo en A")]}
      />,
    );

    expect(screen.queryByText("Solo en B")).toBeNull();
    expect(screen.getByText("Solo en A")).toBeTruthy();
  });

  it("un borrador escrito en A nunca aparece al entrar a B (el remount por key limpia el estado local)", () => {
    const { rerender } = render(
      <InboxThreadSwitcher
        conv={conversation("conv-a", "Cliente A")}
        messages={[message("m1", "conv-a", "Hola A")]}
      />,
    );
    const textarea = screen.getByLabelText("Mensaje") as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "un borrador sin enviar" } });
    expect(textarea.value).toBe("un borrador sin enviar");

    rerender(
      <InboxThreadSwitcher
        conv={conversation("conv-b", "Cliente B")}
        messages={[message("m2", "conv-b", "Hola B")]}
      />,
    );

    const newTextarea = screen.getByLabelText("Mensaje") as HTMLTextAreaElement;
    expect(newTextarea.value).toBe("");
  });

  it("cada conversación limpia su canal realtime anterior al desmontar (sin fugas de suscripción)", () => {
    const { rerender } = render(
      <InboxThreadSwitcher
        conv={conversation("conv-a", "Cliente A")}
        messages={[message("m1", "conv-a", "Hola A")]}
      />,
    );
    rerender(
      <InboxThreadSwitcher
        conv={conversation("conv-b", "Cliente B")}
        messages={[message("m2", "conv-b", "Hola B")]}
      />,
    );
    expect(removeChannelSpy).toHaveBeenCalled();
  });
});

describe("Guardia estática del fix real (inbox/[id]/page.tsx)", () => {
  it("la página real sigue montando <ChatThread key={conversation.id} ...> — si se elimina, esta prueba debe fallar", () => {
    const pagePath = resolve(process.cwd(), "src/app/(main)/inbox/[id]/page.tsx");
    const source = readFileSync(pagePath, "utf8");
    const chatThreadBlock = source.slice(source.indexOf("<ChatThread"), source.indexOf("<ChatThread") + 200);
    expect(chatThreadBlock).toMatch(/key=\{conversation\.id\}/);
  });
});
