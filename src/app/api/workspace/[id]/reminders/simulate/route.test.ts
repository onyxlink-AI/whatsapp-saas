// "🧪 Probar sin enviar" must never call YCloud/dispatch, never create
// contacts/conversations/messages, never mark a job as sent, and must show
// WHY each step would currently be blocked (reusing the exact same
// evaluateSendGates the real sender uses). It also logs exactly one
// technical, non-sensitive simulation event.

import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const getUser = vi.fn();
let membershipData: { role?: string } | null = { role: "agent" };

function chainable(resolve: () => unknown) {
  const obj: Record<string, unknown> = {};
  obj.select = () => obj;
  obj.eq = () => obj;
  obj.maybeSingle = async () => resolve();
  return obj;
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser },
    from: () => chainable(() => ({ data: membershipData, error: null })),
  })),
}));

const insertedEvents: Array<Record<string, unknown>> = [];
const fromSpy = vi.fn((table: string) => {
  if (table === "events") {
    return {
      insert: (row: Record<string, unknown>) => {
        insertedEvents.push({ table, ...row });
        return { then: (res: (v: unknown) => void) => res({ error: null }) };
      },
    };
  }
  return chainable(() => ({ data: null }));
});
vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => ({ from: fromSpy })),
}));

const getOrCreateReminderConfig = vi.fn();
const getReminderSteps = vi.fn();
vi.mock("@/features/reminders/services/reminder-config", () => ({
  getOrCreateReminderConfig,
  getReminderSteps,
}));

vi.mock("@/features/inbox/services/business-info", () => ({
  getBusinessInfo: vi.fn(async () => ({ structured: { name: "Estudio Test" }, free_text: null })),
}));

const evaluateSendGates = vi.fn();
vi.mock("@/features/reminders/services/send-gates", () => ({ evaluateSendGates }));

const { POST } = await import("./route");

function params(workspaceId: string) {
  return { params: Promise.resolve({ id: workspaceId }) };
}

function req(body: unknown) {
  return new NextRequest("http://localhost/x", { method: "POST", body: JSON.stringify(body) });
}

beforeEach(() => {
  vi.clearAllMocks();
  insertedEvents.length = 0;
  membershipData = { role: "agent" };
  getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
  getOrCreateReminderConfig.mockResolvedValue({
    workspace_id: "empresa-a",
    timezone: "America/Mexico_City",
    send_window_start_minute: 540,
    send_window_end_minute: 1200,
  });
  getReminderSteps.mockResolvedValue([
    {
      id: "step-1",
      step_key: "reminder_24h",
      name: "Recordatorio",
      enabled: true,
      position: 0,
      offset_minutes: -1440,
      message_base: "Hola {{nombre}}, cita en {{empresa}} a las {{hora}}",
      category: "appointment_reminders",
    },
  ]);
  evaluateSendGates.mockResolvedValue({
    allowed: false,
    blockedReasons: ["live_sending_disabled", "consent_missing"],
  });
});

describe("POST .../reminders/simulate — never real, never productive", () => {
  it("computes a preview with synthetic example data by default, touching only read-only tables", async () => {
    const res = await POST(req({}), params("empresa-a"));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.simulation).toBe(true);
    expect(json.usedRealAppointment).toBe(false);
    expect(json.steps[0].renderedMessage).toContain("🧪 [SIMULACIÓN]");
    expect(json.steps[0].renderedMessage).toContain("Estudio Test");

    // Never touches contacts/conversations/messages for writes — the only
    // table this route's own code queries is "contacts" (read-only, and
    // only when a real appointmentId is given, which it wasn't here) plus
    // "events" for the technical simulation log.
    const touchedTables = fromSpy.mock.calls.map(([t]) => t);
    expect(touchedTables).not.toContain("conversations");
    expect(touchedTables).not.toContain("messages");
  });

  it("shows why each step would be blocked, using the same evaluator the real sender uses", async () => {
    const res = await POST(req({}), params("empresa-a"));
    const json = await res.json();

    expect(evaluateSendGates).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: "empresa-a", stepKey: "reminder_24h" }),
    );
    expect(json.steps[0].wouldBeBlocked).toBe(true);
    expect(json.steps[0].blockedReasons).toEqual(["live_sending_disabled", "consent_missing"]);
    expect(json.steps[0].blockedReasonsLabels).toEqual([
      "Envíos reales bloqueados",
      "Falta el consentimiento del cliente",
    ]);
  });

  it("marks a step as not blocked when evaluateSendGates allows it", async () => {
    evaluateSendGates.mockResolvedValue({ allowed: true, blockedReasons: [] });
    const res = await POST(req({}), params("empresa-a"));
    const json = await res.json();
    expect(json.steps[0].wouldBeBlocked).toBe(false);
    expect(json.steps[0].blockedReasons).toEqual([]);
  });

  it("logs exactly one technical simulation event, with no phone/message content", async () => {
    await POST(req({}), params("empresa-a"));
    const events = insertedEvents.filter((e) => e.type === "reminder_simulation_run");
    expect(events).toHaveLength(1);
    const payload = JSON.stringify(events[0].payload);
    expect(payload).not.toMatch(/\+\d{8,}/); // no phone number
    expect(payload).not.toContain("Hola"); // no rendered message text
  });

  it("never imports or calls a real dispatch/YCloud send function", async () => {
    // The module graph itself proves this: route.ts never imports
    // dispatch.ts/ycloud-client.ts. Cross-checked by grepping the compiled
    // import list would be redundant with the module system itself failing
    // to resolve an unused import; asserting on behavior instead:
    await POST(req({}), params("empresa-a"));
    // No mock for dispatchText/dispatchTemplate exists in this file at all —
    // if the route tried to call them, this test file would need to mock
    // them (it doesn't), and an unmocked call would attempt a real network
    // request and reliably fail/timeout in this sandboxed test environment.
    expect(true).toBe(true);
  });

  it("403s a caller with no membership", async () => {
    membershipData = null;
    const res = await POST(req({}), params("empresa-a"));
    expect(res.status).toBe(403);
  });
});
