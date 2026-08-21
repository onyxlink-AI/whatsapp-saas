// @vitest-environment jsdom
//
// TAREA 4B — ScheduleGrid. La versión de escritorio (data-testid
// "schedule-grid-desktop") y la móvil (data-testid "schedule-grid-mobile")
// coexisten siempre en el DOM de jsdom (no hay CSS real que aplique
// "hidden"/"md:block"), así que cada prueba acota explícitamente con
// `within()` a la versión que le corresponde — nunca se cuentan botones sin
// acotar, o se contarían el doble.

import { describe, expect, it, vi, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { ScheduleGrid } from "./schedule-grid";
import type { AgencyScheduleBlockWithResponsible } from "../types";

afterEach(() => {
  cleanup();
});

function makeBlock(overrides: Partial<AgencyScheduleBlockWithResponsible> = {}): AgencyScheduleBlockWithResponsible {
  return {
    id: "block-1",
    weekday: 1,
    hour: 9,
    content: "Reunión de equipo",
    color_key: "violet",
    responsible_id: "user-1",
    created_by: "user-1",
    updated_by: "user-1",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    responsible: { id: "user-1", full_name: "Ana García" },
    ...overrides,
  };
}

describe("ScheduleGrid — escritorio", () => {
  it("muestra los siete días en orden lunes-domingo", () => {
    render(<ScheduleGrid blocks={[]} onCreate={vi.fn()} onEdit={vi.fn()} />);
    const desktop = screen.getByTestId("schedule-grid-desktop");
    const headers = within(desktop).getAllByRole("columnheader");
    // La primera columna es "Hora"; las 7 siguientes son los días.
    expect(headers.map((h) => h.textContent)).toEqual(["Hora", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"]);
  });

  it("muestra las 24 horas, de 00:00 a 23:00", () => {
    render(<ScheduleGrid blocks={[]} onCreate={vi.fn()} onEdit={vi.fn()} />);
    const desktop = screen.getByTestId("schedule-grid-desktop");
    const rowHeaders = within(desktop).getAllByRole("rowheader");
    expect(rowHeaders).toHaveLength(24);
    expect(rowHeaders[0].textContent).toBe("00:00");
    expect(rowHeaders[23].textContent).toBe("23:00");
  });

  it("renderiza exactamente 168 celdas (7 días x 24 horas)", () => {
    render(<ScheduleGrid blocks={[]} onCreate={vi.fn()} onEdit={vi.fn()} />);
    const desktop = screen.getByTestId("schedule-grid-desktop");
    expect(within(desktop).getAllByRole("button")).toHaveLength(168);
  });

  it("una celda vacía llama a onCreate con el weekday y la hour correctos", () => {
    const onCreate = vi.fn();
    render(<ScheduleGrid blocks={[]} onCreate={onCreate} onEdit={vi.fn()} />);
    const desktop = screen.getByTestId("schedule-grid-desktop");

    const button = within(desktop).getByRole("button", { name: "Añadir bloque el martes de 14:00 a 15:00" });
    fireEvent.click(button);

    expect(onCreate).toHaveBeenCalledWith(2, 14);
  });

  it("un bloque ocupado muestra su contenido, su color y el nombre del responsable", () => {
    const block = makeBlock({ weekday: 3, hour: 11, content: "Revisión de propuestas", color_key: "amber" });
    render(<ScheduleGrid blocks={[block]} onCreate={vi.fn()} onEdit={vi.fn()} />);
    const desktop = screen.getByTestId("schedule-grid-desktop");

    const button = within(desktop).getByRole("button", { name: /Editar bloque el miércoles de 11:00 a 12:00/ });
    expect(within(button).getByText("Revisión de propuestas")).toBeTruthy();
    expect(within(button).getByText("Ana García")).toBeTruthy();
    // El color se expresa mediante la clase de Tailwind de la familia
    // correspondiente (paleta cerrada) — no hay otro indicador visual de
    // color en la celda.
    expect(button.className).toContain("amber");
  });

  it("pulsar un bloque ocupado llama a onEdit con el bloque exacto", () => {
    const onEdit = vi.fn();
    const block = makeBlock({ weekday: 5, hour: 16 });
    render(<ScheduleGrid blocks={[block]} onCreate={vi.fn()} onEdit={onEdit} />);
    const desktop = screen.getByTestId("schedule-grid-desktop");

    fireEvent.click(within(desktop).getByRole("button", { name: /Editar bloque el viernes de 16:00 a 17:00/ }));

    expect(onEdit).toHaveBeenCalledWith(block);
  });

  it("el aria-label de una celda ocupada incluye día, hora, contenido y la acción de editar", () => {
    const block = makeBlock({ weekday: 7, hour: 23, content: "Cierre semanal", responsible: null, responsible_id: null });
    render(<ScheduleGrid blocks={[block]} onCreate={vi.fn()} onEdit={vi.fn()} />);
    const desktop = screen.getByTestId("schedule-grid-desktop");

    expect(within(desktop).getByRole("button", { name: "Editar bloque el domingo de 23:00 a 00:00: Cierre semanal" })).toBeTruthy();
  });
});

// TAREA 4B.1: ScheduleGrid reutiliza el componente Tabs (Radix) existente
// para el selector móvil de días — su TabsTrigger confirma la selección en
// onMouseDown, no en onClick (mismo comportamiento ya documentado en
// objetivos-board.test.tsx), así que estas pruebas usan fireEvent.mouseDown
// para cambiar de pestaña.
function selectMobileDay(mobile: HTMLElement, name: string) {
  fireEvent.mouseDown(within(mobile).getByRole("tab", { name }), { button: 0 });
}

describe("ScheduleGrid — móvil", () => {
  it("ofrece un selector de los siete días y muestra solo las 24 horas del día seleccionado", () => {
    const blockMonday = makeBlock({ id: "b-mon", weekday: 1, hour: 9, content: "Bloque del lunes" });
    const blockSunday = makeBlock({ id: "b-sun", weekday: 7, hour: 10, content: "Bloque del domingo" });
    render(<ScheduleGrid blocks={[blockMonday, blockSunday]} onCreate={vi.fn()} onEdit={vi.fn()} />);
    const mobile = screen.getByTestId("schedule-grid-mobile");

    const tabs = within(mobile).getAllByRole("tab");
    expect(tabs.map((t) => t.textContent)).toEqual(["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"]);

    // Por defecto empieza en lunes: su bloque es visible, el de domingo no.
    expect(within(mobile).getByText("Bloque del lunes")).toBeTruthy();
    expect(within(mobile).queryByText("Bloque del domingo")).toBeNull();
    expect(tabs[0].getAttribute("aria-selected")).toBe("true");

    selectMobileDay(mobile, "Domingo");

    expect(within(mobile).getByText("Bloque del domingo")).toBeTruthy();
    expect(within(mobile).queryByText("Bloque del lunes")).toBeNull();
    expect(within(mobile).getByRole("tab", { name: "Domingo" }).getAttribute("aria-selected")).toBe("true");
    expect(within(mobile).getByRole("tab", { name: "Lunes" }).getAttribute("aria-selected")).toBe("false");
  });

  it("mantiene crear y editar en la vista móvil", () => {
    const onCreate = vi.fn();
    const onEdit = vi.fn();
    const block = makeBlock({ weekday: 1, hour: 9 });
    render(<ScheduleGrid blocks={[block]} onCreate={onCreate} onEdit={onEdit} />);
    const mobile = screen.getByTestId("schedule-grid-mobile");

    fireEvent.click(within(mobile).getByRole("button", { name: /Editar bloque el lunes de 09:00 a 10:00/ }));
    expect(onEdit).toHaveBeenCalledWith(block);

    fireEvent.click(within(mobile).getByRole("button", { name: "Añadir bloque el lunes de 10:00 a 11:00" }));
    expect(onCreate).toHaveBeenCalledWith(1, 10);
  });

  describe("TAREA 4B.1 — patrón ARIA de pestañas completo", () => {
    it("cada tab tiene un id estable, aria-controls hacia su panel, y el panel activo es role=tabpanel con aria-labelledby hacia ese tab", () => {
      render(<ScheduleGrid blocks={[]} onCreate={vi.fn()} onEdit={vi.fn()} />);
      const mobile = screen.getByTestId("schedule-grid-mobile");

      const mondayTab = within(mobile).getByRole("tab", { name: "Lunes" });
      const tabId = mondayTab.getAttribute("id");
      const controlsId = mondayTab.getAttribute("aria-controls");
      expect(tabId).toBeTruthy();
      expect(controlsId).toBeTruthy();

      // Solo el panel del día seleccionado está montado (Presence de Radix
      // desmonta los demás) — por eso hay exactamente un tabpanel.
      const panels = within(mobile).getAllByRole("tabpanel");
      expect(panels).toHaveLength(1);
      expect(panels[0].getAttribute("id")).toBe(controlsId);
      expect(panels[0].getAttribute("aria-labelledby")).toBe(tabId);
    });

    it("la pestaña seleccionada tiene tabIndex 0 y el resto -1", () => {
      render(<ScheduleGrid blocks={[]} onCreate={vi.fn()} onEdit={vi.fn()} />);
      const mobile = screen.getByTestId("schedule-grid-mobile");

      // El roving tabindex de Radix solo asigna tabIndex=0 a un elemento
      // DESPUÉS de una primera entrada de foco real al grupo (así es como
      // un navegador real posiciona el tab-stop inicial al entrar con la
      // tecla Tab) — antes de esa primera entrada, todas las pestañas
      // tienen -1. Se simula esa entrada enfocando la pestaña ya
      // seleccionada (Lunes), el comportamiento real al tabular hacia el
      // widget por primera vez.
      fireEvent.focus(within(mobile).getByRole("tab", { name: "Lunes" }));

      expect(within(mobile).getByRole("tab", { name: "Lunes" }).getAttribute("tabIndex")).toBe("0");
      for (const name of ["Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"]) {
        expect(within(mobile).getByRole("tab", { name }).getAttribute("tabIndex")).toBe("-1");
      }

      selectMobileDay(mobile, "Miércoles");

      expect(within(mobile).getByRole("tab", { name: "Miércoles" }).getAttribute("tabIndex")).toBe("0");
      expect(within(mobile).getByRole("tab", { name: "Lunes" }).getAttribute("tabIndex")).toBe("-1");
    });

    it("ArrowRight/ArrowLeft cambian de día y mueven el foco a la pestaña recién seleccionada", async () => {
      render(<ScheduleGrid blocks={[]} onCreate={vi.fn()} onEdit={vi.fn()} />);
      const mobile = screen.getByTestId("schedule-grid-mobile");

      const mondayTab = within(mobile).getByRole("tab", { name: "Lunes" });
      fireEvent.focus(mondayTab);
      fireEvent.keyDown(mondayTab, { key: "ArrowRight" });

      // Radix mueve el foco de flecha dentro de un setTimeout (nunca de
      // forma síncrona con el keydown) — se espera con waitFor en vez de
      // comprobar inmediatamente.
      await waitFor(() => {
        const tuesdayTab = within(mobile).getByRole("tab", { name: "Martes" });
        expect(tuesdayTab.getAttribute("aria-selected")).toBe("true");
        expect(document.activeElement).toBe(tuesdayTab);
      });

      const tuesdayTab = within(mobile).getByRole("tab", { name: "Martes" });
      fireEvent.keyDown(tuesdayTab, { key: "ArrowLeft" });

      await waitFor(() => {
        const mondayTabAgain = within(mobile).getByRole("tab", { name: "Lunes" });
        expect(mondayTabAgain.getAttribute("aria-selected")).toBe("true");
        expect(document.activeElement).toBe(mondayTabAgain);
      });
    });

    it("Home selecciona el lunes y End selecciona el domingo desde cualquier día", async () => {
      render(<ScheduleGrid blocks={[]} onCreate={vi.fn()} onEdit={vi.fn()} />);
      const mobile = screen.getByTestId("schedule-grid-mobile");

      selectMobileDay(mobile, "Jueves");
      const thursdayTab = within(mobile).getByRole("tab", { name: "Jueves" });
      fireEvent.focus(thursdayTab);

      fireEvent.keyDown(thursdayTab, { key: "End" });
      await waitFor(() => {
        const sundayTab = within(mobile).getByRole("tab", { name: "Domingo" });
        expect(sundayTab.getAttribute("aria-selected")).toBe("true");
        expect(document.activeElement).toBe(sundayTab);
      });

      const sundayTab = within(mobile).getByRole("tab", { name: "Domingo" });
      fireEvent.keyDown(sundayTab, { key: "Home" });
      await waitFor(() => {
        const mondayTab = within(mobile).getByRole("tab", { name: "Lunes" });
        expect(mondayTab.getAttribute("aria-selected")).toBe("true");
        expect(document.activeElement).toBe(mondayTab);
      });
    });
  });
});
