// @vitest-environment jsdom
//
// Dashboard navegable — Fase 1: cada indicador del bloque Gestión navega
// exactamente al destino pedido. Sin cambios de JSX en este archivo — solo
// protege los hrefs ya existentes.

import { describe, expect, it, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { GestionDashboardBlock } from "./gestion-dashboard-block";
import type { GestionMetrics, UpcomingAgendaItem, StalledDeal } from "@/features/dashboard/services/gestion-metrics";

afterEach(() => {
  cleanup();
});

const metrics: GestionMetrics = {
  tasksOverdue: 2, tasksToday: 1, tasksPending: 6, agendaUpcoming: 1, dealsOpenCount: 3, dealsOpenValue: 500,
  dealsStalledCount: 1, projectsActiveCount: 4, projectsAvgProgress: 60, contentPendingCount: 2,
};
const upcomingAgenda: UpcomingAgendaItem[] = [{ id: "ag1", title: "Reunión de seguimiento", due_at: "2026-08-10T10:00:00Z" }];
const stalledDeals: StalledDeal[] = [{ id: "d1", title: "Cliente sin seguimiento reciente", stage: "interes", updated_at: "2026-08-01T00:00:00Z" }];

function renderBlock() {
  render(
    <GestionDashboardBlock
      metrics={metrics}
      upcomingAgenda={upcomingAgenda}
      stalledDeals={stalledDeals}
      hasWhatsappAgent={false}
      addons={{ teamChatUnread: null, vapiRecentCalls: null }}
    />,
  );
}

describe("GestionDashboardBlock — navegación de cada indicador", () => {
  it("tareas vencidas → /proyectos?view=tasks", () => {
    renderBlock();
    const link = screen.getByRole("link", { name: /tarea.*vencida/ });
    expect(link.getAttribute("href")).toBe("/proyectos?view=tasks");
  });

  it("tareas para hoy → /proyectos?view=tasks", () => {
    renderBlock();
    const link = screen.getByRole("link", { name: /para hoy/ });
    expect(link.getAttribute("href")).toBe("/proyectos?view=tasks");
  });

  it("próximo evento de agenda → /proyectos?view=agenda", () => {
    renderBlock();
    const link = screen.getByRole("link", { name: /Reunión de seguimiento/ });
    expect(link.getAttribute("href")).toBe("/proyectos?view=agenda");
  });

  it("cliente sin seguimiento reciente (oportunidad estancada) → /pipeline", () => {
    renderBlock();
    const link = screen.getByRole("link", { name: /Cliente sin seguimiento reciente/ });
    expect(link.getAttribute("href")).toBe("/pipeline");
  });

  it("contenido pendiente → /contenido", () => {
    renderBlock();
    const link = screen.getByRole("link", { name: /contenido.*pendiente/ });
    expect(link.getAttribute("href")).toBe("/contenido");
  });

  it("KPI Proyectos activos → /proyectos?view=projects", () => {
    renderBlock();
    const link = screen.getByRole("link", { name: /Proyectos activos/ });
    expect(link.getAttribute("href")).toBe("/proyectos?view=projects");
  });

  it("KPI Tareas pendientes → /proyectos?view=tasks", () => {
    renderBlock();
    const link = screen.getByRole("link", { name: /Tareas pendientes/ });
    expect(link.getAttribute("href")).toBe("/proyectos?view=tasks");
  });

  it("KPI Oportunidades abiertas → /pipeline", () => {
    renderBlock();
    const link = screen.getByRole("link", { name: /Oportunidades abiertas/ });
    expect(link.getAttribute("href")).toBe("/pipeline");
  });

  it("KPI Contenido en marcha → /contenido", () => {
    renderBlock();
    const link = screen.getByRole("link", { name: /Contenido en marcha/ });
    expect(link.getAttribute("href")).toBe("/contenido");
  });

  it("QuickAction Crear tarea → /proyectos?view=tasks", () => {
    renderBlock();
    const link = screen.getByRole("link", { name: /Crear tarea/ });
    expect(link.getAttribute("href")).toBe("/proyectos?view=tasks");
  });

  it("QuickAction Crear proyecto → /proyectos?view=projects", () => {
    renderBlock();
    const link = screen.getByRole("link", { name: /Crear proyecto/ });
    expect(link.getAttribute("href")).toBe("/proyectos?view=projects");
  });

  it("QuickAction Crear oportunidad → /pipeline", () => {
    renderBlock();
    const link = screen.getByRole("link", { name: /Crear oportunidad/ });
    expect(link.getAttribute("href")).toBe("/pipeline");
  });

  it("ningún enlace queda anidado dentro de otro enlace", () => {
    renderBlock();
    for (const link of screen.getAllByRole("link")) {
      expect(link.querySelector("a")).toBeNull();
    }
  });
});
