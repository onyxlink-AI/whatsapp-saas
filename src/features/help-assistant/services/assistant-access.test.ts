// Fase 4A: assertHelpActionAccess() — autorización centralizada, vuelta a
// comprobar en cada ejecución de herramienta, con datos frescos (nunca del
// HelpActionContext construido al principio de la conversación).

import { describe, it, expect, vi, beforeEach } from "vitest";

const getUser = vi.fn();
const membershipsMaybeSingle = vi.fn();
const workspacesMaybeSingle = vi.fn();

const sessionClient = {
  auth: { getUser: (...a: unknown[]) => getUser(...a) },
  from: (table: string) => {
    if (table === "memberships") {
      return { select: () => ({ eq: () => ({ eq: () => ({ eq: () => ({ maybeSingle: () => membershipsMaybeSingle() }) }) }) }) };
    }
    if (table === "workspaces") {
      return { select: () => ({ eq: () => ({ maybeSingle: () => workspacesMaybeSingle() }) }) };
    }
    throw new Error(`unexpected table ${table}`);
  },
};
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => sessionClient }));

const { assertHelpActionAccess, assistantAccessErrorMessage } = await import("./assistant-access");

const WORKSPACE_ID = "ws1";
const USER_ID = "user1";
const ctx = { workspaceId: WORKSPACE_ID, actorUserId: USER_ID };

beforeEach(() => {
  vi.clearAllMocks();
  getUser.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null });
  membershipsMaybeSingle.mockResolvedValue({ data: { role: "admin" }, error: null });
  workspacesMaybeSingle.mockResolvedValue({ data: { product_package: "suite", help_assistant_actions_enabled: true }, error: null });
});

describe("assertHelpActionAccess — casos base", () => {
  it("concede acceso a un admin de un workspace Suite con el kill switch activado", async () => {
    const result = await assertHelpActionAccess(ctx, "content");
    expect(result).toEqual({ ok: true, role: "admin" });
  });

  it("rechaza sin sesión válida", async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: null });
    const result = await assertHelpActionAccess(ctx, "content");
    expect(result).toEqual({ ok: false, reason: "unauthenticated" });
  });

  it("rechaza cuando el actorUserId del contexto no coincide con el usuario real de la sesión viva", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "otro-usuario" } }, error: null });
    const result = await assertHelpActionAccess(ctx, "content");
    expect(result).toEqual({ ok: false, reason: "actor_mismatch" });
  });

  it("membership desactivada DESPUÉS de iniciar la conversación: una comprobación fresca la detecta aunque el ctx original fuera válido", async () => {
    // Simula exactamente el escenario que preocupa a la revisión: el
    // HelpActionContext se construyó al principio de la conversación con un
    // actorUserId válido, pero entre medias un admin desactivó la
    // membership — la consulta de membership, hecha de nuevo aquí, ya no
    // encuentra ninguna fila activa.
    membershipsMaybeSingle.mockResolvedValue({ data: null, error: null });
    const result = await assertHelpActionAccess(ctx, "content");
    expect(result).toEqual({ ok: false, reason: "not_a_member" });
  });
});

describe("assertHelpActionAccess — roles", () => {
  it.each(["admin", "manager", "agent"])("permite el rol %s", async (role) => {
    membershipsMaybeSingle.mockResolvedValue({ data: { role }, error: null });
    const result = await assertHelpActionAccess(ctx, "content");
    expect(result).toEqual({ ok: true, role });
  });

  it("rechaza el rol viewer", async () => {
    membershipsMaybeSingle.mockResolvedValue({ data: { role: "viewer" }, error: null });
    const result = await assertHelpActionAccess(ctx, "content");
    expect(result).toEqual({ ok: false, reason: "role_not_allowed" });
  });
});

describe("assertHelpActionAccess — matriz exacta por paquete", () => {
  it("none: sin escritura, actionsEnabled=true", async () => {
    workspacesMaybeSingle.mockResolvedValue({ data: { product_package: "none", help_assistant_actions_enabled: true }, error: null });
    const result = await assertHelpActionAccess(ctx, "content");
    expect(result).toEqual({ ok: false, reason: "plan_not_included" });
  });

  it("gestion: sin escritura (asistente informativo), actionsEnabled=true", async () => {
    workspacesMaybeSingle.mockResolvedValue({ data: { product_package: "gestion", help_assistant_actions_enabled: true }, error: null });
    const result = await assertHelpActionAccess(ctx, "content");
    expect(result).toEqual({ ok: false, reason: "plan_not_included" });
  });

  it("whatsapp_gestion: escritura concedida con actionsEnabled=true", async () => {
    workspacesMaybeSingle.mockResolvedValue({ data: { product_package: "whatsapp_gestion", help_assistant_actions_enabled: true }, error: null });
    const result = await assertHelpActionAccess(ctx, "content");
    expect(result.ok).toBe(true);
  });

  it("suite: escritura concedida con actionsEnabled=true", async () => {
    workspacesMaybeSingle.mockResolvedValue({ data: { product_package: "suite", help_assistant_actions_enabled: true }, error: null });
    const result = await assertHelpActionAccess(ctx, "content");
    expect(result.ok).toBe(true);
  });

  it.each(["none", "gestion", "whatsapp_gestion", "suite"])(
    "kill switch apagado: ninguna escritura en el paquete %s",
    async (pkg) => {
      workspacesMaybeSingle.mockResolvedValue({ data: { product_package: pkg, help_assistant_actions_enabled: false }, error: null });
      const result = await assertHelpActionAccess(ctx, "content");
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toBe("actions_disabled");
    },
  );
});

describe("assertHelpActionAccess — errores de BD nunca se confunden con estados de negocio", () => {
  it("error leyendo membership -> internal_error, no not_a_member", async () => {
    membershipsMaybeSingle.mockResolvedValue({ data: null, error: { message: "db down" } });
    const result = await assertHelpActionAccess(ctx, "content");
    expect(result).toEqual({ ok: false, reason: "internal_error" });
  });

  it("error leyendo el workspace -> internal_error, no plan_not_included", async () => {
    workspacesMaybeSingle.mockResolvedValue({ data: null, error: { message: "db down" } });
    const result = await assertHelpActionAccess(ctx, "content");
    expect(result).toEqual({ ok: false, reason: "internal_error" });
  });
});

describe("assistantAccessErrorMessage", () => {
  it("nunca filtra detalle técnico — siempre un mensaje fijo y genérico para internal_error", () => {
    expect(assistantAccessErrorMessage("internal_error")).not.toMatch(/db down|connection|Supabase/i);
  });

  it("da un mensaje distinto para cada motivo de rechazo", () => {
    const reasons = ["unauthenticated", "not_a_member", "actor_mismatch", "role_not_allowed", "plan_not_included", "actions_disabled", "internal_error"] as const;
    const messages = new Set(reasons.map((r) => assistantAccessErrorMessage(r)));
    // not_a_member y actor_mismatch comparten deliberadamente el mismo
    // mensaje genérico "Acceso denegado" — nunca hay que revelar si el
    // workspace existe o si el usuario simplemente no es miembro.
    expect(messages.size).toBeGreaterThanOrEqual(reasons.length - 1);
  });
});
