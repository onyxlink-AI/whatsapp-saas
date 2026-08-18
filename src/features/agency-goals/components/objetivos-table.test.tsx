// @vitest-environment jsdom
//
// TAREA 2, categoría 6 — estado vacío y confirmación antes de eliminar. El
// patrón de confirmación es el mismo de dos pasos en línea que ya usa
// workspaces-table.tsx (clic en papelera -> aparecen "Eliminar"/cancelar en
// el sitio, sin modal) — aquí se prueba que onDelete SOLO se llama tras el
// segundo clic, nunca con el primero.

import { describe, expect, it, vi, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { ObjetivosTable } from "./objetivos-table";
import type { AgencyGoalWithOwner } from "../types";

afterEach(() => {
  cleanup();
});

const goal: AgencyGoalWithOwner = {
  id: "11111111-1111-4111-8111-111111111111",
  title: "Cerrar 10 clientes nuevos",
  description: null,
  period_type: "annual",
  period_start: "2026-01-01",
  period_end: "2026-12-31",
  owner_id: null,
  status: "pending",
  progress: 20,
  created_by: "creador",
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  owner: null,
};

const noop = () => {};

describe("ObjetivosTable — estado vacío", () => {
  it("muestra el mensaje de vacío cuando no hay objetivos en el periodo", () => {
    render(<ObjetivosTable goals={[]} loading={false} error={null} onEdit={noop} onDelete={noop} onStatusChange={noop} deletingId={null} />);
    expect(screen.getByText(/Todavía no hay objetivos en este periodo/)).toBeTruthy();
  });

  it("muestra el mensaje de error cuando falla la carga", () => {
    render(<ObjetivosTable goals={[]} loading={false} error="fallo de red" onEdit={noop} onDelete={noop} onStatusChange={noop} deletingId={null} />);
    expect(screen.getByText(/No se pudieron cargar los objetivos/)).toBeTruthy();
  });
});

describe("ObjetivosTable — confirmación de borrado en dos pasos", () => {
  // Se ancla a la fila real de la tabla de escritorio (role="row") para no
  // ambigüar con la tarjeta móvil equivalente, que también se monta en el
  // DOM en jsdom (las clases hidden/md:block no aplican sin CSS real).
  function desktopRow() {
    return screen.getAllByRole("row")[1] as HTMLElement;
  }

  it("el primer clic NO elimina, solo muestra confirmar/cancelar; el segundo clic sí elimina", () => {
    const onDelete = vi.fn();
    render(<ObjetivosTable goals={[goal]} loading={false} error={null} onEdit={noop} onDelete={onDelete} onStatusChange={noop} deletingId={null} />);

    fireEvent.click(within(desktopRow()).getByRole("button", { name: /Eliminar «/ }));
    expect(onDelete).not.toHaveBeenCalled();

    fireEvent.click(within(desktopRow()).getByRole("button", { name: "Eliminar" }));
    expect(onDelete).toHaveBeenCalledWith(goal.id);
  });

  it("cancelar la confirmación no elimina", () => {
    const onDelete = vi.fn();
    render(<ObjetivosTable goals={[goal]} loading={false} error={null} onEdit={noop} onDelete={onDelete} onStatusChange={noop} deletingId={null} />);

    fireEvent.click(within(desktopRow()).getByRole("button", { name: /Eliminar «/ }));

    const buttonsAfterConfirming = within(desktopRow()).getAllByRole("button");
    const cancelButton = buttonsAfterConfirming.find((b) => b.textContent?.trim() === "");
    expect(cancelButton).toBeTruthy();
    if (cancelButton) fireEvent.click(cancelButton);

    expect(onDelete).not.toHaveBeenCalled();
    // Sigue en modo confirmación normal (los dos botones de siempre), no eliminado.
    expect(within(desktopRow()).getByRole("button", { name: /Eliminar «/ })).toBeTruthy();
  });
});
