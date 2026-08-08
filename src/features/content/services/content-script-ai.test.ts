// Fase 3 (docs/CLAUDE-ARQUITECTURA-PAQUETES-NAVEGACION-IA-ASISTENTE.md §5):
// generateContentScript — revisión correctiva: nunca usa la clave de
// plataforma, reserva atómica (fail-closed) del rate limit, y errores de
// lectura de BD nunca se confunden con "plan no contratado"/"responsable
// ajeno".

import { describe, expect, it, vi, beforeEach } from "vitest";

const getUser = vi.fn();
const workspacesMaybeSingle = vi.fn();
const membershipsMaybeSingle = vi.fn();

const sessionClient = {
  auth: { getUser: (...a: unknown[]) => getUser(...a) },
  from: (table: string) => {
    if (table === "workspaces") {
      return { select: () => ({ eq: () => ({ maybeSingle: () => workspacesMaybeSingle() }) }) };
    }
    if (table === "memberships") {
      return {
        select: () => ({ eq: () => ({ eq: () => ({ eq: () => ({ maybeSingle: () => membershipsMaybeSingle() }) }) }) }),
      };
    }
    throw new Error(`unexpected session table ${table}`);
  },
};
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => sessionClient }));

const getActiveWorkspace = vi.fn();
vi.mock("@/features/workspace/services/active-workspace", () => ({
  getActiveWorkspace: (...a: unknown[]) => getActiveWorkspace(...a),
}));

const generateObject = vi.fn();
class MockNoObjectGeneratedError extends Error {
  static isInstance(err: unknown): err is MockNoObjectGeneratedError {
    return err instanceof MockNoObjectGeneratedError;
  }
}
vi.mock("ai", () => ({
  generateObject: (...a: unknown[]) => generateObject(...a),
  NoObjectGeneratedError: MockNoObjectGeneratedError,
}));

const createOpenAISpy = vi.fn();
vi.mock("@ai-sdk/openai", () => ({
  createOpenAI: (opts: unknown) => {
    createOpenAISpy(opts);
    return { chat: (modelId: string) => ({ modelId }) };
  },
}));

// Cliente service-role — integrations (credencial estricta del workspace),
// events (ya no se usa directamente, la reserva es un solo rpc), y rpc()
// para reserve_content_script_generation.
let integrationsMaybeSingleResult: { data: unknown; error: { message: string } | null } = { data: null, error: null };
let rpcResult: { data: unknown; error: { message: string } | null } = { data: { allowed: true, used: 1, limit: 15 }, error: null };
const rpcSpy = vi.fn((_name: string, _args: unknown) => Promise.resolve(rpcResult));

const svcClient = {
  from: (table: string) => {
    if (table !== "integrations") throw new Error(`unexpected svc table ${table}`);
    return {
      select: () => ({
        eq: () => ({
          eq: () => ({
            maybeSingle: () => Promise.resolve(integrationsMaybeSingleResult),
          }),
        }),
      }),
    };
  },
  rpc: (name: string, args: unknown) => rpcSpy(name, args),
};
vi.mock("@supabase/supabase-js", () => ({ createClient: () => svcClient }));

const { generateContentScript } = await import("./content-script-ai");

const WORKSPACE_A = "11111111-1111-4111-8111-111111111111";
const WORKSPACE_B = "22222222-2222-4222-8222-222222222222";
const USER_ID = "33333333-3333-4333-8333-333333333333";
const RESPONSIBLE_ID = "44444444-4444-4444-8444-444444444444";

const WORKSPACE_KEY = "sk-or-workspace-fake-key";

const VALID_INPUT = {
  mainIdea: "Cómo ahorrar tiempo con automatizaciones",
  description: "Un reel corto con 3 automatizaciones útiles",
  contentType: "Reel",
  platform: "Instagram",
  orientation: "vertical" as const,
  durationEstimate: "30s",
  responsibleId: null,
  scheduledDate: null,
};

const GENERATED_OBJECT = {
  hook: "Hook",
  body: "Body",
  closing: "Closing",
  cta: "CTA",
  bulletPoints: ["uno", "dos"],
  links: [],
  lighting: "Luz natural",
  music: "Instrumental",
  notes: "",
};

function readyIntegration(apiKey = WORKSPACE_KEY) {
  return { data: { enabled: true, credentials: { openrouter_api_key: apiKey } }, error: null };
}

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.OPENROUTER_API_KEY;
  getUser.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null });
  getActiveWorkspace.mockResolvedValue({ workspace_id: WORKSPACE_A, role: "admin" });
  workspacesMaybeSingle.mockResolvedValue({ data: { product_package: "gestion" }, error: null });
  membershipsMaybeSingle.mockResolvedValue({ data: { user_id: RESPONSIBLE_ID, users: { full_name: "Ana" } }, error: null });
  integrationsMaybeSingleResult = readyIntegration();
  rpcResult = { data: { allowed: true, used: 1, limit: 15 }, error: null };
  generateObject.mockResolvedValue({ object: GENERATED_OBJECT, usage: { inputTokens: 10, outputTokens: 20 } });
});

describe("generateContentScript — nunca usa la clave de plataforma", () => {
  it("con clave del workspace Y clave global configuradas simultáneamente, usa EXCLUSIVAMENTE la del workspace", async () => {
    process.env.OPENROUTER_API_KEY = "sk-or-platform-fake-key";
    integrationsMaybeSingleResult = readyIntegration(WORKSPACE_KEY);

    const result = await generateContentScript(WORKSPACE_A, VALID_INPUT);

    expect(result.ok).toBe(true);
    expect(createOpenAISpy).toHaveBeenCalledTimes(1);
    const callArgs = createOpenAISpy.mock.calls[0][0] as { apiKey: string };
    expect(callArgs.apiKey).toBe(WORKSPACE_KEY);
    expect(callArgs.apiKey).not.toBe("sk-or-platform-fake-key");
  });

  it("sin clave del workspace, nunca llama al modelo aunque exista OPENROUTER_API_KEY global", async () => {
    process.env.OPENROUTER_API_KEY = "sk-or-platform-fake-key";
    integrationsMaybeSingleResult = { data: null, error: null };

    const result = await generateContentScript(WORKSPACE_A, VALID_INPUT);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("openrouter_not_configured");
      expect(result.error).toBe("Conecta tu cuenta de OpenRouter en Ajustes → Integraciones para generar guiones con IA.");
    }
    expect(generateObject).not.toHaveBeenCalled();
    expect(createOpenAISpy).not.toHaveBeenCalled();
  });

  it("integración deshabilitada (enabled=false) se trata igual que 'sin configurar', sin caer a la plataforma", async () => {
    process.env.OPENROUTER_API_KEY = "sk-or-platform-fake-key";
    integrationsMaybeSingleResult = { data: { enabled: false, credentials: { openrouter_api_key: WORKSPACE_KEY } }, error: null };

    const result = await generateContentScript(WORKSPACE_A, VALID_INPUT);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("openrouter_not_configured");
    expect(generateObject).not.toHaveBeenCalled();
  });

  it("error de BD leyendo la integración OpenRouter nunca cae a la plataforma ni se confunde con 'sin configurar'", async () => {
    process.env.OPENROUTER_API_KEY = "sk-or-platform-fake-key";
    integrationsMaybeSingleResult = { data: null, error: { message: "connection reset" } };

    const result = await generateContentScript(WORKSPACE_A, VALID_INPUT);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBeUndefined();
      expect(result.error).not.toBe("Conecta tu cuenta de OpenRouter en Ajustes → Integraciones para generar guiones con IA.");
      expect(result.error).toMatch(/no se pudo comprobar tu acceso/i);
      expect(result.error).not.toContain("connection reset");
    }
    expect(generateObject).not.toHaveBeenCalled();
  });
});

describe("generateContentScript — permisos y aislamiento", () => {
  it("genera correctamente para un miembro autorizado del workspace activo", async () => {
    const result = await generateContentScript(WORKSPACE_A, VALID_INPUT);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.hook).toBe("Hook");
  });

  it("aislamiento A/B: rechaza un workspaceId que no coincide con el workspace activo real de la sesión", async () => {
    getActiveWorkspace.mockResolvedValue({ workspace_id: WORKSPACE_A, role: "admin" });
    const result = await generateContentScript(WORKSPACE_B, VALID_INPUT);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("Acceso denegado");
    expect(generateObject).not.toHaveBeenCalled();
  });

  it("rechaza sin sesión", async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: null });
    const result = await generateContentScript(WORKSPACE_A, VALID_INPUT);
    expect(result.ok).toBe(false);
    expect(generateObject).not.toHaveBeenCalled();
  });

  it("rechaza un rol viewer (no puede generar)", async () => {
    getActiveWorkspace.mockResolvedValue({ workspace_id: WORKSPACE_A, role: "viewer" });
    const result = await generateContentScript(WORKSPACE_A, VALID_INPUT);
    expect(result.ok).toBe(false);
    expect(generateObject).not.toHaveBeenCalled();
  });

  it("rechaza cuando el paquete del workspace no incluye Gestión", async () => {
    workspacesMaybeSingle.mockResolvedValue({ data: { product_package: "none" }, error: null });
    const result = await generateContentScript(WORKSPACE_A, VALID_INPUT);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/no está incluida en tu plan/i);
    expect(generateObject).not.toHaveBeenCalled();
  });

  it("error de BD leyendo el paquete del workspace da un error transitorio, nunca 'plan no incluido'", async () => {
    workspacesMaybeSingle.mockResolvedValue({ data: null, error: { message: "db down" } });
    const result = await generateContentScript(WORKSPACE_A, VALID_INPUT);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).not.toMatch(/no está incluida en tu plan/i);
      expect(result.error).toMatch(/no se pudo comprobar tu acceso/i);
    }
    expect(generateObject).not.toHaveBeenCalled();
  });

  it("rechaza un responsable que no pertenece al workspace activo", async () => {
    membershipsMaybeSingle.mockResolvedValue({ data: null, error: null });
    const result = await generateContentScript(WORKSPACE_A, { ...VALID_INPUT, responsibleId: RESPONSIBLE_ID });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/responsable/i);
    expect(generateObject).not.toHaveBeenCalled();
  });

  it("error de BD leyendo la membership del responsable da un error transitorio, nunca 'responsable ajeno'", async () => {
    membershipsMaybeSingle.mockResolvedValue({ data: null, error: { message: "db down" } });
    const result = await generateContentScript(WORKSPACE_A, { ...VALID_INPUT, responsibleId: RESPONSIBLE_ID });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).not.toMatch(/no pertenece/i);
      expect(result.error).toMatch(/no se pudo comprobar tu acceso/i);
    }
    expect(generateObject).not.toHaveBeenCalled();
  });

  it("rechaza cuando no hay ni idea principal ni descripción", async () => {
    const result = await generateContentScript(WORKSPACE_A, { ...VALID_INPUT, mainIdea: "", description: "" });
    expect(result.ok).toBe(false);
    expect(generateObject).not.toHaveBeenCalled();
  });
});

describe("generateContentScript — rate limit atómico, fail-closed", () => {
  it("rechaza cuando la reserva reporta allowed=false (límite alcanzado)", async () => {
    rpcResult = { data: { allowed: false, used: 15, limit: 15 }, error: null };
    const result = await generateContentScript(WORKSPACE_A, VALID_INPUT);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/límite/i);
    expect(generateObject).not.toHaveBeenCalled();
  });

  it("si la reserva atómica falla (error de BD/red), NUNCA llama a OpenRouter — fail-closed, no fail-open", async () => {
    rpcResult = { data: null, error: { message: "connection reset" } };
    const result = await generateContentScript(WORKSPACE_A, VALID_INPUT);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/no se pudo comprobar tu acceso/i);
      expect(result.error).not.toContain("connection reset");
    }
    expect(generateObject).not.toHaveBeenCalled();
  });

  it("llama a reserve_content_script_generation con workspace y usuario correctos antes de generar", async () => {
    await generateContentScript(WORKSPACE_A, VALID_INPUT);
    expect(rpcSpy).toHaveBeenCalledWith("reserve_content_script_generation", {
      p_workspace_id: WORKSPACE_A,
      p_user_id: USER_ID,
    });
  });
});

describe("generateContentScript — salida inválida y fallos del modelo", () => {
  it("NoObjectGeneratedError (salida no válida) se controla y devuelve un error genérico", async () => {
    generateObject.mockRejectedValue(new MockNoObjectGeneratedError("model returned malformed json"));
    const result = await generateContentScript(WORKSPACE_A, VALID_INPUT);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).not.toContain("malformed json");
      expect(result.error).toMatch(/no se pudo generar/i);
    }
  });

  it("un timeout/error de red se controla y devuelve un error genérico", async () => {
    generateObject.mockRejectedValue(new Error("The operation was aborted"));
    const result = await generateContentScript(WORKSPACE_A, VALID_INPUT);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/no se pudo generar/i);
  });
});

describe("generateContentScript — nunca inventa enlaces", () => {
  it("descarta cualquier link devuelto por el modelo que no aparezca literalmente en la idea/descripción", async () => {
    generateObject.mockResolvedValue({
      object: { ...GENERATED_OBJECT, links: [{ label: "Fuente inventada", url: "https://ejemplo-inventado.com" }] },
      usage: { inputTokens: 1, outputTokens: 1 },
    });
    const result = await generateContentScript(WORKSPACE_A, VALID_INPUT);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.links).toEqual([]);
  });

  it("conserva un link cuya URL sí aparece literalmente en la descripción proporcionada", async () => {
    const realUrl = "https://miempresa.com/promo";
    generateObject.mockResolvedValue({
      object: { ...GENERATED_OBJECT, links: [{ label: "Promo", url: realUrl }] },
      usage: { inputTokens: 1, outputTokens: 1 },
    });
    const result = await generateContentScript(WORKSPACE_A, {
      ...VALID_INPUT,
      description: `Promocionamos en ${realUrl} esta semana`,
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.links).toEqual([{ label: "Promo", url: realUrl }]);
  });
});
