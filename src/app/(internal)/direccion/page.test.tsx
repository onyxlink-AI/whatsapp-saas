// @vitest-environment jsdom
//
// TAREA 2/3/4B, categoría 6 — las tarjetas "Próximamente" nunca deben
// navegar a una página vacía ni a una ruta inexistente. Se comprueba
// estructuralmente: Objetivos, KPI y Operaciones deben renderizarse como
// <a href>; las 3 restantes deben renderizarse como contenedores no
// interactivos, sin atributo href en ningún elemento dentro de la tarjeta.

import { describe, expect, it, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import DireccionPage from "./page";

afterEach(() => {
  cleanup();
});

describe("DireccionPage — tarjetas 'Próximamente' no navegables", () => {
  it("Objetivos es un enlace real a /direccion/objetivos", () => {
    render(<DireccionPage />);
    const link = screen.getByRole("link", { name: /Objetivos/ });
    expect(link.getAttribute("href")).toBe("/direccion/objetivos");
  });

  it("KPI es un enlace real a /direccion/kpi", () => {
    render(<DireccionPage />);
    const link = screen.getByRole("link", { name: /KPI/ });
    expect(link.getAttribute("href")).toBe("/direccion/kpi");
  });

  it("Operaciones es un enlace real a /direccion/operaciones", () => {
    render(<DireccionPage />);
    const link = screen.getByRole("link", { name: /Operaciones/ });
    expect(link.getAttribute("href")).toBe("/direccion/operaciones");
  });

  it.each(["Comercial", "Onboarding de clientes", "Reuniones"])("%s se renderiza como 'Próximamente', sin ningún enlace", (title) => {
    render(<DireccionPage />);
    const heading = screen.getByText(title);
    const card = heading.closest('[aria-disabled="true"]');
    expect(card).not.toBeNull();
    expect(card?.querySelector("a")).toBeNull();
    expect(screen.getAllByText("Próximamente").length).toBeGreaterThan(0);
  });

  it("exactamente 3 tarjetas están marcadas como no interactivas (todas menos Objetivos, KPI y Operaciones)", () => {
    render(<DireccionPage />);
    expect(document.querySelectorAll('[aria-disabled="true"]').length).toBe(3);
  });
});
