// Revisión correctiva de Fase 2 (bloqueo #4, segunda vuelta): cubre los 3
// defectos encontrados en whatsapp-status.ts — maybeSingle() inseguro ante
// varios agentes activos, errores de consulta sin controlar, y exposición
// directa de messages.error_message al cliente.

import { describe, it, expect, vi, beforeEach } from "vitest";

const createClient = vi.fn();
vi.mock("@supabase/supabase-js", () => ({
  createClient: (...args: unknown[]) => createClient(...args),
}));

const { getWhatsappDashboardState } = await import("./whatsapp-status");

type Result = { data: unknown; error: { message: string } | null };

function agentsBuilder(result: Result) {
  return {
    select: () => ({
      eq: () => ({
        eq: () => ({
          limit: () => Promise.resolve(result),
        }),
      }),
    }),
  };
}

function ycloudBuilder(result: Result) {
  return {
    select: () => ({
      eq: () => ({
        eq: () => ({
          maybeSingle: () => Promise.resolve(result),
        }),
      }),
    }),
  };
}

function messagesBuilder(result: Result) {
  return {
    select: () => ({
      eq: () => ({
        eq: () => ({
          gte: () => ({
            order: () => ({
              limit: () => Promise.resolve(result),
            }),
          }),
        }),
      }),
    }),
  };
}

const READY_YCLOUD: Result = {
  data: { enabled: true, config: { phone_number: "+10000000001" }, credentials: { api_key: "fake" } },
  error: null,
};

function mockDb({
  agents,
  ycloud = READY_YCLOUD,
  messages = { data: [], error: null },
}: {
  agents: Result;
  ycloud?: Result;
  messages?: Result;
}) {
  createClient.mockReturnValue({
    from: (table: string) => {
      if (table === "agents") return agentsBuilder(agents);
      if (table === "integrations") return ycloudBuilder(ycloud);
      if (table === "messages") return messagesBuilder(messages);
      throw new Error(`unexpected table ${table}`);
    },
  });
}

const NO_ACTIVITY = { activeConversations: 0, recentConversationsCount: 0 };
const WITH_ACTIVITY = { activeConversations: 3, recentConversationsCount: 2 };

beforeEach(() => {
  createClient.mockReset();
});

describe("getWhatsappDashboardState", () => {
  it("varios agentes activos no producen un falso pending_setup — se usa una comprobación de existencia segura (limit(1)), no maybeSingle()", async () => {
    // Simula lo que devolvería un workspace con más de un agente activo a
    // la vez: un array con más de una fila, sin error. Con el maybeSingle()
    // anterior esto habría sido un error PGRST116 ("multiple rows
    // returned") y se habría clasificado como "sin agente" — aquí debe
    // detectarse igual de bien que con una sola fila.
    mockDb({ agents: { data: [{ id: "agent-1" }, { id: "agent-2" }], error: null } });
    const result = await getWhatsappDashboardState("ws-1", NO_ACTIVITY);
    expect(result.status).not.toBe("pending_setup");
    expect(result.status).toBe("empty");
  });

  it("error de consulta de agente/YCloud se controla explícitamente — no lanza ni lo interpreta como 'sin configurar'", async () => {
    mockDb({ agents: { data: null, error: { message: "connection reset" } } });
    const result = await getWhatsappDashboardState("ws-1", NO_ACTIVITY);
    expect(result.status).toBe("operational_error");
    expect(result.detail).toMatch(/no se pudo verificar/i);
    // Nunca debe filtrar el mensaje técnico del error al cliente.
    expect(result.detail).not.toContain("connection reset");
  });

  it("error de consulta de YCloud también se controla explícitamente", async () => {
    mockDb({
      agents: { data: [{ id: "agent-1" }], error: null },
      ycloud: { data: null, error: { message: "pgbouncer timeout" } },
    });
    const result = await getWhatsappDashboardState("ws-1", NO_ACTIVITY);
    expect(result.status).toBe("operational_error");
    expect(result.detail).not.toContain("pgbouncer timeout");
  });

  it("fallo operativo (mensajes sin entregar) nunca expone el error_message almacenado — el cliente recibe un texto genérico y accionable", async () => {
    mockDb({
      agents: { data: [{ id: "agent-1" }], error: null },
      messages: {
        data: [{ error_message: "YCloud API key sk_live_SECRET_TOKEN_abc123 rejected by upstream" }],
        error: null,
      },
    });
    const result = await getWhatsappDashboardState("ws-1", NO_ACTIVITY);
    expect(result.status).toBe("operational_error");
    expect(result.detail).toBe(
      "Hay mensajes que no se pudieron entregar durante las últimas 24 horas. Revisa la conexión de WhatsApp.",
    );
    expect(result.detail).not.toContain("SECRET_TOKEN");
    expect(result.detail).not.toContain("sk_live");
  });

  it("error al consultar mensajes fallidos no bloquea el resto del dashboard — cae a la distinción vacío/activo normal", async () => {
    mockDb({
      agents: { data: [{ id: "agent-1" }], error: null },
      messages: { data: null, error: { message: "query timeout" } },
    });
    const result = await getWhatsappDashboardState("ws-1", WITH_ACTIVITY);
    expect(result.status).toBe("active");
    expect(result.detail).toBeNull();
  });

  it("contratado sin agente/YCloud configurado -> pending_setup con el mensaje real del blocker", async () => {
    mockDb({ agents: { data: [], error: null }, ycloud: { data: null, error: null } });
    const result = await getWhatsappDashboardState("ws-1", NO_ACTIVITY);
    expect(result.status).toBe("pending_setup");
    expect(result.detail).toBeTruthy();
  });

  it("configurado sin actividad -> empty", async () => {
    mockDb({ agents: { data: [{ id: "agent-1" }], error: null } });
    const result = await getWhatsappDashboardState("ws-1", NO_ACTIVITY);
    expect(result.status).toBe("empty");
  });

  it("configurado con actividad -> active", async () => {
    mockDb({ agents: { data: [{ id: "agent-1" }], error: null } });
    const result = await getWhatsappDashboardState("ws-1", WITH_ACTIVITY);
    expect(result.status).toBe("active");
  });
});
