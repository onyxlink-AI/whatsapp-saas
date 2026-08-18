// @vitest-environment jsdom
//
// TAREA 2, categoría 6 — cambiar entre las 4 pestañas de periodo debe pedir
// (y mostrar) los objetivos de ESE periodo, no mezclar datos de otro. Se
// mockea goal-actions.ts entero (Server Action con next/headers dentro —
// mismo motivo que goal-actions.test.ts mockea @/lib/supabase/server) y se
// hace responder con un objetivo de título distinto por tipo de periodo,
// así una aserción de texto basta para probar que la pestaña correcta pidió
// y mostró los datos correctos.
//
// ObjetivosTable monta a la vez la tabla de escritorio y las tarjetas
// móviles (las clases hidden/md:block no aplican sin CSS real en jsdom), así
// que cada objetivo aparece DOS veces en el DOM — de ahí findAllByText en
// vez de findByText en todo este archivo. Y Radix Tabs.Trigger cambia de
// pestaña en onMouseDown (no en onClick, ver node_modules/@radix-ui/react-tabs),
// así que se dispara mouseDown, no click.

import { describe, expect, it, vi, afterEach, beforeEach } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ObjetivosBoard } from "./objetivos-board";
import type { AgencyGoalWithOwner, GoalPeriodType } from "../types";

const listGoals = vi.fn();
const listPlatformStaffUsers = vi.fn();
const createGoal = vi.fn();
const updateGoal = vi.fn();
const deleteGoal = vi.fn();

vi.mock("../services/goal-actions", () => ({
  listGoals: (...args: unknown[]) => listGoals(...args),
  listPlatformStaffUsers: (...args: unknown[]) => listPlatformStaffUsers(...args),
  createGoal: (...args: unknown[]) => createGoal(...args),
  updateGoal: (...args: unknown[]) => updateGoal(...args),
  deleteGoal: (...args: unknown[]) => deleteGoal(...args),
}));

function makeGoal(periodType: GoalPeriodType, title: string): AgencyGoalWithOwner {
  return {
    id: `${periodType}-1`,
    title,
    description: null,
    period_type: periodType,
    period_start: "2026-01-01",
    period_end: "2026-12-31",
    owner_id: null,
    status: "pending",
    progress: 0,
    created_by: "creador",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    owner: null,
  };
}

const GOALS_BY_PERIOD: Record<GoalPeriodType, AgencyGoalWithOwner> = {
  annual: makeGoal("annual", "Meta anual exclusiva"),
  quarterly: makeGoal("quarterly", "Meta trimestral exclusiva"),
  monthly: makeGoal("monthly", "Meta mensual exclusiva"),
  weekly: makeGoal("weekly", "Meta semanal exclusiva"),
};

function selectTab(name: string) {
  fireEvent.mouseDown(screen.getByRole("tab", { name }), { button: 0 });
}

beforeEach(() => {
  vi.clearAllMocks();
  listPlatformStaffUsers.mockResolvedValue({ ok: true, data: [] });
  listGoals.mockImplementation(async (periodType: GoalPeriodType) => ({ ok: true, data: [GOALS_BY_PERIOD[periodType]] }));
});

afterEach(() => {
  cleanup();
});

describe("ObjetivosBoard — cambio entre las 4 pestañas de periodo", () => {
  it("la pestaña Anual pide y muestra solo el objetivo anual", async () => {
    render(<ObjetivosBoard />);
    await waitFor(() => expect(listGoals).toHaveBeenCalledWith("annual"));
    expect((await screen.findAllByText("Meta anual exclusiva")).length).toBeGreaterThan(0);
    expect(screen.queryAllByText("Meta trimestral exclusiva")).toHaveLength(0);
  });

  it("cambiar a Trimestral pide y muestra solo el objetivo trimestral", async () => {
    render(<ObjetivosBoard />);
    await screen.findAllByText("Meta anual exclusiva");

    selectTab("Trimestral");

    await waitFor(() => expect(listGoals).toHaveBeenCalledWith("quarterly"));
    expect((await screen.findAllByText("Meta trimestral exclusiva")).length).toBeGreaterThan(0);
    expect(screen.queryAllByText("Meta anual exclusiva")).toHaveLength(0);
  });

  it("cambiar a Mensual pide y muestra solo el objetivo mensual", async () => {
    render(<ObjetivosBoard />);
    await screen.findAllByText("Meta anual exclusiva");

    selectTab("Mensual");

    await waitFor(() => expect(listGoals).toHaveBeenCalledWith("monthly"));
    expect((await screen.findAllByText("Meta mensual exclusiva")).length).toBeGreaterThan(0);
  });

  it("cambiar a Semanal pide y muestra solo el objetivo semanal", async () => {
    render(<ObjetivosBoard />);
    await screen.findAllByText("Meta anual exclusiva");

    selectTab("Semanal");

    await waitFor(() => expect(listGoals).toHaveBeenCalledWith("weekly"));
    expect((await screen.findAllByText("Meta semanal exclusiva")).length).toBeGreaterThan(0);
  });

  it("volver a una pestaña ya visitada no repite la petición (se usa la caché en memoria)", async () => {
    render(<ObjetivosBoard />);
    await screen.findAllByText("Meta anual exclusiva");

    selectTab("Trimestral");
    await screen.findAllByText("Meta trimestral exclusiva");
    expect(listGoals).toHaveBeenCalledTimes(2);

    selectTab("Anual");
    await screen.findAllByText("Meta anual exclusiva");
    expect(listGoals).toHaveBeenCalledTimes(2);
  });
});
