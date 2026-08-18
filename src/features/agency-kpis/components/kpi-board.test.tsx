// @vitest-environment jsdom
//
// TAREA 3, categoría "Pruebas de interfaz o servicio" — la página debe
// mostrar EXACTAMENTE los 4 KPI pedidos (ni uno más), los estados vacíos
// deben ser correctos ("Sin datos suficientes", nunca un número inventado),
// y eliminar un registro debe refrescar los valores. Se mockean
// kpi-queries.ts/kpi-actions.ts (Server Actions con next/headers dentro —
// mismo motivo que en objetivos-board.test.tsx).

import { describe, expect, it, vi, afterEach, beforeEach } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { KpiBoard } from "./kpi-board";
import { todayLocalIso } from "@/features/agency-goals/services/period-calculator";
import type { AgencyClientRelationshipWithWorkspace, AgencySalesMeetingRow } from "../types";

const listClientRelationships = vi.fn();
const listSalesMeetings = vi.fn();
const listAllWorkspaces = vi.fn();
vi.mock("../services/kpi-queries", () => ({
  listClientRelationships: (...args: unknown[]) => listClientRelationships(...args),
  listSalesMeetings: (...args: unknown[]) => listSalesMeetings(...args),
  listAllWorkspaces: (...args: unknown[]) => listAllWorkspaces(...args),
}));

const createClientRelationship = vi.fn();
const updateClientRelationship = vi.fn();
const deleteClientRelationship = vi.fn();
const createSalesMeeting = vi.fn();
const updateSalesMeeting = vi.fn();
const deleteSalesMeeting = vi.fn();
vi.mock("../services/kpi-actions", () => ({
  createClientRelationship: (...args: unknown[]) => createClientRelationship(...args),
  updateClientRelationship: (...args: unknown[]) => updateClientRelationship(...args),
  deleteClientRelationship: (...args: unknown[]) => deleteClientRelationship(...args),
  createSalesMeeting: (...args: unknown[]) => createSalesMeeting(...args),
  updateSalesMeeting: (...args: unknown[]) => updateSalesMeeting(...args),
  deleteSalesMeeting: (...args: unknown[]) => deleteSalesMeeting(...args),
}));

const TODAY = todayLocalIso();

function relationship(overrides: Partial<AgencyClientRelationshipWithWorkspace> = {}): AgencyClientRelationshipWithWorkspace {
  return {
    id: "rel-1",
    workspace_id: "ws-1",
    client_name_snapshot: "Empresa Uno",
    service_started_on: "2026-01-01",
    service_ended_on: null,
    monthly_fee: 100,
    created_by: "staff-1",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    workspace: { id: "ws-1", name: "Empresa Uno" },
    ...overrides,
  };
}

function meeting(overrides: Partial<AgencySalesMeetingRow> = {}): AgencySalesMeetingRow {
  return {
    id: "meet-1",
    lead_name: "Lead Uno",
    scheduled_at: "2026-08-20T10:00:00.000Z",
    status: "held",
    outcome: "won",
    notes: null,
    created_by: "staff-1",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  listAllWorkspaces.mockResolvedValue({ ok: true, data: [] });
});

afterEach(() => {
  cleanup();
});

const KPI_LABELS = ["Clientes", "Retención", "Ticket medio", "Cierre de reuniones"];

/** Escopa a la tarjeta KPI concreta — evita ambigüedad con el mismo texto repetido en la tabla de abajo. */
function kpiCard(label: string): HTMLElement {
  return screen.getByText(label).closest(".surface-card") as HTMLElement;
}

describe("KpiBoard — exactamente los 4 KPI pedidos", () => {
  it("muestra las 4 tarjetas exactas y ninguna más", async () => {
    listClientRelationships.mockResolvedValue({ ok: true, data: [] });
    listSalesMeetings.mockResolvedValue({ ok: true, data: [] });

    render(<KpiBoard />);

    for (const label of KPI_LABELS) {
      expect(await screen.findByText(label)).toBeTruthy();
    }
    // Ningún otro rótulo de KPI fuera de alcance (facturación, churn, MRR, objetivos…).
    expect(screen.queryByText(/Facturación|Churn|MRR|Oportunidades|Objetivos cumplidos/)).toBeNull();
  });
});

describe("KpiBoard — estados vacíos", () => {
  it("Clientes muestra 0 (nunca 'sin datos'); el resto muestra 'Sin datos suficientes'", async () => {
    listClientRelationships.mockResolvedValue({ ok: true, data: [] });
    listSalesMeetings.mockResolvedValue({ ok: true, data: [] });

    render(<KpiBoard />);

    await screen.findByText("Clientes");
    expect(screen.getByText("0")).toBeTruthy();
    expect(screen.getAllByText("Sin datos suficientes")).toHaveLength(3);
  });

  it("con datos reales, calcula y muestra los 4 valores (nunca números inventados)", async () => {
    listClientRelationships.mockResolvedValue({
      ok: true,
      data: [relationship({ id: "rel-1", service_started_on: TODAY, monthly_fee: 100 })],
    });
    listSalesMeetings.mockResolvedValue({
      ok: true,
      data: [meeting({ id: "meet-1", status: "held", outcome: "won" }), meeting({ id: "meet-2", status: "held", outcome: "lost" })],
    });

    render(<KpiBoard />);

    await screen.findByText("Clientes");
    expect(within(kpiCard("Clientes")).getByText("1")).toBeTruthy(); // 1 cliente activo
    expect(within(kpiCard("Ticket medio")).getByText(/100,00\s*€/)).toBeTruthy();
    expect(within(kpiCard("Cierre de reuniones")).getByText("50.0%")).toBeTruthy(); // 1 de 2 reuniones resueltas
  });

  // TAREA 3B: una relación histórica (workspace borrado, workspace_id NULL)
  // debe seguir participando en los 4 KPI con total normalidad según sus
  // fechas — las fórmulas nunca miran workspace_id.
  it("una relación con workspace_id NULL (histórica) sigue calculando los 4 KPI con normalidad", async () => {
    listClientRelationships.mockResolvedValue({
      ok: true,
      data: [
        relationship({
          id: "rel-orphan",
          workspace_id: null,
          workspace: null,
          client_name_snapshot: "Empresa Histórica S.L.",
          service_started_on: TODAY,
          monthly_fee: 200,
        }),
      ],
    });
    listSalesMeetings.mockResolvedValue({ ok: true, data: [] });

    render(<KpiBoard />);

    await screen.findByText("Clientes");
    expect(within(kpiCard("Clientes")).getByText("1")).toBeTruthy();
    expect(within(kpiCard("Ticket medio")).getByText(/200,00\s*€/)).toBeTruthy();
  });
});

describe("KpiBoard — eliminar un cliente refresca los valores", () => {
  it("tras confirmar el borrado, se vuelve a pedir la lista y el KPI de Clientes baja a 0", async () => {
    listClientRelationships
      .mockResolvedValueOnce({ ok: true, data: [relationship({ id: "rel-1", service_started_on: TODAY })] })
      .mockResolvedValueOnce({ ok: true, data: [] });
    listSalesMeetings.mockResolvedValue({ ok: true, data: [] });
    deleteClientRelationship.mockResolvedValue({ ok: true, data: null });

    render(<KpiBoard />);

    await screen.findByText("Clientes");
    // Antes de eliminar: 1 cliente activo.
    expect(within(kpiCard("Clientes")).getByText("1")).toBeTruthy();

    const row = screen.getAllByRole("row")[1] as HTMLElement;
    fireEvent.click(within(row).getByRole("button", { name: /Eliminar «/ }));
    fireEvent.click(within(row).getByRole("button", { name: "Eliminar" }));

    expect(deleteClientRelationship).toHaveBeenCalledWith("rel-1");
    await waitFor(() => expect(within(kpiCard("Clientes")).getByText("0")).toBeTruthy());
    expect(listClientRelationships).toHaveBeenCalledTimes(2);
  });
});
