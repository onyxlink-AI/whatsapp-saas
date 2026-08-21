// @vitest-environment jsdom
//
// TAREA 4B — OperationsBoard. Mockea schedule-actions.ts entero: tanto las
// lecturas propias del tablero (listScheduleBlocks/listScheduleResponsibles)
// como las escrituras que usa ScheduleFormSheet (create/update/delete), ya
// que ambos componentes importan el mismo módulo.

import { describe, expect, it, vi, afterEach, beforeEach } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { OperationsBoard } from "./operations-board";
import type { AgencyScheduleBlockWithResponsible } from "../types";

window.HTMLElement.prototype.scrollIntoView = vi.fn();
window.HTMLElement.prototype.hasPointerCapture = vi.fn(() => false);
window.HTMLElement.prototype.releasePointerCapture = vi.fn();

const listScheduleBlocks = vi.fn();
const listScheduleResponsibles = vi.fn();
const createScheduleBlock = vi.fn();
const updateScheduleBlock = vi.fn();
const deleteScheduleBlock = vi.fn();

vi.mock("../services/schedule-actions", () => ({
  listScheduleBlocks: (...args: unknown[]) => listScheduleBlocks(...args),
  listScheduleResponsibles: (...args: unknown[]) => listScheduleResponsibles(...args),
  createScheduleBlock: (...args: unknown[]) => createScheduleBlock(...args),
  updateScheduleBlock: (...args: unknown[]) => updateScheduleBlock(...args),
  deleteScheduleBlock: (...args: unknown[]) => deleteScheduleBlock(...args),
}));

function makeBlock(overrides: Partial<AgencyScheduleBlockWithResponsible> = {}): AgencyScheduleBlockWithResponsible {
  return {
    id: "block-1",
    weekday: 1,
    hour: 9,
    content: "Reunión de equipo",
    color_key: "teal",
    responsible_id: null,
    created_by: "staff-1",
    updated_by: "staff-1",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    responsible: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  listScheduleResponsibles.mockResolvedValue({ ok: true, data: [] });
});

afterEach(() => {
  cleanup();
});

describe("OperationsBoard — carga inicial", () => {
  it("muestra un estado de carga accesible y luego la cuadrícula con los bloques", async () => {
    let resolveBlocks: (value: { ok: true; data: AgencyScheduleBlockWithResponsible[] }) => void = () => {};
    listScheduleBlocks.mockReturnValue(new Promise((resolve) => (resolveBlocks = resolve)));

    render(<OperationsBoard />);

    expect(screen.getByText("Cargando horario…")).toBeTruthy();
    expect(screen.getByRole("status")).toBeTruthy();

    resolveBlocks({ ok: true, data: [makeBlock()] });

    const desktop = await screen.findByTestId("schedule-grid-desktop");
    expect(within(desktop).getByText("Reunión de equipo")).toBeTruthy();
  });
});

describe("OperationsBoard — error y reintento del horario", () => {
  it("muestra el error y reintenta al pulsar el botón", async () => {
    listScheduleBlocks.mockResolvedValueOnce({ ok: false, error: "Error al cargar el horario" });
    render(<OperationsBoard />);

    await screen.findByText("No se pudo cargar el horario");
    expect(screen.getByText("Error al cargar el horario")).toBeTruthy();
    expect(listScheduleBlocks).toHaveBeenCalledTimes(1);

    listScheduleBlocks.mockResolvedValueOnce({ ok: true, data: [] });
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));

    await waitFor(() => expect(listScheduleBlocks).toHaveBeenCalledTimes(2));
    await screen.findByTestId("schedule-grid-desktop");
  });
});

describe("OperationsBoard — el directorio de responsables es independiente del horario", () => {
  it("si falla el directorio de responsables, el horario sigue usable y aparece un aviso discreto", async () => {
    listScheduleBlocks.mockResolvedValue({ ok: true, data: [] });
    listScheduleResponsibles.mockResolvedValue({ ok: false, error: "Error al cargar el personal interno" });

    render(<OperationsBoard />);

    await screen.findByTestId("schedule-grid-desktop");
    expect(screen.getByText(/No se pudo cargar el directorio de responsables/)).toBeTruthy();
    // El horario en sí no se bloquea por este fallo.
    expect(screen.queryByText("No se pudo cargar el horario")).toBeNull();
  });

  it("sin bloques todavía, muestra la ayuda breve y aun así las 168 celdas", async () => {
    listScheduleBlocks.mockResolvedValue({ ok: true, data: [] });
    render(<OperationsBoard />);

    await screen.findByText("Pulsa una hora para añadir el primer bloque.");
    const desktop = screen.getByTestId("schedule-grid-desktop");
    expect(within(desktop).getAllByRole("button")).toHaveLength(168);
  });
});

describe("OperationsBoard — recarga tras crear, editar o eliminar", () => {
  it("recarga el horario después de crear un bloque nuevo", async () => {
    listScheduleBlocks.mockResolvedValue({ ok: true, data: [] });
    createScheduleBlock.mockResolvedValue({ ok: true, data: { id: "new-1" } });
    render(<OperationsBoard />);

    const desktop = await screen.findByTestId("schedule-grid-desktop");
    fireEvent.click(within(desktop).getByRole("button", { name: "Añadir bloque el lunes de 09:00 a 10:00" }));

    fireEvent.change(await screen.findByLabelText("Actividad o trabajo previsto"), { target: { value: "Nuevo bloque" } });
    fireEvent.click(screen.getByRole("button", { name: "Crear bloque" }));

    await waitFor(() => expect(listScheduleBlocks).toHaveBeenCalledTimes(2));
  });

  it("recarga el horario después de editar un bloque existente", async () => {
    const block = makeBlock();
    listScheduleBlocks.mockResolvedValue({ ok: true, data: [block] });
    updateScheduleBlock.mockResolvedValue({ ok: true, data: { id: block.id } });
    render(<OperationsBoard />);

    const desktop = await screen.findByTestId("schedule-grid-desktop");
    fireEvent.click(within(desktop).getByRole("button", { name: /Editar bloque el lunes de 09:00 a 10:00/ }));

    fireEvent.change(await screen.findByLabelText("Actividad o trabajo previsto"), { target: { value: "Editado" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));

    await waitFor(() => expect(listScheduleBlocks).toHaveBeenCalledTimes(2));
  });

  it("recarga el horario después de eliminar un bloque", async () => {
    const block = makeBlock();
    listScheduleBlocks.mockResolvedValue({ ok: true, data: [block] });
    deleteScheduleBlock.mockResolvedValue({ ok: true, data: null });
    render(<OperationsBoard />);

    const desktop = await screen.findByTestId("schedule-grid-desktop");
    fireEvent.click(within(desktop).getByRole("button", { name: /Editar bloque el lunes de 09:00 a 10:00/ }));

    fireEvent.click(await screen.findByRole("button", { name: "Eliminar bloque" }));
    fireEvent.click(screen.getByRole("button", { name: "Sí, eliminar" }));

    await waitFor(() => expect(listScheduleBlocks).toHaveBeenCalledTimes(2));
  });
});

describe("OperationsBoard — aislamiento de tareas/agenda/calendario", () => {
  it("no llama ninguna función de tareas, agenda o calendario, y no muestra ese texto", async () => {
    listScheduleBlocks.mockResolvedValue({ ok: true, data: [makeBlock()] });
    render(<OperationsBoard />);

    await screen.findByTestId("schedule-grid-desktop");

    expect(document.body.textContent).not.toMatch(/tarea|agenda|google calendar/i);
  });
});
