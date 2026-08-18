// @vitest-environment jsdom
//
// TAREA 2, categoría 2 — Empresas debe seguir siendo exclusivo de
// super_admin tras añadir el enlace "Dirección" a este mismo panel. Esta
// prueba existía como riesgo real: (agency)/layout.tsx usa su propia
// comprobación is_super_admin (no getPlatformAccess()) y este archivo NO se
// tocó en TAREA 1/1B — aquí se demuestra que un internal_admin (is_super_
// admin=false en la fila de users) sigue sin poder entrar en /workspaces,
// exactamente igual que antes de que existiera "Dirección".

import { describe, expect, it, vi, beforeEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

const getUser = vi.fn();
const single = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser },
    from: () => ({ select: () => ({ eq: () => ({ single }) }) }),
  })),
}));

const redirectMock = vi.fn((path: string) => {
  throw new Error(`REDIRECT:${path}`);
});
const getActiveWorkspace = vi.fn();
const getDefaultRouteForWorkspace = vi.fn();
vi.mock("next/navigation", () => ({
  redirect: (...args: [string]) => redirectMock(...args),
  usePathname: () => "/workspaces",
}));
vi.mock("@/features/workspace/services/active-workspace", () => ({
  getActiveWorkspace: (...args: unknown[]) => getActiveWorkspace(...args),
  getDefaultRouteForWorkspace: (...args: unknown[]) => getDefaultRouteForWorkspace(...args),
}));
vi.mock("@/features/auth/services/actions", () => ({ logout: vi.fn() }));

const { default: AgencyLayout } = await import("./layout");

beforeEach(() => {
  vi.clearAllMocks();
  redirectMock.mockImplementation((path: string) => {
    throw new Error(`REDIRECT:${path}`);
  });
});

describe("(agency)/layout — Empresas sigue exclusivo de super_admin", () => {
  it("usuario no autenticado -> /login", async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    await expect(AgencyLayout({ children: <div /> })).rejects.toThrow("REDIRECT:/login");
  });

  it("internal_admin (is_super_admin=false en users) NO puede entrar en /workspaces -> redirigido a su ruta por defecto", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u-interno", email: "interno@onyxlink.local" } } });
    single.mockResolvedValue({ data: { is_super_admin: false } });
    getActiveWorkspace.mockResolvedValue(null);
    await expect(AgencyLayout({ children: <div /> })).rejects.toThrow("REDIRECT:/onboarding");
  });

  it("super_admin conserva acceso a Empresas, y ahora también ve el enlace 'Dirección'", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u-super", email: "super@onyxlink.local" } } });
    single.mockResolvedValue({ data: { is_super_admin: true } });

    const element = await AgencyLayout({ children: <div /> });
    render(element);
    expect(screen.getAllByText("Empresas").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Dirección").length).toBeGreaterThan(0);
    cleanup();
  });
});
