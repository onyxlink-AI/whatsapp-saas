import { describe, it, expect } from "vitest";
import {
  isClientActiveOn,
  countActiveClients,
  retentionDaysFor,
  computeRetentionKpi,
  computeAverageTicketKpi,
  averageEurCentsSafe,
  computeMeetingsClosureKpi,
  computeRegistrableWorkspaces,
  type ClientRelationshipFee,
} from "./kpi-calculations";

const TODAY = "2026-08-18";

describe("isClientActiveOn / countActiveClients", () => {
  it("ningún cliente: 0 activos", () => {
    expect(countActiveClients([], TODAY)).toBe(0);
  });

  it("cliente activo: comenzó antes de hoy y sin fecha de finalización", () => {
    const rel = { service_started_on: "2026-01-01", service_ended_on: null };
    expect(isClientActiveOn(rel, TODAY)).toBe(true);
    expect(countActiveClients([rel], TODAY)).toBe(1);
  });

  it("cliente activo: fecha de finalización futura sigue contando como activo", () => {
    const rel = { service_started_on: "2026-01-01", service_ended_on: "2027-01-01" };
    expect(isClientActiveOn(rel, TODAY)).toBe(true);
  });

  it("cliente activo: fecha de finalización es hoy mismo (inclusivo)", () => {
    const rel = { service_started_on: "2026-01-01", service_ended_on: TODAY };
    expect(isClientActiveOn(rel, TODAY)).toBe(true);
  });

  it("cliente finalizado: fecha de finalización anterior a hoy no cuenta como activo", () => {
    const rel = { service_started_on: "2025-01-01", service_ended_on: "2026-06-01" };
    expect(isClientActiveOn(rel, TODAY)).toBe(false);
    expect(countActiveClients([rel], TODAY)).toBe(0);
  });

  it("fecha de inicio futura: nunca activo todavía, aunque no tenga fin", () => {
    const rel = { service_started_on: "2027-01-01", service_ended_on: null };
    expect(isClientActiveOn(rel, TODAY)).toBe(false);
    expect(countActiveClients([rel], TODAY)).toBe(0);
  });

  it("mezcla: solo cuenta los realmente activos hoy", () => {
    const relationships = [
      { service_started_on: "2026-01-01", service_ended_on: null }, // activo
      { service_started_on: "2025-01-01", service_ended_on: "2026-01-01" }, // finalizado
      { service_started_on: "2027-01-01", service_ended_on: null }, // futuro
      { service_started_on: "2026-01-01", service_ended_on: "2027-01-01" }, // activo (fin futuro)
    ];
    expect(countActiveClients(relationships, TODAY)).toBe(2);
  });
});

describe("retentionDaysFor", () => {
  it("cliente activo sin fin: días desde el inicio hasta hoy", () => {
    // 2026-01-01 -> 2026-08-18: 31(ene)+28(feb, no bisiesto)+31(mar)+30(abr)+31(may)+30(jun)+31(jul)+17(1-18 ago) = 229
    expect(retentionDaysFor({ service_started_on: "2026-01-01", service_ended_on: null }, TODAY)).toBe(229);
  });

  it("cliente finalizado: días entre inicio y fin real (no hasta hoy)", () => {
    // año no bisiesto completo: 2025-01-01 -> 2026-01-01 = 365 días exactos
    expect(retentionDaysFor({ service_started_on: "2025-01-01", service_ended_on: "2026-01-01" }, TODAY)).toBe(365);
  });

  it("año bisiesto completo: 2024-01-01 -> 2025-01-01 = 366 días", () => {
    expect(retentionDaysFor({ service_started_on: "2024-01-01", service_ended_on: "2025-01-01" }, "2026-01-01")).toBe(366);
  });

  it("fecha de finalización futura: se usa hoy, no la fecha futura", () => {
    const withFutureEnd = retentionDaysFor({ service_started_on: "2026-01-01", service_ended_on: "2030-01-01" }, TODAY);
    const withNoEnd = retentionDaysFor({ service_started_on: "2026-01-01", service_ended_on: null }, TODAY);
    expect(withFutureEnd).toBe(withNoEnd);
  });

  it("fecha de inicio futura: null (no computable todavía)", () => {
    expect(retentionDaysFor({ service_started_on: "2027-01-01", service_ended_on: null }, TODAY)).toBeNull();
  });

  it("mismo día de inicio y fin: 0 días", () => {
    expect(retentionDaysFor({ service_started_on: TODAY, service_ended_on: TODAY }, TODAY)).toBe(0);
  });
});

describe("computeRetentionKpi", () => {
  it("ningún cliente: media null (nunca 0)", () => {
    expect(computeRetentionKpi([], TODAY)).toEqual({ averageDays: null, averageMonths: null });
  });

  it("excluye relaciones con inicio futuro de la media", () => {
    const relationships = [
      { service_started_on: "2025-01-01", service_ended_on: "2026-01-01" }, // 365 días
      { service_started_on: "2027-01-01", service_ended_on: null }, // futuro, excluido
    ];
    const result = computeRetentionKpi(relationships, TODAY);
    expect(result.averageDays).toBe(365);
  });

  it("incluye activas y finalizadas en la misma media", () => {
    const relationships = [
      { service_started_on: "2025-01-01", service_ended_on: "2026-01-01" }, // 365 días, finalizada
      { service_started_on: "2025-01-01", service_ended_on: null }, // activa, retención hasta hoy
    ];
    const activeDays = retentionDaysFor(relationships[1], TODAY);
    const result = computeRetentionKpi(relationships, TODAY);
    expect(result.averageDays).toBe((365 + activeDays!) / 2);
  });

  it("convierte la media de días a meses con un decimal (días / 30.44)", () => {
    // Media de 365 días exactos -> 365 / 30.44 = 11.99..., redondeado a 12.0
    const result = computeRetentionKpi([{ service_started_on: "2025-01-01", service_ended_on: "2026-01-01" }], TODAY);
    expect(result.averageMonths).toBe(12.0);
  });
});

describe("computeAverageTicketKpi / averageEurCentsSafe", () => {
  it("ningún cliente: null", () => {
    expect(computeAverageTicketKpi([], TODAY)).toEqual({ averageEur: null, countWithFee: 0 });
  });

  it("excluye monthly_fee NULL — nunca lo trata como 0", () => {
    const relationships: ClientRelationshipFee[] = [
      { service_started_on: "2026-01-01", service_ended_on: null, monthly_fee: 100 },
      { service_started_on: "2026-01-01", service_ended_on: null, monthly_fee: null },
    ];
    const result = computeAverageTicketKpi(relationships, TODAY);
    expect(result.countWithFee).toBe(1);
    expect(result.averageEur).toBe(100);
  });

  it("excluye clientes no activos (finalizados o con inicio futuro) del cálculo", () => {
    const relationships: ClientRelationshipFee[] = [
      { service_started_on: "2025-01-01", service_ended_on: "2026-01-01", monthly_fee: 500 }, // finalizado
      { service_started_on: "2027-01-01", service_ended_on: null, monthly_fee: 500 }, // futuro
      { service_started_on: "2026-01-01", service_ended_on: null, monthly_fee: 200 }, // activo
    ];
    const result = computeAverageTicketKpi(relationships, TODAY);
    expect(result.countWithFee).toBe(1);
    expect(result.averageEur).toBe(200);
  });

  it("media monetaria sin errores de coma flotante (0.1 + 0.2 tipo)", () => {
    // Suma directa en JS de estos 3 valores da 0.6000000000000001 en coma flotante.
    expect(averageEurCentsSafe([0.1, 0.2, 0.3])).toBe(0.2);
  });

  it("media con reparto exacto entre varios clientes", () => {
    expect(averageEurCentsSafe([100, 200, 300])).toBe(200);
  });

  it("lista vacía: null", () => {
    expect(averageEurCentsSafe([])).toBeNull();
  });
});

describe("computeMeetingsClosureKpi", () => {
  it("ninguna reunión resuelta: null (nunca 0%)", () => {
    expect(computeMeetingsClosureKpi([])).toEqual({ ratePercent: null, won: 0, resolvedTotal: 0 });
  });

  it("won/lost correctos: calcula won / (won+lost) * 100", () => {
    const meetings = [
      { status: "held" as const, outcome: "won" as const },
      { status: "held" as const, outcome: "won" as const },
      { status: "held" as const, outcome: "won" as const },
      { status: "held" as const, outcome: "lost" as const },
      { status: "held" as const, outcome: "lost" as const },
      { status: "held" as const, outcome: "lost" as const },
      { status: "held" as const, outcome: "lost" as const },
      { status: "held" as const, outcome: "lost" as const },
    ];
    // 3 ganadas de 8 resueltas -> 37.5%
    expect(computeMeetingsClosureKpi(meetings)).toEqual({ ratePercent: 37.5, won: 3, resolvedTotal: 8 });
  });

  it("excluye pending del numerador y del denominador", () => {
    const meetings = [
      { status: "held" as const, outcome: "won" as const },
      { status: "held" as const, outcome: "pending" as const },
    ];
    expect(computeMeetingsClosureKpi(meetings)).toEqual({ ratePercent: 100, won: 1, resolvedTotal: 1 });
  });

  it("excluye scheduled, cancelled y no_show por completo", () => {
    const meetings = [
      { status: "held" as const, outcome: "won" as const },
      { status: "scheduled" as const, outcome: null },
      { status: "cancelled" as const, outcome: null },
      { status: "no_show" as const, outcome: null },
    ];
    expect(computeMeetingsClosureKpi(meetings)).toEqual({ ratePercent: 100, won: 1, resolvedTotal: 1 });
  });
});

describe("computeRegistrableWorkspaces (TAREA 3B)", () => {
  it("excluye workspaces ya registrados", () => {
    const all = [{ id: "ws-1", name: "A" }, { id: "ws-2", name: "B" }];
    const relationships = [{ workspace_id: "ws-1" }];
    expect(computeRegistrableWorkspaces(all, relationships)).toEqual([{ id: "ws-2", name: "B" }]);
  });

  it("una relación histórica con workspace_id NULL nunca bloquea ni duplica un workspace real", () => {
    const all = [{ id: "ws-1", name: "A" }, { id: "ws-2", name: "B" }];
    const relationships = [
      { workspace_id: "ws-1" }, // registrado de verdad
      { workspace_id: null }, // histórico, workspace ya borrado
      { workspace_id: null }, // segundo histórico — no debe causar duplicados ni errores
    ];
    const result = computeRegistrableWorkspaces(all, relationships);
    expect(result).toEqual([{ id: "ws-2", name: "B" }]);
    // Sin duplicados: cada workspace aparece como mucho una vez.
    expect(new Set(result.map((w) => w.id)).size).toBe(result.length);
  });

  it("sin relaciones: todos los workspaces son registrables", () => {
    const all = [{ id: "ws-1", name: "A" }, { id: "ws-2", name: "B" }];
    expect(computeRegistrableWorkspaces(all, [])).toEqual(all);
  });
});
