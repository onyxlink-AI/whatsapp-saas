import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

function loadDotEnvLocal() {
  const path = resolve(process.cwd(), ".env.local");
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    if (process.env[key] !== undefined) continue;
    process.env[key] = trimmed.slice(eq + 1).trim();
  }
}
loadDotEnvLocal();

// Real-DB integration tests for the single evaluator both the sender and
// the simulator use — this is where "the kill switch/allowlist/consent/
// template are ACTUALLY enforced" gets proven end to end, against real
// Postgres RLS-backed tables, not a mock of the query builder. Skips itself
// (not fails) when the local Supabase stack isn't reachable.

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321";
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

let reachable = false;
let db: SupabaseClient;
let workspaceId: string;
let contactId: string;

const RUN_TAG = `test-send-gates-${Date.now()}`;
const POLL_TIMEOUT_MS = 20_000;

async function pollUntilReachable(check: () => Promise<boolean>): Promise<boolean> {
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  for (;;) {
    if (await check()) return true;
    if (Date.now() >= deadline) return false;
    await new Promise((r) => setTimeout(r, 500));
  }
}

beforeAll(async () => {
  db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  reachable = await pollUntilReachable(async () => {
    try {
      const r = await fetch(`${SUPABASE_URL}/rest/v1/`, {
        headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "" },
      });
      return r.status < 500;
    } catch {
      return false;
    }
  });
  if (!reachable) return;

  const { data: ws } = await db
    .from("workspaces")
    .insert({ name: RUN_TAG, slug: RUN_TAG })
    .select("id")
    .single();
  workspaceId = ws!.id as string;

  const { data: contact } = await db
    .from("contacts")
    .insert({ workspace_id: workspaceId, phone: "+525511112222", name: "Cliente Gate", opt_in: true })
    .select("id")
    .single();
  contactId = contact!.id as string;

  await db.from("reminder_configs").insert({
    workspace_id: workspaceId,
    enabled: true,
    timezone: "America/Mexico_City",
    send_window_start_minute: 0,
    send_window_end_minute: 1439,
    max_messages_per_contact_per_day: 3,
    min_minutes_between_messages: 60,
  });
}, POLL_TIMEOUT_MS + 10_000);

afterAll(async () => {
  if (!reachable) return;
  await db.from("workspaces").delete().eq("id", workspaceId);
});

afterEach(() => {
  delete process.env.REMINDERS_LIVE_SENDING_ENABLED;
  delete process.env.REMINDERS_TEST_PHONE_ALLOWLIST;
});

describe("evaluateSendGates — real DB, no external calls", () => {
  it("sin variable de entorno: bloqueado por live_sending_disabled (fail-closed por defecto)", async (ctx) => {
    if (!reachable) return ctx.skip();
    delete process.env.REMINDERS_LIVE_SENDING_ENABLED;
    const { evaluateSendGates } = await import("./send-gates");

    const result = await evaluateSendGates({
      workspaceId,
      contactId,
      phone: "+525511112222",
      category: "appointment_reminders",
      stepKey: "reminder_24h",
    });

    expect(result.allowed).toBe(false);
    expect(result.blockedReasons).toContain("live_sending_disabled");
  });

  it("interruptor activado pero lista blanca vacía: bloqueado por recipient_not_allowlisted", async (ctx) => {
    if (!reachable) return ctx.skip();
    process.env.REMINDERS_LIVE_SENDING_ENABLED = "true";
    delete process.env.REMINDERS_TEST_PHONE_ALLOWLIST;
    const { evaluateSendGates } = await import("./send-gates");

    const result = await evaluateSendGates({
      workspaceId,
      contactId,
      phone: "+525511112222",
      category: "appointment_reminders",
      stepKey: "reminder_24h",
    });

    expect(result.blockedReasons).not.toContain("live_sending_disabled");
    expect(result.blockedReasons).toContain("recipient_not_allowlisted");
  });

  it("número no autorizado (lista blanca con otros números): bloqueado", async (ctx) => {
    if (!reachable) return ctx.skip();
    process.env.REMINDERS_LIVE_SENDING_ENABLED = "true";
    process.env.REMINDERS_TEST_PHONE_ALLOWLIST = "+525500000001,+525500000002";
    const { evaluateSendGates } = await import("./send-gates");

    const result = await evaluateSendGates({
      workspaceId,
      contactId,
      phone: "+525511112222",
      category: "appointment_reminders",
      stepKey: "reminder_24h",
    });

    expect(result.blockedReasons).toContain("recipient_not_allowlisted");
  });

  it("número SÍ incluido en la lista blanca: ya no bloquea por ese motivo", async (ctx) => {
    if (!reachable) return ctx.skip();
    process.env.REMINDERS_LIVE_SENDING_ENABLED = "true";
    process.env.REMINDERS_TEST_PHONE_ALLOWLIST = "+525511112222";
    const { evaluateSendGates } = await import("./send-gates");

    const result = await evaluateSendGates({
      workspaceId,
      contactId,
      phone: "+525511112222",
      category: "appointment_reminders",
      stepKey: "reminder_24h",
    });

    expect(result.blockedReasons).not.toContain("recipient_not_allowlisted");
  });

  it("consentimiento general (opt_in) sin consentimiento granular: bloqueado por consent_missing", async (ctx) => {
    if (!reachable) return ctx.skip();
    // contact.opt_in is true (set in beforeAll) but no reminder_consents row exists.
    const { evaluateSendGates } = await import("./send-gates");
    const result = await evaluateSendGates({
      workspaceId,
      contactId,
      phone: "+525511112222",
      category: "appointment_reminders",
      stepKey: "reminder_24h",
    });
    expect(result.blockedReasons).toContain("consent_missing");
  });

  it("consentimiento de citas no autoriza seguimiento posterior (categoría distinta)", async (ctx) => {
    if (!reachable) return ctx.skip();
    const { grantConsent } = await import("./consent");
    const { evaluateSendGates } = await import("./send-gates");

    await grantConsent(workspaceId, contactId, "appointment_reminders", "whatsapp_reply");

    const forGranted = await evaluateSendGates({
      workspaceId,
      contactId,
      phone: "+525511112222",
      category: "appointment_reminders",
      stepKey: "reminder_24h",
    });
    expect(forGranted.blockedReasons).not.toContain("consent_missing");

    const forOtherCategory = await evaluateSendGates({
      workspaceId,
      contactId,
      phone: "+525511112222",
      category: "aftercare_followup",
      stepKey: "aftercare",
    });
    expect(forOtherCategory.blockedReasons).toContain("consent_missing");
  });

  it("plantilla no aprobada: bloqueado por template_not_approved", async (ctx) => {
    if (!reachable) return ctx.skip();
    const { evaluateSendGates } = await import("./send-gates");
    const result = await evaluateSendGates({
      workspaceId,
      contactId,
      phone: "+525511112222",
      category: "appointment_reminders",
      stepKey: "a_step_with_no_template_anywhere",
    });
    expect(result.blockedReasons).toContain("template_not_approved");
  });

  it("workspace pausado: bloqueado por workspace_paused", async (ctx) => {
    if (!reachable) return ctx.skip();
    await db.from("reminder_configs").update({ paused_at: new Date().toISOString() }).eq("workspace_id", workspaceId);
    const { evaluateSendGates } = await import("./send-gates");
    const result = await evaluateSendGates({
      workspaceId,
      contactId,
      phone: "+525511112222",
      category: "appointment_reminders",
      stepKey: "reminder_24h",
    });
    expect(result.blockedReasons).toContain("workspace_paused");
    await db.from("reminder_configs").update({ paused_at: null }).eq("workspace_id", workspaceId);
  });

  it("contacto pausado: bloqueado por contact_paused", async (ctx) => {
    if (!reachable) return ctx.skip();
    const { pauseContact, resumeContact } = await import("./contact-pause");
    const { evaluateSendGates } = await import("./send-gates");

    await pauseContact(workspaceId, contactId, "prueba");
    const result = await evaluateSendGates({
      workspaceId,
      contactId,
      phone: "+525511112222",
      category: "appointment_reminders",
      stepKey: "reminder_24h",
    });
    expect(result.blockedReasons).toContain("contact_paused");

    await resumeContact(workspaceId, contactId);
    const after = await evaluateSendGates({
      workspaceId,
      contactId,
      phone: "+525511112222",
      category: "appointment_reminders",
      stepKey: "reminder_24h",
    });
    expect(after.blockedReasons).not.toContain("contact_paused");
  });

  it("opt-out general: bloqueado por opted_out", async (ctx) => {
    if (!reachable) return ctx.skip();
    await db.from("contacts").update({ opt_in: false }).eq("id", contactId);
    const { evaluateSendGates } = await import("./send-gates");
    const result = await evaluateSendGates({
      workspaceId,
      contactId,
      phone: "+525511112222",
      category: "appointment_reminders",
      stepKey: "reminder_24h",
    });
    expect(result.blockedReasons).toContain("opted_out");
    await db.from("contacts").update({ opt_in: true }).eq("id", contactId);
  });

  it("retirar el consentimiento de una categoría cancela solo los jobs de esa categoría", async (ctx) => {
    if (!reachable) return ctx.skip();
    const { grantConsent, withdrawConsent } = await import("./consent");

    await grantConsent(workspaceId, contactId, "appointment_reminders", "whatsapp_reply");
    await grantConsent(workspaceId, contactId, "aftercare_followup", "whatsapp_reply");

    // Fabricate one scheduled job per category directly (isolated from the
    // appointment-lifecycle machinery — this test is only about consent
    // withdrawal's cancellation scope).
    const { data: apptRow } = await db
      .from("appointments")
      .insert({ workspace_id: workspaceId, contact_id: contactId, scheduled_at: new Date(Date.now() + 86_400_000).toISOString(), status: "booked" })
      .select("id")
      .single();
    const appointmentId = apptRow!.id as string;

    await db.from("reminder_jobs").insert([
      {
        workspace_id: workspaceId,
        appointment_id: appointmentId,
        step_key: "reminder_24h",
        category: "appointment_reminders",
        contact_id: contactId,
        scheduled_for: new Date(Date.now() + 3600_000).toISOString(),
        idempotency_key: `${appointmentId}:reminder_24h:consent-test`,
      },
      {
        workspace_id: workspaceId,
        appointment_id: appointmentId,
        step_key: "aftercare",
        category: "aftercare_followup",
        contact_id: contactId,
        scheduled_for: new Date(Date.now() + 7200_000).toISOString(),
        idempotency_key: `${appointmentId}:aftercare:consent-test`,
      },
    ]);

    await withdrawConsent(workspaceId, contactId, "aftercare_followup");

    const { data: jobs } = await db
      .from("reminder_jobs")
      .select("category, status")
      .eq("appointment_id", appointmentId);

    const reminder = jobs!.find((j) => j.category === "appointment_reminders")!;
    const aftercare = jobs!.find((j) => j.category === "aftercare_followup")!;
    expect(reminder.status).toBe("scheduled"); // untouched
    expect(aftercare.status).toBe("cancelled"); // only this category cancelled

    await db.from("appointments").delete().eq("id", appointmentId);
  });

  it("aislamiento entre empresas: el consentimiento de una empresa no autoriza el contacto homónimo de otra", async (ctx) => {
    if (!reachable) return ctx.skip();
    const { data: otherWs } = await db
      .from("workspaces")
      .insert({ name: `${RUN_TAG}-other`, slug: `${RUN_TAG}-other` })
      .select("id")
      .single();
    const otherWorkspaceId = otherWs!.id as string;
    const { data: otherContact } = await db
      .from("contacts")
      .insert({ workspace_id: otherWorkspaceId, phone: "+525511112222", name: "Cliente Gate", opt_in: true })
      .select("id")
      .single();
    const otherContactId = otherContact!.id as string;
    await db.from("reminder_configs").insert({
      workspace_id: otherWorkspaceId,
      enabled: true,
      timezone: "America/Mexico_City",
      send_window_start_minute: 0,
      send_window_end_minute: 1439,
    });

    const { grantConsent } = await import("./consent");
    await grantConsent(workspaceId, contactId, "appointment_reminders", "whatsapp_reply");

    const { evaluateSendGates } = await import("./send-gates");
    const otherResult = await evaluateSendGates({
      workspaceId: otherWorkspaceId,
      contactId: otherContactId,
      phone: "+525511112222",
      category: "appointment_reminders",
      stepKey: "reminder_24h",
    });

    // Consent granted for Empresa A's contact must NOT leak to Empresa B's
    // contact, even with the same phone number.
    expect(otherResult.blockedReasons).toContain("consent_missing");

    await db.from("workspaces").delete().eq("id", otherWorkspaceId);
  });

  it("límite diario alcanzado: bloqueado por daily_limit_reached", async (ctx) => {
    if (!reachable) return ctx.skip();
    await db
      .from("reminder_configs")
      .update({ max_messages_per_contact_per_day: 1 })
      .eq("workspace_id", workspaceId);

    // Fabricate one job already 'sent' today for this contact.
    const { data: apptRow } = await db
      .from("appointments")
      .insert({ workspace_id: workspaceId, contact_id: contactId, scheduled_at: new Date().toISOString(), status: "booked" })
      .select("id")
      .single();
    const appointmentId = apptRow!.id as string;
    await db.from("reminder_jobs").insert({
      workspace_id: workspaceId,
      appointment_id: appointmentId,
      step_key: "reminder_24h",
      category: "appointment_reminders",
      contact_id: contactId,
      scheduled_for: new Date().toISOString(),
      status: "sent",
      sent_at: new Date().toISOString(),
      idempotency_key: `${appointmentId}:reminder_24h:daily-limit-test`,
    });

    const { evaluateSendGates } = await import("./send-gates");
    const result = await evaluateSendGates({
      workspaceId,
      contactId,
      phone: "+525511112222",
      category: "appointment_reminders",
      stepKey: "reminder_24h",
    });
    expect(result.blockedReasons).toContain("daily_limit_reached");

    await db.from("appointments").delete().eq("id", appointmentId);
    await db.from("reminder_configs").update({ max_messages_per_contact_per_day: 3 }).eq("workspace_id", workspaceId);
  });

  it("muy pronto después del último mensaje: bloqueado por too_soon_after_last_message", async (ctx) => {
    if (!reachable) return ctx.skip();
    // min_minutes_between_messages = 60 (set in beforeAll) — a message sent
    // 5 minutes ago is well inside that window.
    const { data: apptRow } = await db
      .from("appointments")
      .insert({ workspace_id: workspaceId, contact_id: contactId, scheduled_at: new Date().toISOString(), status: "booked" })
      .select("id")
      .single();
    const appointmentId = apptRow!.id as string;
    await db.from("reminder_jobs").insert({
      workspace_id: workspaceId,
      appointment_id: appointmentId,
      step_key: "reminder_24h",
      category: "appointment_reminders",
      contact_id: contactId,
      scheduled_for: new Date().toISOString(),
      status: "sent",
      sent_at: new Date(Date.now() - 5 * 60_000).toISOString(),
      idempotency_key: `${appointmentId}:reminder_24h:spacing-test`,
    });

    const { evaluateSendGates } = await import("./send-gates");
    const result = await evaluateSendGates({
      workspaceId,
      contactId,
      phone: "+525511112222",
      category: "appointment_reminders",
      stepKey: "reminder_24h",
    });
    expect(result.blockedReasons).toContain("too_soon_after_last_message");

    await db.from("appointments").delete().eq("id", appointmentId);
  });
});
