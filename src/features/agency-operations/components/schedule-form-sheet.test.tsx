// @vitest-environment jsdom
//
// TAREA 4B — ScheduleFormSheet. Radix Select necesita `scrollIntoView` y
// `hasPointerCapture` en el prototipo de HTMLElement, que jsdom no
// implementa — se parchean una única vez al cargar este archivo, antes de
// cualquier render. La apertura del combobox y la selección de una opción
// se hacen con `fireEvent.click` (Radix Select confirma selección con
// onClick, no solo con eventos de puntero), igual que el resto de la suite
// usa `fireEvent` en vez de userEvent (no hay @testing-library/user-event
// instalado en este proyecto).
//
// Este proyecto tampoco tiene @testing-library/jest-dom instalado — las
// aserciones de presencia/estado usan la API de vitest directamente
// (getByText ya lanza si no encuentra nada; queryBy + toBeNull para
// comprobar ausencia; .disabled/.value/.className/.getAttribute del propio
// elemento del DOM), mismo patrón que confirmation-card.test.tsx.

import { describe, expect, it, vi, afterEach, beforeEach } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ScheduleFormSheet } from "./schedule-form-sheet";
import { CONTENT_MAX_LENGTH } from "../services/schedule-schemas";
import type { AgencyScheduleBlockWithResponsible, AgencyScheduleResponsible, ResponsiblesDirectoryState } from "../types";

window.HTMLElement.prototype.scrollIntoView = vi.fn();
window.HTMLElement.prototype.hasPointerCapture = vi.fn(() => false);
window.HTMLElement.prototype.releasePointerCapture = vi.fn();

const createScheduleBlock = vi.fn();
const updateScheduleBlock = vi.fn();
const deleteScheduleBlock = vi.fn();

vi.mock("../services/schedule-actions", () => ({
  createScheduleBlock: (...args: unknown[]) => createScheduleBlock(...args),
  updateScheduleBlock: (...args: unknown[]) => updateScheduleBlock(...args),
  deleteScheduleBlock: (...args: unknown[]) => deleteScheduleBlock(...args),
}));

const RESPONSIBLES: AgencyScheduleResponsible[] = [
  { id: "r1", full_name: "Ana García" },
  { id: "r2", full_name: "Luis Pérez" },
];
const READY_DIRECTORY: ResponsiblesDirectoryState = { status: "ready", responsibles: RESPONSIBLES };
const LOADING_DIRECTORY: ResponsiblesDirectoryState = { status: "loading" };
const ERROR_DIRECTORY: ResponsiblesDirectoryState = { status: "error", error: "Error al cargar el personal interno" };

function makeBlock(overrides: Partial<AgencyScheduleBlockWithResponsible> = {}): AgencyScheduleBlockWithResponsible {
  return {
    id: "block-1",
    weekday: 5,
    hour: 16,
    content: "Contenido original",
    color_key: "blue",
    responsible_id: "r1",
    created_by: "r1",
    updated_by: "r1",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    responsible: { id: "r1", full_name: "Ana García" },
    ...overrides,
  };
}

function renderSheet(overrides: Partial<React.ComponentProps<typeof ScheduleFormSheet>> = {}) {
  const onOpenChange = vi.fn();
  const onSaved = vi.fn();
  const onDeleted = vi.fn();
  render(
    <ScheduleFormSheet
      open
      onOpenChange={onOpenChange}
      block={null}
      initialWeekday={3}
      initialHour={14}
      responsiblesDirectory={READY_DIRECTORY}
      onSaved={onSaved}
      onDeleted={onDeleted}
      {...overrides}
    />,
  );
  return { onOpenChange, onSaved, onDeleted };
}

function saveButton() {
  return screen.getByRole("button", { name: /Crear bloque|Guardar cambios|Guardando/ }) as HTMLButtonElement;
}

async function selectOption(comboboxName: string, optionName: string) {
  fireEvent.click(screen.getByRole("combobox", { name: comboboxName }));
  fireEvent.click(await screen.findByRole("option", { name: optionName }));
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
});

describe("ScheduleFormSheet — creación", () => {
  it("precarga día/hora de la celda pulsada, color teal y responsable sin asignar", () => {
    renderSheet({ initialWeekday: 3, initialHour: 14 });
    expect(screen.getByRole("combobox", { name: "Día" }).textContent).toContain("Miércoles");
    expect(screen.getByRole("combobox", { name: "Hora" }).textContent).toContain("14:00–15:00");
    expect(screen.getByRole("button", { name: /Verde azulado/ }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("combobox", { name: "Responsable (opcional)" }).textContent).toContain("Sin asignar");
  });

  it("el botón de guardar está deshabilitado con contenido vacío o solo espacios, y se habilita con contenido real", () => {
    renderSheet();
    expect(saveButton().disabled).toBe(true);

    fireEvent.change(screen.getByLabelText("Actividad o trabajo previsto"), { target: { value: "   " } });
    expect(saveButton().disabled).toBe(true);

    fireEvent.change(screen.getByLabelText("Actividad o trabajo previsto"), { target: { value: "Atención a clientes" } });
    expect(saveButton().disabled).toBe(false);
  });

  it("el contador de caracteres refleja la longitud y el contenido queda limitado a 500", () => {
    renderSheet();
    const textarea = screen.getByLabelText("Actividad o trabajo previsto") as HTMLTextAreaElement;

    fireEvent.change(textarea, { target: { value: "a".repeat(600) } });

    expect(textarea.value).toHaveLength(CONTENT_MAX_LENGTH);
    expect(screen.getByText(`${CONTENT_MAX_LENGTH}/${CONTENT_MAX_LENGTH}`)).toBeTruthy();
  });

  it("envía a createScheduleBlock exactamente el payload esperado (sin responsable)", async () => {
    createScheduleBlock.mockResolvedValue({ ok: true, data: { id: "new-block" } });
    const { onSaved, onOpenChange } = renderSheet({ initialWeekday: 3, initialHour: 14 });

    fireEvent.change(screen.getByLabelText("Actividad o trabajo previsto"), { target: { value: "Revisión de propuestas" } });
    fireEvent.click(saveButton());

    await screen.findByRole("button", { name: "Crear bloque" });
    expect(createScheduleBlock).toHaveBeenCalledWith({
      weekday: 3,
      hour: 14,
      content: "Revisión de propuestas",
      color_key: "teal",
      responsible_id: null,
    });
    expect(onSaved).toHaveBeenCalledTimes(1);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("no cierra el sheet ni llama a onSaved cuando la Server Action devuelve error (p. ej. celda ocupada)", async () => {
    createScheduleBlock.mockResolvedValue({ ok: false, error: "Ya existe un bloque de horario para ese día y esa hora" });
    const { onSaved, onOpenChange } = renderSheet();

    fireEvent.change(screen.getByLabelText("Actividad o trabajo previsto"), { target: { value: "Contenido" } });
    fireEvent.click(saveButton());

    await screen.findByRole("button", { name: "Crear bloque" });
    expect(onSaved).not.toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });
});

describe("ScheduleFormSheet — edición", () => {
  it("precarga todos los valores existentes del bloque", () => {
    const block = makeBlock();
    renderSheet({ block, initialWeekday: block.weekday, initialHour: block.hour });

    expect(screen.getByRole("combobox", { name: "Día" }).textContent).toContain("Viernes");
    expect(screen.getByRole("combobox", { name: "Hora" }).textContent).toContain("16:00–17:00");
    expect((screen.getByLabelText("Actividad o trabajo previsto") as HTMLTextAreaElement).value).toBe("Contenido original");
    expect(screen.getByRole("button", { name: /Azul/ }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("combobox", { name: "Responsable (opcional)" }).textContent).toContain("Ana García");
  });

  it("envía a updateScheduleBlock el id del bloque y el payload exacto tras cambiar solo el contenido", async () => {
    updateScheduleBlock.mockResolvedValue({ ok: true, data: { id: "block-1" } });
    const block = makeBlock();
    const { onSaved } = renderSheet({ block, initialWeekday: block.weekday, initialHour: block.hour });

    fireEvent.change(screen.getByLabelText("Actividad o trabajo previsto"), { target: { value: "Contenido editado" } });
    fireEvent.click(saveButton());

    await screen.findByRole("button", { name: "Guardar cambios" });
    expect(updateScheduleBlock).toHaveBeenCalledWith("block-1", {
      weekday: 5,
      hour: 16,
      content: "Contenido editado",
      color_key: "blue",
      responsible_id: "r1",
    });
    expect(onSaved).toHaveBeenCalledTimes(1);
  });

  it("permite mover el bloque a otro día/hora", async () => {
    updateScheduleBlock.mockResolvedValue({ ok: true, data: { id: "block-1" } });
    const block = makeBlock();
    renderSheet({ block, initialWeekday: block.weekday, initialHour: block.hour });

    await selectOption("Día", "Lunes");
    await selectOption("Hora", "08:00–09:00");
    fireEvent.click(saveButton());

    await screen.findByRole("button", { name: "Guardar cambios" });
    expect(updateScheduleBlock).toHaveBeenCalledWith("block-1", expect.objectContaining({ weekday: 1, hour: 8 }));
  });

  it("responsable histórico (directorio 'ready', ya no está en la lista activa): se conserva, aparece marcado como inactivo y se puede guardar sin tocarlo", async () => {
    updateScheduleBlock.mockResolvedValue({ ok: true, data: { id: "block-1" } });
    const block = makeBlock({ responsible_id: "historico-1", responsible: { id: "historico-1", full_name: "Persona Histórica" } });
    const { onSaved } = renderSheet({ block, initialWeekday: block.weekday, initialHour: block.hour, responsiblesDirectory: READY_DIRECTORY });

    // El directorio YA terminó de cargar y esa persona no está: se puede
    // afirmar con certeza que está inactiva.
    expect(screen.getByRole("combobox", { name: "Responsable (opcional)" }).textContent).toContain("Persona Histórica · Histórico (inactivo)");

    // Guardar SIN tocar el responsable conserva el mismo responsible_id —
    // TAREA 4A.1 en el servidor no exige que siga activo si no cambia.
    fireEvent.change(screen.getByLabelText("Actividad o trabajo previsto"), { target: { value: "Otro contenido" } });
    fireEvent.click(saveButton());

    await screen.findByRole("button", { name: "Guardar cambios" });
    expect(updateScheduleBlock).toHaveBeenCalledWith("block-1", expect.objectContaining({ responsible_id: "historico-1" }));
    expect(onSaved).toHaveBeenCalledTimes(1);
  });

  it("el responsable histórico/actual de un bloque nunca aparece como opción al crear uno nuevo ni al editar otro bloque distinto", async () => {
    // Editando OTRO bloque (sin ese responsable histórico): la opción no debe existir.
    const otherBlock = makeBlock({ id: "block-2", responsible_id: "r2", responsible: { id: "r2", full_name: "Luis Pérez" } });
    renderSheet({ block: otherBlock, initialWeekday: otherBlock.weekday, initialHour: otherBlock.hour });
    fireEvent.click(screen.getByRole("combobox", { name: "Responsable (opcional)" }));
    expect(await screen.findByRole("option", { name: "Sin asignar" })).toBeTruthy();
    expect(screen.queryByText(/Persona Histórica/)).toBeNull();

    cleanup();

    // Creando un bloque nuevo: tampoco debe existir.
    renderSheet({ block: null });
    fireEvent.click(screen.getByRole("combobox", { name: "Responsable (opcional)" }));
    expect(await screen.findByRole("option", { name: "Sin asignar" })).toBeTruthy();
    expect(screen.queryByText(/Persona Histórica/)).toBeNull();
  });

  // ──────────────────────────────────────────────────────────────────────
  // TAREA 4B.1 — estado REAL del directorio (loading/ready/error) pasado a
  // ScheduleFormSheet: mientras no esté "ready", nunca se afirma que un
  // responsable ausente está inactivo — solo que es la asignación actual.
  // ──────────────────────────────────────────────────────────────────────
  describe("TAREA 4B.1 — estado real del directorio de responsables", () => {
    const blockWithMissingResponsible = () =>
      makeBlock({ responsible_id: "away-1", responsible: { id: "away-1", full_name: "Persona Ausente" } });

    it.each([
      ["error", ERROR_DIRECTORY],
      ["loading", LOADING_DIRECTORY],
    ])("directorio en %s con un bloque que tiene responsable actual: se conserva marcado como 'Asignación actual', nunca 'inactivo'", (_label, directory) => {
      const block = blockWithMissingResponsible();
      renderSheet({ block, initialWeekday: block.weekday, initialHour: block.hour, responsiblesDirectory: directory });

      const combobox = screen.getByRole("combobox", { name: "Responsable (opcional)" });
      expect(combobox.textContent).toContain("Persona Ausente · Asignación actual");
      expect(combobox.textContent).not.toContain("inactivo");
      expect(combobox.textContent).not.toContain("Histórico");
    });

    it.each([
      ["error", ERROR_DIRECTORY],
      ["loading", LOADING_DIRECTORY],
    ])("mientras el directorio está en %s, guardar sin tocar el responsable conserva su responsible_id", async (_label, directory) => {
      updateScheduleBlock.mockResolvedValue({ ok: true, data: { id: "block-1" } });
      const block = blockWithMissingResponsible();
      renderSheet({ block, initialWeekday: block.weekday, initialHour: block.hour, responsiblesDirectory: directory });

      fireEvent.change(screen.getByLabelText("Actividad o trabajo previsto"), { target: { value: "Contenido sin cambiar responsable" } });
      fireEvent.click(saveButton());

      await screen.findByRole("button", { name: "Guardar cambios" });
      expect(updateScheduleBlock).toHaveBeenCalledWith("block-1", expect.objectContaining({ responsible_id: "away-1" }));
    });

    it("la etiqueta 'Histórico (inactivo)' solo aparece cuando el directorio terminó correctamente ('ready'), nunca durante loading/error", () => {
      const block = blockWithMissingResponsible();

      const { unmount } = render(
        <ScheduleFormSheet
          open
          onOpenChange={vi.fn()}
          block={block}
          initialWeekday={block.weekday}
          initialHour={block.hour}
          responsiblesDirectory={LOADING_DIRECTORY}
          onSaved={vi.fn()}
          onDeleted={vi.fn()}
        />,
      );
      expect(screen.getByRole("combobox", { name: "Responsable (opcional)" }).textContent).toContain("Asignación actual");
      unmount();

      render(
        <ScheduleFormSheet
          open
          onOpenChange={vi.fn()}
          block={block}
          initialWeekday={block.weekday}
          initialHour={block.hour}
          responsiblesDirectory={{ status: "ready", responsibles: RESPONSIBLES }}
          onSaved={vi.fn()}
          onDeleted={vi.fn()}
        />,
      );
      expect(screen.getByRole("combobox", { name: "Responsable (opcional)" }).textContent).toContain("Histórico (inactivo)");
    });

    it("en creación, si el directorio falla, solo 'Sin asignar' está disponible como opción", async () => {
      renderSheet({ block: null, responsiblesDirectory: ERROR_DIRECTORY });

      fireEvent.click(screen.getByRole("combobox", { name: "Responsable (opcional)" }));
      const options = await screen.findAllByRole("option");

      expect(options).toHaveLength(1);
      expect(options[0].textContent).toBe("Sin asignar");
    });
  });

  it("desasignar con 'Sin asignar' envía responsible_id null", async () => {
    updateScheduleBlock.mockResolvedValue({ ok: true, data: { id: "block-1" } });
    const block = makeBlock();
    renderSheet({ block, initialWeekday: block.weekday, initialHour: block.hour });

    await selectOption("Responsable (opcional)", "Sin asignar");
    fireEvent.click(saveButton());

    await screen.findByRole("button", { name: "Guardar cambios" });
    expect(updateScheduleBlock).toHaveBeenCalledWith("block-1", expect.objectContaining({ responsible_id: null }));
  });

  it("eliminar exige confirmación en dos pasos y llama a deleteScheduleBlock con el id exacto", async () => {
    deleteScheduleBlock.mockResolvedValue({ ok: true, data: null });
    const block = makeBlock();
    const { onDeleted, onOpenChange } = renderSheet({ block, initialWeekday: block.weekday, initialHour: block.hour });

    fireEvent.click(screen.getByRole("button", { name: "Eliminar bloque" }));
    expect(deleteScheduleBlock).not.toHaveBeenCalled();
    expect(screen.getByText("¿Eliminar este bloque de horario?")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "No, mantener el bloque" }));
    expect(screen.queryByText("¿Eliminar este bloque de horario?")).toBeNull();
    expect(deleteScheduleBlock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Eliminar bloque" }));
    fireEvent.click(screen.getByRole("button", { name: "Sí, eliminar" }));

    await screen.findByRole("button", { name: "Eliminar bloque" });
    expect(deleteScheduleBlock).toHaveBeenCalledWith("block-1");
    expect(onDeleted).toHaveBeenCalledTimes(1);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("muestra 'Guardando…' y deshabilita el envío mientras la Server Action está en curso", async () => {
    let resolveSave: (value: { ok: true; data: { id: string } }) => void = () => {};
    createScheduleBlock.mockReturnValue(new Promise((resolve) => (resolveSave = resolve)));
    renderSheet();

    fireEvent.change(screen.getByLabelText("Actividad o trabajo previsto"), { target: { value: "Contenido" } });
    fireEvent.click(saveButton());

    const savingButton = (await screen.findByRole("button", { name: "Guardando…" })) as HTMLButtonElement;
    expect(savingButton.disabled).toBe(true);

    resolveSave({ ok: true, data: { id: "x" } });
  });

  it("muestra 'Eliminando…' y deshabilita los botones de confirmación mientras se elimina", async () => {
    let resolveDelete: (value: { ok: true; data: null }) => void = () => {};
    deleteScheduleBlock.mockReturnValue(new Promise((resolve) => (resolveDelete = resolve)));
    const block = makeBlock();
    renderSheet({ block, initialWeekday: block.weekday, initialHour: block.hour });

    fireEvent.click(screen.getByRole("button", { name: "Eliminar bloque" }));
    fireEvent.click(screen.getByRole("button", { name: "Sí, eliminar" }));

    const deletingButton = (await screen.findByRole("button", { name: "Eliminando…" })) as HTMLButtonElement;
    expect(deletingButton.disabled).toBe(true);

    resolveDelete({ ok: true, data: null });
  });
});
