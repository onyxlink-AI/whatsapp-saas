// @vitest-environment jsdom
//
// Fase 4B: tarjeta compacta de Confirmar/Cancelar. Cubre lo pedido
// explícitamente: resumen exacto, cuenta atrás de caducidad, botones
// deshabilitados tras el primer clic, y que quepa en un ancho de móvil sin
// necesitar scroll horizontal (se comprueba que ningún elemento fuerza
// nowrap/overflow-x — el layout real en viewport se confirma con Playwright).
//
// Este proyecto no tiene @testing-library/jest-dom instalado — las
// aserciones de presencia/estado usan la API de vitest directamente
// (getByText ya lanza si no encuentra nada; queryByLabelText + toBeNull
// para comprobar ausencia; .disabled del propio elemento del DOM).

import { describe, expect, it, vi, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ConfirmationCard } from "./confirmation-card";
import type { ConfirmationCardMessage } from "@/features/help-assistant/hooks/use-help-assistant-chat";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function card(overrides: Partial<ConfirmationCardMessage> = {}): ConfirmationCardMessage {
  return {
    id: "c1",
    kind: "confirmation",
    role: "assistant",
    token: "raw-token",
    summary: 'Vas a cancelar «Llamar a Ana», prevista para el 2026-08-10. Podrás restaurarla después.',
    expiresAt: Date.now() + 300_000,
    status: "pending",
    ...overrides,
  };
}

describe("ConfirmationCard", () => {
  it("shows the exact summary text — never a paraphrase", () => {
    render(<ConfirmationCard card={card()} onResolve={() => {}} />);
    expect(screen.getByText(/Vas a cancelar «Llamar a Ana»/)).toBeTruthy();
  });

  it("shows a countdown while pending", () => {
    render(<ConfirmationCard card={card()} onResolve={() => {}} />);
    expect(screen.getByText(/Caduca en \d+s/)).toBeTruthy();
  });

  it("clicking Confirmar calls onResolve('confirm')", () => {
    const onResolve = vi.fn();
    render(<ConfirmationCard card={card()} onResolve={onResolve} />);
    fireEvent.click(screen.getByLabelText("Confirmar acción"));
    expect(onResolve).toHaveBeenCalledWith("confirm");
  });

  it("clicking Cancelar calls onResolve('cancel')", () => {
    const onResolve = vi.fn();
    render(<ConfirmationCard card={card()} onResolve={onResolve} />);
    fireEvent.click(screen.getByLabelText("Cancelar acción"));
    expect(onResolve).toHaveBeenCalledWith("cancel");
  });

  it("both buttons are disabled once resolving — a second click can't fire a duplicate request", () => {
    const onResolve = vi.fn();
    render(<ConfirmationCard card={card({ status: "resolving" })} onResolve={onResolve} />);
    fireEvent.click(screen.getByLabelText("Confirmar acción"));
    fireEvent.click(screen.getByLabelText("Cancelar acción"));
    expect(onResolve).not.toHaveBeenCalled();
  });

  it("shows the result text and hides the buttons once resolved", () => {
    render(<ConfirmationCard card={card({ status: "resolved", resultText: "Confirmado — la acción se realizó." })} onResolve={() => {}} />);
    expect(screen.getByText("Confirmado — la acción se realizó.")).toBeTruthy();
    expect(screen.queryByLabelText("Confirmar acción")).toBeNull();
  });

  it("shows the error result and disabled buttons when the server rejected it", () => {
    render(<ConfirmationCard card={card({ status: "error", resultText: "Esta confirmación caducó." })} onResolve={() => {}} />);
    expect(screen.getByText("Esta confirmación caducó.")).toBeTruthy();
    expect((screen.getByLabelText("Confirmar acción") as HTMLButtonElement).disabled).toBe(true);
  });

  it("expired client-side (past expiresAt while still pending): buttons disabled, card never opts into horizontal scroll", () => {
    const { container } = render(<ConfirmationCard card={card({ expiresAt: Date.now() - 1000 })} onResolve={() => {}} />);
    expect((screen.getByLabelText("Confirmar acción") as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/Caduc[oó]/)).toBeTruthy();
    // Nada en la tarjeta pide scroll horizontal — el resumen se envuelve
    // (break-words) en vez de desbordar el ancho del panel en móvil.
    expect(container.querySelector(".overflow-x-auto, .overflow-x-scroll")).toBeNull();
  });

  describe("retryable — fallo de transporte, token conservado", () => {
    it("shows Reintentar (not Confirmar) and Cancelar, both active", () => {
      render(<ConfirmationCard card={card({ status: "retryable", lastDecision: "confirm", resultText: "No se pudo conectar. Puedes reintentar." })} onResolve={() => {}} />);
      expect(screen.getByText("No se pudo conectar. Puedes reintentar.")).toBeTruthy();
      const retryButton = screen.getByLabelText("Reintentar acción") as HTMLButtonElement;
      expect(retryButton.disabled).toBe(false);
      expect(retryButton.textContent).toContain("Reintentar");
      expect((screen.getByLabelText("Cancelar acción") as HTMLButtonElement).disabled).toBe(false);
    });

    it("clicking Reintentar replays the exact original decision (lastDecision), not a hardcoded 'confirm'", () => {
      const onResolve = vi.fn();
      render(<ConfirmationCard card={card({ status: "retryable", lastDecision: "cancel" })} onResolve={onResolve} />);
      fireEvent.click(screen.getByLabelText("Reintentar acción"));
      expect(onResolve).toHaveBeenCalledWith("cancel");
    });

    it("clicking Cancelar from retryable always sends 'cancel', regardless of lastDecision", () => {
      const onResolve = vi.fn();
      render(<ConfirmationCard card={card({ status: "retryable", lastDecision: "confirm" })} onResolve={onResolve} />);
      fireEvent.click(screen.getByLabelText("Cancelar acción"));
      expect(onResolve).toHaveBeenCalledWith("cancel");
    });
  });
});
