import { describe, expect, it, vi, beforeEach } from "vitest";

// TAREA 1 — separación segura entre administradores internos y clientes.
// Estas pruebas cubren la lógica pura de getPlatformAccess()/
// requirePlatformStaff()/requireSuperAdmin() con la lectura de `users`
// mockeada — la prueba de que memberships.role nunca entra en juego aquí es
// estructural: getPlatformAccess() no consulta `memberships` en absoluto, así
// que un cliente con memberships.role='admin' (o cualquier otro rol de
// workspace) es indistinguible de cualquier otro usuario sin platform_role.
// El bloqueo real de escalada a nivel de base de datos (REVOKE UPDATE
// (platform_role)) se prueba aparte, contra Postgres real, en
// platform-role-isolation.integration.test.ts.

const getUser = vi.fn();
const maybeSingle = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser },
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle }),
      }),
    }),
  })),
}));

const { getPlatformAccess, requirePlatformStaff, requireSuperAdmin } = await import("./platform-access");

const USER_ID = "11111111-1111-4111-8111-111111111111";
const EMAIL = "persona@onyxlink.local";

beforeEach(() => {
  vi.clearAllMocks();
});

function mockAuthenticated(usersRow: { is_super_admin?: boolean; platform_role?: string | null } | null) {
  getUser.mockResolvedValue({ data: { user: { id: USER_ID, email: EMAIL } } });
  maybeSingle.mockResolvedValue({ data: usersRow });
}

describe("getPlatformAccess", () => {
  it("returns null when there is no authenticated session", async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    const access = await getPlatformAccess();
    expect(access).toBeNull();
  });

  it("cliente normal (platform_role null, is_super_admin false): ni staff ni super admin", async () => {
    mockAuthenticated({ is_super_admin: false, platform_role: null });
    const access = await getPlatformAccess();
    expect(access).toEqual({
      userId: USER_ID,
      email: EMAIL,
      platformRole: null,
      effectivePlatformRole: null,
      isPlatformStaff: false,
      isSuperAdmin: false,
    });
  });

  it("internal_admin: es staff de plataforma pero NO super admin", async () => {
    mockAuthenticated({ is_super_admin: false, platform_role: "internal_admin" });
    const access = await getPlatformAccess();
    expect(access?.isPlatformStaff).toBe(true);
    expect(access?.isSuperAdmin).toBe(false);
    expect(access?.platformRole).toBe("internal_admin");
    expect(access?.effectivePlatformRole).toBe("internal_admin");
  });

  it("super_admin (vía platform_role): es staff Y super admin", async () => {
    mockAuthenticated({ is_super_admin: false, platform_role: "super_admin" });
    const access = await getPlatformAccess();
    expect(access?.isPlatformStaff).toBe(true);
    expect(access?.isSuperAdmin).toBe(true);
    expect(access?.effectivePlatformRole).toBe("super_admin");
  });

  // TAREA 1B — bug real encontrado en TAREA 1: getPlatformAccess() ya
  // marcaba isPlatformStaff=true para este caso, pero platformRole (el
  // valor crudo de la columna) seguía siendo null, y requirePlatformStaff()
  // exigía platformRole no-null además de isPlatformStaff — así que un
  // superadministrador legado pasaba requireSuperAdmin() pero podía fallar
  // requirePlatformStaff() en otra ruta. effectivePlatformRole resuelve
  // esto: SIEMPRE coincide con isPlatformStaff (uno es no-null si y solo si
  // el otro es true), aunque platformRole (la columna cruda) siga en null.
  it("compatibilidad temporal: is_super_admin=true con platform_role aún sin backfillear también cuenta como super admin, y el rol EFECTIVO es 'super_admin' aunque la columna cruda siga en null", async () => {
    mockAuthenticated({ is_super_admin: true, platform_role: null });
    const access = await getPlatformAccess();
    expect(access?.isSuperAdmin).toBe(true);
    expect(access?.isPlatformStaff).toBe(true);
    expect(access?.platformRole).toBeNull();
    expect(access?.effectivePlatformRole).toBe("super_admin");
  });
});

describe("requirePlatformStaff", () => {
  it("usuario no autenticado -> rechazado (401)", async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    const result = await requirePlatformStaff();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(401);
  });

  it("cliente con memberships.role='admin' pero platform_role=null -> rechazado (la fila de users es la misma para cualquier rol de workspace, así que esto también cubre manager/agent/viewer)", async () => {
    mockAuthenticated({ is_super_admin: false, platform_role: null });
    const result = await requirePlatformStaff();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(403);
  });

  it("internal_admin -> autorizado como personal interno", async () => {
    mockAuthenticated({ is_super_admin: false, platform_role: "internal_admin" });
    const result = await requirePlatformStaff();
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.platformRole).toBe("internal_admin");
  });

  it("super_admin -> autorizado también (super_admin implica platform staff)", async () => {
    mockAuthenticated({ is_super_admin: false, platform_role: "super_admin" });
    const result = await requirePlatformStaff();
    expect(result.ok).toBe(true);
  });

  // TAREA 1B, pruebas obligatorias 1 y 2: un superadministrador legado
  // (is_super_admin=true, platform_role=null) debe ser ACEPTADO aquí, y el
  // rol devuelto debe ser 'super_admin' — antes del fix esto se rechazaba
  // con 403 pese a que requireSuperAdmin() sí lo autorizaba, dejando a un
  // mismo usuario con acceso desigual según la ruta.
  it("superadministrador legado (is_super_admin=true, platform_role=null) -> ACEPTADO, con rol efectivo 'super_admin'", async () => {
    mockAuthenticated({ is_super_admin: true, platform_role: null });
    const result = await requirePlatformStaff();
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.platformRole).toBe("super_admin");
  });
});

describe("requireSuperAdmin", () => {
  it("usuario no autenticado -> rechazado (401)", async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    const result = await requireSuperAdmin();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(401);
  });

  it("internal_admin -> rechazado en operaciones exclusivas de superadministrador", async () => {
    mockAuthenticated({ is_super_admin: false, platform_role: "internal_admin" });
    const result = await requireSuperAdmin();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(403);
  });

  it("super_admin (vía platform_role) -> autorizado", async () => {
    mockAuthenticated({ is_super_admin: false, platform_role: "super_admin" });
    const result = await requireSuperAdmin();
    expect(result.ok).toBe(true);
  });

  it("comportamiento actual sin romperse: is_super_admin=true legado (sin platform_role todavía) sigue autorizado", async () => {
    mockAuthenticated({ is_super_admin: true, platform_role: null });
    const result = await requireSuperAdmin();
    expect(result.ok).toBe(true);
  });

  it("cliente con memberships.role='admin' pero platform_role=null e is_super_admin=false -> rechazado", async () => {
    mockAuthenticated({ is_super_admin: false, platform_role: null });
    const result = await requireSuperAdmin();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(403);
  });
});
