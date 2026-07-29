import { describe, expect, it, vi, beforeEach } from "vitest";

// Verifies the sender NEVER fakes a send when evaluateSendGates blocks it
// for ANY reason (kill switch, allowlist, consent, template, pauses,
// limits, infra readiness), and that transient failures retry a bounded
// number of times — never forever — with backoff, never immediately.
// evaluateSendGates itself (send-gates.ts) is the single source of truth
// for "why blocked" and gets its own dedicated tests (send-gates.test.ts) —
// this file is about the SENDER's reaction to a gate result, mocked at that
// boundary so the two concerns don't get tangled together.

const claimed = vi.fn();
const dispatchTemplate = vi.fn();
const fillTemplateVariables = vi.fn((body: string) => body);
const getBusinessInfo = vi.fn(async () => ({ structured: { name: "Negocio Test" }, free_text: null }));
const evaluateSendGates = vi.fn();
const findApprovedTemplateForStep = vi.fn();

let dbState: {
  appointments: Record<string, { status: string; scheduled_at: string; meta: Record<string, unknown> }>;
  contacts: Record<string, { name: string; phone: string; opt_in: boolean }>;
  steps: Record<string, { name: string; message_base: string; collects_response: boolean }>;
  configs: Record<string, { timezone: string; send_window_start_minute: number; send_window_end_minute: number }>;
  updates: Array<{ table: string; id: string; patch: Record<string, unknown> }>;
  inserts: Array<{ table: string; row: Record<string, unknown> }>;
};

function resetDbState() {
  dbState = { appointments: {}, contacts: {}, steps: {}, configs: {}, updates: [], inserts: [] };
}

function makeQueryBuilder(table: string) {
  const builder: Record<string, unknown> = {};
  let selectMatchId: string | null = null;

  builder.select = () => builder;
  builder.eq = (col: string, value: string) => {
    if (col === "id" || col === "workspace_id") selectMatchId = value;
    return builder;
  };
  builder.in = () => builder;
  builder.order = () => builder;
  builder.limit = () => builder;
  builder.maybeSingle = async () => {
    if (table === "appointments") return { data: dbState.appointments[selectMatchId!] ?? null };
    if (table === "contacts") return { data: dbState.contacts[selectMatchId!] ?? null };
    if (table === "reminder_steps") return { data: dbState.steps[selectMatchId!] ?? null };
    if (table === "reminder_configs") return { data: dbState.configs[selectMatchId!] ?? null };
    return { data: null };
  };
  builder.single = builder.maybeSingle;
  // .update(patch) is always called BEFORE .eq(id) in the real chain, so the
  // match id is only known once .eq() fires — capture it there, not above.
  builder.update = (patch: Record<string, unknown>) => ({
    eq: (_col: string, value: string) => {
      dbState.updates.push({ table, id: value, patch });
      return { then: (res: (v: unknown) => void) => res({ error: null }) };
    },
  });
  builder.insert = (row: Record<string, unknown>) => {
    dbState.inserts.push({ table, row });
    return { then: (res: (v: unknown) => void) => res({ error: null }) };
  };
  return builder;
}

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => ({
    from: (table: string) => makeQueryBuilder(table),
    rpc: (name: string) => {
      if (name === "claim_due_reminder_jobs") return claimed();
      return { data: null, error: null };
    },
  })),
}));

vi.mock("../../inbox/services/dispatch", () => ({ dispatchTemplate }));
vi.mock("../../inbox/services/templates", () => ({ fillTemplateVariables }));
vi.mock("../../inbox/services/business-info", () => ({ getBusinessInfo }));
vi.mock("./send-gates", () => ({ evaluateSendGates, findApprovedTemplateForStep }));

const { processDueReminderJobs } = await import("./reminder-sender");

const BASE_JOB = {
  id: "job-1",
  workspace_id: "ws-1",
  appointment_id: "appt-1",
  step_id: "step-1",
  step_key: "reminder_24h",
  category: "appointment_reminders",
  contact_id: "contact-1",
  conversation_id: "conv-1",
  scheduled_for: new Date().toISOString(),
  attempts: 0,
};

beforeEach(() => {
  vi.clearAllMocks();
  resetDbState();
  dbState.appointments["appt-1"] = {
    status: "booked",
    scheduled_at: new Date().toISOString(),
    meta: {},
  };
  dbState.contacts["contact-1"] = { name: "Cliente", phone: "+525599990000", opt_in: true };
  dbState.steps["step-1"] = {
    name: "Recordatorio",
    message_base: "Hola {{nombre}}",
    collects_response: false,
  };
  dbState.configs["ws-1"] = {
    timezone: "America/Mexico_City",
    send_window_start_minute: 0,
    send_window_end_minute: 1439,
  };
  evaluateSendGates.mockResolvedValue({ allowed: true, blockedReasons: [] });
  findApprovedTemplateForStep.mockResolvedValue({
    name: "reminder_24h",
    language: "es",
    body_template: "Hola {{1}}",
    variables: ["1"],
    category: "utility",
  });
  dispatchTemplate.mockResolvedValue({ ok: true, wamid: "wamid-1" });
});

describe("processDueReminderJobs — never sends when evaluateSendGates blocks it", () => {
  it("agente no configurado: no envía, marca error tras agotar reintentos, nunca llama a dispatchTemplate", async () => {
    evaluateSendGates.mockResolvedValue({ allowed: false, blockedReasons: ["agent_not_configured"] });
    claimed.mockResolvedValue({ data: [{ ...BASE_JOB, attempts: 2 }], error: null }); // one retry away from MAX_ATTEMPTS
    const result = await processDueReminderJobs();
    expect(dispatchTemplate).not.toHaveBeenCalled();
    expect(result.errored).toBe(1);
    const finalUpdate = dbState.updates.find((u) => u.table === "reminder_jobs" && u.patch.status === "error");
    expect(finalUpdate?.patch.error_detail).toMatch(/agente/i);
  });

  it("WhatsApp no conectado: no envía, reintenta con retraso en vez de fallar de inmediato", async () => {
    evaluateSendGates.mockResolvedValue({ allowed: false, blockedReasons: ["whatsapp_not_connected"] });
    claimed.mockResolvedValue({ data: [BASE_JOB], error: null }); // attempts: 0 -> retry, not fail yet
    const result = await processDueReminderJobs();
    expect(dispatchTemplate).not.toHaveBeenCalled();
    expect(result.retried).toBe(1);
    const retryUpdate = dbState.updates.find((u) => u.table === "reminder_jobs" && u.patch.status === "scheduled");
    expect(retryUpdate).toBeTruthy();
    // Backoff: rescheduled strictly later than "now", never immediate re-run.
    expect(new Date(retryUpdate!.patch.scheduled_for as string).getTime()).toBeGreaterThan(Date.now());
  });

  it("OpenRouter no disponible: no envía", async () => {
    evaluateSendGates.mockResolvedValue({ allowed: false, blockedReasons: ["openrouter_not_available"] });
    claimed.mockResolvedValue({ data: [BASE_JOB], error: null });
    await processDueReminderJobs();
    expect(dispatchTemplate).not.toHaveBeenCalled();
  });

  it("interruptor global desactivado: espera indefinidamente sin penalizar intentos ni marcar error", async () => {
    evaluateSendGates.mockResolvedValue({ allowed: false, blockedReasons: ["live_sending_disabled"] });
    claimed.mockResolvedValue({ data: [{ ...BASE_JOB, attempts: 2 }], error: null }); // would fail on next retryOrFail — must NOT here
    const result = await processDueReminderJobs();
    expect(dispatchTemplate).not.toHaveBeenCalled();
    expect(result.errored).toBe(0);
    expect(result.retried).toBe(1);
    const update = dbState.updates.find((u) => u.table === "reminder_jobs");
    expect(update?.patch.status).toBe("scheduled");
    expect(update?.patch.attempts).toBeUndefined(); // no attempts penalty at all
    expect(update?.patch.scheduled_for).toBeUndefined(); // no reschedule either — pure wait
  });

  it("lista blanca vacía / número no autorizado: no envía", async () => {
    evaluateSendGates.mockResolvedValue({ allowed: false, blockedReasons: ["recipient_not_allowlisted"] });
    claimed.mockResolvedValue({ data: [BASE_JOB], error: null });
    const result = await processDueReminderJobs();
    expect(dispatchTemplate).not.toHaveBeenCalled();
    expect(result.errored).toBe(0);
  });

  it("consentimiento faltante: no envía", async () => {
    evaluateSendGates.mockResolvedValue({ allowed: false, blockedReasons: ["consent_missing"] });
    claimed.mockResolvedValue({ data: [BASE_JOB], error: null });
    const result = await processDueReminderJobs();
    expect(dispatchTemplate).not.toHaveBeenCalled();
    expect(result.retried + result.errored).toBe(1);
  });

  it("plantilla no aprobada: no envía", async () => {
    evaluateSendGates.mockResolvedValue({ allowed: false, blockedReasons: ["template_not_approved"] });
    claimed.mockResolvedValue({ data: [BASE_JOB], error: null });
    const result = await processDueReminderJobs();
    expect(dispatchTemplate).not.toHaveBeenCalled();
    expect(result.retried + result.errored).toBe(1);
  });

  it("registra un evento técnico 'reminder_send_blocked' con el motivo tipado, sin datos sensibles", async () => {
    evaluateSendGates.mockResolvedValue({ allowed: false, blockedReasons: ["consent_missing"] });
    claimed.mockResolvedValue({ data: [BASE_JOB], error: null });
    await processDueReminderJobs();
    const event = dbState.inserts.find((i) => i.table === "events" && i.row.type === "reminder_send_blocked");
    expect(event).toBeTruthy();
    expect(event?.row.payload).toMatchObject({ reasons: ["consent_missing"] });
    // Never the phone number or message content in the technical log.
    expect(JSON.stringify(event?.row.payload)).not.toContain("+525599990000");
  });

  it("error temporal de YCloud: reintenta y solo falla definitivamente tras agotar los intentos (sin bucle infinito)", async () => {
    dispatchTemplate.mockResolvedValue({ ok: false, error: "Timeout temporal de YCloud" });
    claimed.mockResolvedValue({ data: [{ ...BASE_JOB, attempts: 0 }], error: null });

    const first = await processDueReminderJobs();
    expect(first.retried).toBe(1);

    claimed.mockResolvedValue({ data: [{ ...BASE_JOB, attempts: 1 }], error: null });
    const second = await processDueReminderJobs();
    expect(second.retried).toBe(1);

    claimed.mockResolvedValue({ data: [{ ...BASE_JOB, attempts: 2 }], error: null });
    const third = await processDueReminderJobs();
    expect(third.errored).toBe(1); // MAX_ATTEMPTS reached — stops, never retries again
  });

  it("envía correctamente cuando evaluateSendGates permite todo (interruptor activado, lista blanca, consentimiento, plantilla)", async () => {
    claimed.mockResolvedValue({ data: [BASE_JOB], error: null });
    const result = await processDueReminderJobs();
    expect(evaluateSendGates).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "ws-1",
        contactId: "contact-1",
        phone: "+525599990000",
        category: "appointment_reminders",
        stepKey: "reminder_24h",
      }),
    );
    expect(dispatchTemplate).toHaveBeenCalledTimes(1);
    expect(result.sent).toBe(1);
    const sentUpdate = dbState.updates.find((u) => u.table === "reminder_jobs" && u.patch.status === "sent");
    expect(sentUpdate).toBeTruthy();
  });

  it("cita cancelada: cancela el job sin intentar enviar (nunca llega a evaluateSendGates)", async () => {
    dbState.appointments["appt-1"].status = "cancelled";
    claimed.mockResolvedValue({ data: [BASE_JOB], error: null });
    const result = await processDueReminderJobs();
    expect(dispatchTemplate).not.toHaveBeenCalled();
    expect(evaluateSendGates).not.toHaveBeenCalled();
    expect(result.cancelled).toBe(1);
  });

  it("contacto con opt-out: cancela el job sin intentar enviar (nunca llega a evaluateSendGates)", async () => {
    dbState.contacts["contact-1"].opt_in = false;
    claimed.mockResolvedValue({ data: [BASE_JOB], error: null });
    const result = await processDueReminderJobs();
    expect(dispatchTemplate).not.toHaveBeenCalled();
    expect(evaluateSendGates).not.toHaveBeenCalled();
    expect(result.cancelled).toBe(1);
  });
});
