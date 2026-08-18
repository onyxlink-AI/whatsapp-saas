// @vitest-environment jsdom
//
// TAREA 3B — cuando el workspace de una relación se elimina (ON DELETE SET
// NULL, ver 20260818120000_agency_kpis.sql), la tabla debe seguir mostrando
// el nombre histórico (client_name_snapshot) — nunca un genérico "Empresa
// eliminada" que pierda el nombre real — y avisar discretamente de que el
// workspace original ya no existe.

import { describe, expect, it, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { ClientsTable } from "./clients-table";
import type { AgencyClientRelationshipWithWorkspace } from "../types";

afterEach(() => {
  cleanup();
});

const noop = () => {};

function baseRelationship(overrides: Partial<AgencyClientRelationshipWithWorkspace> = {}): AgencyClientRelationshipWithWorkspace {
  return {
    id: "rel-1",
    workspace_id: "ws-1",
    client_name_snapshot: "Empresa Histórica S.L.",
    service_started_on: "2026-01-01",
    service_ended_on: null,
    monthly_fee: 100,
    created_by: "staff-1",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    workspace: { id: "ws-1", name: "Empresa Actual S.L." },
    ...overrides,
  };
}

describe("ClientsTable — nombre del cliente cuando el workspace fue eliminado", () => {
  it("mientras el workspace existe, muestra su nombre ACTUAL (no el snapshot)", () => {
    render(
      <ClientsTable
        relationships={[baseRelationship()]}
        loading={false}
        error={null}
        todayIso="2026-08-18"
        onEdit={noop}
        onDelete={noop}
        deletingId={null}
      />,
    );
    expect(screen.getAllByText("Empresa Actual S.L.").length).toBeGreaterThan(0);
    expect(screen.queryByText("Empresa Histórica S.L.")).toBeNull();
    expect(screen.queryByText(/ya no existe/)).toBeNull();
  });

  it("cuando el workspace fue eliminado (workspace NULL), muestra client_name_snapshot y un aviso discreto", () => {
    render(
      <ClientsTable
        relationships={[baseRelationship({ workspace_id: null, workspace: null })]}
        loading={false}
        error={null}
        todayIso="2026-08-18"
        onEdit={noop}
        onDelete={noop}
        deletingId={null}
      />,
    );
    expect(screen.getAllByText("Empresa Histórica S.L.").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/El workspace original ya no existe/).length).toBeGreaterThan(0);
  });

  it("una relación histórica sigue siendo editable y eliminable (los botones de acción existen igual)", () => {
    render(
      <ClientsTable
        relationships={[baseRelationship({ workspace_id: null, workspace: null })]}
        loading={false}
        error={null}
        todayIso="2026-08-18"
        onEdit={noop}
        onDelete={noop}
        deletingId={null}
      />,
    );
    expect(screen.getAllByRole("button", { name: /Editar «Empresa Histórica S\.L\.»/ }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("button", { name: /Eliminar «Empresa Histórica S\.L\.»/ }).length).toBeGreaterThan(0);
  });
});
