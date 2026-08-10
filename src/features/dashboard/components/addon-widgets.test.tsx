// @vitest-environment jsdom
// Dashboard navegable — Fase 1: Chat de equipo pendiente → /chat.

import { describe, expect, it, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { AddonWidgets } from "./addon-widgets";

afterEach(() => {
  cleanup();
});

describe("AddonWidgets", () => {
  it("Chat de equipo navega exactamente a /chat", () => {
    render(<AddonWidgets teamChatUnread={3} vapiRecentCalls={null} />);
    const link = screen.getByRole("link", { name: /Chat de equipo/ });
    expect(link.getAttribute("href")).toBe("/chat");
  });

  it("Agente de voz navega exactamente a /asistente-ai", () => {
    render(<AddonWidgets teamChatUnread={null} vapiRecentCalls={2} />);
    const link = screen.getByRole("link", { name: /Agente de voz/ });
    expect(link.getAttribute("href")).toBe("/asistente-ai");
  });

  it("no renderiza nada si ninguno de los dos add-ons está contratado", () => {
    const { container } = render(<AddonWidgets teamChatUnread={null} vapiRecentCalls={null} />);
    expect(container.firstChild).toBeNull();
  });
});
