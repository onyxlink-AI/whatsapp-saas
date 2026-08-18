// @vitest-environment jsdom
//
// TAREA 2, categoría 1 (autorización de página) y categoría 2 (protección de
// Empresas) — InternalLayout es una función async normal (Server Component),
// así que se invoca directamente con await y se mockean sus dependencias;
// no hace falta el runtime completo de Next.js. redirect() se mockea para
// que LANCE (igual que hace el redirect real de Next dentro de render), así
// que un redirect esperado se comprueba con un try/catch alrededor del
// await, nunca dejando que la ejecución siga de largo como sí pasaría sin
// el mock.

import { describe, expect, it, vi, beforeEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

const getPlatformAccess = vi.fn();
vi.mock("@/lib/auth/platform-access", () => ({ getPlatformAccess: (...args: unknown[]) => getPlatformAccess(...args) }));

const redirectMock = vi.fn((path: string) => {
  throw new Error(`REDIRECT:${path}`);
});
vi.mock("next/navigation", () => ({
  redirect: (...args: [string]) => redirectMock(...args),
  usePathname: () => "/direccion",
}));

const getActiveWorkspace = vi.fn();
const getDefaultRouteForWorkspace = vi.fn();
vi.mock("@/features/workspace/services/active-workspace", () => ({
  getActiveWorkspace: (...args: unknown[]) => getActiveWorkspace(...args),
  getDefaultRouteForWorkspace: (...args: unknown[]) => getDefaultRouteForWorkspace(...args),
}));

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn(async () => ({})) }));
vi.mock("@/features/auth/services/actions", () => ({ logout: vi.fn() }));

const { default: InternalLayout } = await import("./layout");

beforeEach(() => {
  vi.clearAllMocks();
  redirectMock.mockImplementation((path: string) => {
    throw new Error(`REDIRECT:${path}`);
  });
});

async function expectRedirectTo(path: string) {
  await expect(InternalLayout({ children: <div /> })).rejects.toThrow(`REDIRECT:${path}`);
}

describe("(internal)/layout — autorización de página", () => {
  it("usuario no autenticado -> /login", async () => {
    getPlatformAccess.mockResolvedValue(null);
    await expectRedirectTo("/login");
  });

  it("cliente normal sin platform staff, con workspace activo -> a su ruta por defecto (nunca /direccion)", async () => {
    getPlatformAccess.mockResolvedValue({ userId: "u1", email: "cliente@empresaa.local", isPlatformStaff: false, isSuperAdmin: false, platformRole: null, effectivePlatformRole: null });
    getActiveWorkspace.mockResolvedValue({ workspace_id: "ws-1" });
    getDefaultRouteForWorkspace.mockResolvedValue("/dashboard");
    await expectRedirectTo("/dashboard");
  });

  it("cliente sin workspace -> /onboarding", async () => {
    getPlatformAccess.mockResolvedValue({ userId: "u1", email: "cliente@empresaa.local", isPlatformStaff: false, isSuperAdmin: false, platformRole: null, effectivePlatformRole: null });
    getActiveWorkspace.mockResolvedValue(null);
    await expectRedirectTo("/onboarding");
  });

  it("admin de workspace de cliente (memberships.role='admin') sigue sin ser platform staff -> también redirigido, nunca /direccion", async () => {
    // getPlatformAccess() nunca mira memberships — un admin de workspace de
    // cliente es indistinguible de cualquier otro cliente aquí, exactamente
    // como ya prueba platform-access.test.ts.
    getPlatformAccess.mockResolvedValue({ userId: "u2", email: "admin@empresaa.local", isPlatformStaff: false, isSuperAdmin: false, platformRole: null, effectivePlatformRole: null });
    getActiveWorkspace.mockResolvedValue({ workspace_id: "ws-1" });
    getDefaultRouteForWorkspace.mockResolvedValue("/dashboard");
    await expectRedirectTo("/dashboard");
  });

  it("internal_admin -> accede, ve 'Dirección' pero NO 'Empresas'", async () => {
    getPlatformAccess.mockResolvedValue({ userId: "u3", email: "interno@onyxlink.local", isPlatformStaff: true, isSuperAdmin: false, platformRole: "internal_admin", effectivePlatformRole: "internal_admin" });
    const element = await InternalLayout({ children: <div /> });
    render(element);
    expect(screen.getAllByText("Dirección").length).toBeGreaterThan(0);
    expect(screen.queryByText("Empresas")).toBeNull();
    cleanup();
  });

  it("super_admin -> accede, ve 'Dirección' Y 'Empresas'", async () => {
    getPlatformAccess.mockResolvedValue({ userId: "u4", email: "super@onyxlink.local", isPlatformStaff: true, isSuperAdmin: true, platformRole: "super_admin", effectivePlatformRole: "super_admin" });
    const element = await InternalLayout({ children: <div /> });
    render(element);
    expect(screen.getAllByText("Dirección").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Empresas").length).toBeGreaterThan(0);
    cleanup();
  });
});
