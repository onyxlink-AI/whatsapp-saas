// @vitest-environment jsdom
//
// Dashboard navegable — Fase 1: KpiCard/PriorityRow/QuickAction ya envuelven
// su contenido en next/link cuando reciben `href` (foco de teclado vía
// focus-visible:ring-ring incluido). Estas pruebas confirman que CADA
// indicador es realmente pulsable/navegable a su destino exacto, y que sin
// `href` el componente sigue siendo un <div> no interactivo (el caso
// "Sin conversaciones esperando", "Sin tareas vencidas", etc. — nunca debe
// convertirse en un enlace falso a ningún sitio).
//
// Sin @testing-library/jest-dom en este repo — se usa getByRole/queryByRole
// + comprobaciones directas del DOM (getAttribute, tagName).

import { describe, expect, it, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { Bell } from "lucide-react";
import { KpiCard, PriorityRow, QuickAction } from "./primitives";

afterEach(() => {
  cleanup();
});

describe("KpiCard", () => {
  it("con href, es un <a> real navegable al destino exacto, con foco accesible", () => {
    render(<KpiCard label="Tareas pendientes" value="5" helper="1 vencida" icon={Bell} href="/proyectos?view=tasks" />);
    const link = screen.getByRole("link", { name: /Tareas pendientes/ });
    expect(link.tagName).toBe("A");
    expect(link.getAttribute("href")).toBe("/proyectos?view=tasks");
    expect(link.className).toContain("focus-visible:ring-ring");
  });

  it("sin href, es un <div> — nunca un enlace falso", () => {
    render(<KpiCard label="Tareas pendientes" value="5" helper="1 vencida" icon={Bell} />);
    expect(screen.queryByRole("link")).toBeNull();
  });
});

describe("PriorityRow", () => {
  it("con href, toda la fila es un <a> pulsable al destino exacto", () => {
    render(<PriorityRow icon={Bell} title="3 tareas vencidas" description="Ya pasó su fecha límite." href="/proyectos?view=tasks" />);
    const link = screen.getByRole("link", { name: /3 tareas vencidas/ });
    expect(link.tagName).toBe("A");
    expect(link.getAttribute("href")).toBe("/proyectos?view=tasks");
    expect(link.className).toContain("focus-visible:ring-ring");
  });

  it("sin href (ej. 'Sin tareas vencidas'), es un <div> no interactivo", () => {
    render(<PriorityRow icon={Bell} title="Sin tareas vencidas" description="Todo al día." />);
    expect(screen.queryByRole("link")).toBeNull();
  });
});

describe("QuickAction", () => {
  it("siempre es un <a> real al destino exacto (href obligatorio)", () => {
    render(<QuickAction href="/pipeline" icon={Bell} title="Revisar ventas" description="Continúa las oportunidades abiertas." />);
    const link = screen.getByRole("link", { name: /Revisar ventas/ });
    expect(link.tagName).toBe("A");
    expect(link.getAttribute("href")).toBe("/pipeline");
    expect(link.className).toContain("focus-visible:ring-ring");
  });
});
