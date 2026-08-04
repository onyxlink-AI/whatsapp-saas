import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// `vitest run` does not load .env.local the way `next dev`/`next build` do —
// read it directly so this test sees the same local Supabase credentials the
// app itself uses. Same technique as rls-helper-privileges.test.ts.
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

// These test the REAL multi-table scheduling/lifecycle logic (unique
// constraints, cascades, idempotency, cross-tenant isolation) against the
// real local Postgres — a mock of Supabase's query builder would only prove
// the mock, not the actual DB constraints these guarantees depend on. Skips
// itself (not fails) when the local stack isn't reachable, same as
// rls-helper-privileges.test.ts, so `npm test` stays safe without it running.

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321";
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

let reachable = false;
let db: SupabaseClient;

const POLL_TIMEOUT_MS = 20_000;
const POLL_INTERVAL_MS = 500;

async function pollUntilReachable(check: () => Promise<boolean>): Promise<boolean> {
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  for (;;) {
    if (await check()) return true;
    if (Date.now() >= deadline) return false;
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
}

let workspaceAId: string;
let workspaceBId: string;
let contactId: string;
let conversationId: string;

const RUN_TAG = `test-reminders-${Date.now()}`;

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

  // gestion_enabled: true — chk_whatsapp_requires_gestion (Fase 1 del roadmap
  // comercial) prohíbe whatsapp_agent_enabled=true (el default) con
  // gestion_enabled=false (también el default); este fixture no ejercita
  // Gestión, solo necesita pasar el constraint.
  const { data: wsA, error: wsAErr } = await db
    .from("workspaces")
    .insert({ name: `${RUN_TAG}-A`, slug: `${RUN_TAG}-a`, gestion_enabled: true })
    .select("id")
    .single();
  if (wsAErr || !wsA) throw new Error(`fixture workspace A failed: ${wsAErr?.message}`);
  workspaceAId = wsA.id as string;

  const { data: wsB, error: wsBErr } = await db
    .from("workspaces")
    .insert({ name: `${RUN_TAG}-B`, slug: `${RUN_TAG}-b`, gestion_enabled: true })
    .select("id")
    .single();
  if (wsBErr || !wsB) throw new Error(`fixture workspace B failed: ${wsBErr?.message}`);
  workspaceBId = wsB.id as string;

  const { data: contact, error: contactErr } = await db
    .from("contacts")
    .insert({ workspace_id: workspaceAId, phone: "+525500000001", name: "Cliente de prueba", opt_in: true })
    .select("id")
    .single();
  if (contactErr || !contact) throw new Error(`fixture contact failed: ${contactErr?.message}`);
  contactId = contact.id as string;

  const { data: conv, error: convErr } = await db
    .from("conversations")
    .insert({ workspace_id: workspaceAId, contact_id: contactId, channel: "whatsapp" })
    .select("id")
    .single();
  if (convErr || !conv) throw new Error(`fixture conversation failed: ${convErr?.message}`);
  conversationId = conv.id as string;

  // Reminders config: 24h-open send window so these tests exercise pure
  // scheduling/lifecycle logic without the window-shift behavior (already
  // covered exhaustively by scheduling.test.ts).
  await db.from("reminder_configs").insert({
    workspace_id: workspaceAId,
    enabled: true,
    timezone: "America/Mexico_City",
    send_window_start_minute: 0,
    send_window_end_minute: 1439,
  });
  await db.from("reminder_steps").insert([
    {
      workspace_id: workspaceAId,
      step_key: "before",
      name: "Recordatorio antes",
      position: 0,
      offset_minutes: -60,
      message_base: "Hola {{nombre}}",
      collects_response: true,
    },
    {
      workspace_id: workspaceAId,
      step_key: "after",
      name: "Seguimiento después",
      position: 1,
      offset_minutes: 60,
      message_base: "Hola {{nombre}}, seguimiento",
      collects_response: true,
    },
  ]);
}, POLL_TIMEOUT_MS + 10_000);

afterAll(async () => {
  if (!reachable) return;
  // Cascades: appointments -> reminder_jobs, workspace -> everything else.
  await db.from("workspaces").delete().in("id", [workspaceAId, workspaceBId]);
});

async function createTestAppointment(scheduledAt: string) {
  const { data, error } = await db
    .from("appointments")
    .insert({
      workspace_id: workspaceAId,
      contact_id: contactId,
      conversation_id: conversationId,
      scheduled_at: scheduledAt,
      status: "booked",
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(`appointment insert failed: ${error?.message}`);
  return data.id as string;
}

async function jobsFor(appointmentId: string) {
  const { data } = await db
    .from("reminder_jobs")
    .select("*")
    .eq("appointment_id", appointmentId);
  return data ?? [];
}

describe("reminders engine — real DB integration", () => {
  it("scheduleJobsForAppointment creates one job per enabled step, respecting offsets", async (ctx) => {
    if (!reachable) return ctx.skip();
    const { scheduleJobsForAppointment } = await import("./job-scheduling");

    const scheduledAt = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString();
    const appointmentId = await createTestAppointment(scheduledAt);

    const result = await scheduleJobsForAppointment(appointmentId);
    expect(result.created).toBe(2);

    const jobs = await jobsFor(appointmentId);
    expect(jobs).toHaveLength(2);
    expect(jobs.every((j) => j.status === "scheduled")).toBe(true);
    const beforeJob = jobs.find((j) => j.step_key === "before")!;
    const afterJob = jobs.find((j) => j.step_key === "after")!;
    expect(new Date(beforeJob.scheduled_for).getTime()).toBe(new Date(scheduledAt).getTime() - 60 * 60_000);
    expect(new Date(afterJob.scheduled_for).getTime()).toBe(new Date(scheduledAt).getTime() + 60 * 60_000);
  });

  it("idempotencia: llamar scheduleJobsForAppointment dos veces no duplica los jobs", async (ctx) => {
    if (!reachable) return ctx.skip();
    const { scheduleJobsForAppointment } = await import("./job-scheduling");

    const scheduledAt = new Date(Date.now() + 6 * 24 * 60 * 60 * 1000).toISOString();
    const appointmentId = await createTestAppointment(scheduledAt);

    const first = await scheduleJobsForAppointment(appointmentId);
    const second = await scheduleJobsForAppointment(appointmentId);

    expect(first.created).toBe(2);
    expect(second.created).toBe(0); // idempotent no-op the second time

    const jobs = await jobsFor(appointmentId);
    expect(jobs).toHaveLength(2); // still exactly 2, never 4
  });

  it("reprogramar: cancela los jobs anteriores y crea nuevos con las fechas correctas", async (ctx) => {
    if (!reachable) return ctx.skip();
    const { rescheduleAppointment } = await import("./appointment-lifecycle");
    const { scheduleJobsForAppointment } = await import("./job-scheduling");

    const original = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const appointmentId = await createTestAppointment(original);
    await scheduleJobsForAppointment(appointmentId);

    const originalJobs = await jobsFor(appointmentId);
    const originalJobIds = originalJobs.map((j) => j.id);

    const rescheduled = new Date(Date.now() + 12 * 24 * 60 * 60 * 1000).toISOString();
    await rescheduleAppointment(appointmentId, rescheduled);

    const jobsAfter = await jobsFor(appointmentId);
    const cancelledOriginals = jobsAfter.filter((j) => originalJobIds.includes(j.id));
    expect(cancelledOriginals.every((j) => j.status === "cancelled")).toBe(true);
    expect(cancelledOriginals.every((j) => j.cancel_reason === "rescheduled")).toBe(true);

    const activeJobs = jobsAfter.filter((j) => j.status === "scheduled");
    expect(activeJobs).toHaveLength(2);
    const beforeJob = activeJobs.find((j) => j.step_key === "before")!;
    expect(new Date(beforeJob.scheduled_for).getTime()).toBe(new Date(rescheduled).getTime() - 60 * 60_000);

    // No duplicates: exactly 2 original (now cancelled) + 2 new = 4 total, never more.
    expect(jobsAfter).toHaveLength(4);
  });

  it("si un paso ya fue enviado, reprogramar no lo duplica", async (ctx) => {
    if (!reachable) return ctx.skip();
    const { rescheduleAppointment } = await import("./appointment-lifecycle");
    const { scheduleJobsForAppointment } = await import("./job-scheduling");

    const scheduledAt = new Date(Date.now() + 8 * 24 * 60 * 60 * 1000).toISOString();
    const appointmentId = await createTestAppointment(scheduledAt);
    await scheduleJobsForAppointment(appointmentId);

    const jobs = await jobsFor(appointmentId);
    const beforeJob = jobs.find((j) => j.step_key === "before")!;
    await db.from("reminder_jobs").update({ status: "sent", sent_at: new Date().toISOString() }).eq("id", beforeJob.id);

    await rescheduleAppointment(appointmentId, new Date(Date.now() + 9 * 24 * 60 * 60 * 1000).toISOString());

    const jobsAfter = await jobsFor(appointmentId);
    const beforeJobs = jobsAfter.filter((j) => j.step_key === "before");
    // Only the one already-sent "before" job — never a second one.
    expect(beforeJobs).toHaveLength(1);
    expect(beforeJobs[0].status).toBe("sent");
  });

  it("cancelar la cita cancela todos sus recordatorios pendientes", async (ctx) => {
    if (!reachable) return ctx.skip();
    const { cancelAppointment } = await import("./appointment-lifecycle");
    const { scheduleJobsForAppointment } = await import("./job-scheduling");

    const scheduledAt = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString();
    const appointmentId = await createTestAppointment(scheduledAt);
    await scheduleJobsForAppointment(appointmentId);

    await cancelAppointment(appointmentId, "cliente_cancelo");

    const jobs = await jobsFor(appointmentId);
    expect(jobs.every((j) => j.status === "cancelled")).toBe(true);
    expect(jobs.every((j) => j.cancel_reason === "cliente_cancelo")).toBe(true);

    const { data: appt } = await db.from("appointments").select("status").eq("id", appointmentId).single();
    expect(appt?.status).toBe("cancelled");
  });

  it("no presentado (no_show) cancela los pasos posteriores salvo que el negocio lo permita", async (ctx) => {
    if (!reachable) return ctx.skip();
    const { markAppointmentNoShow } = await import("./appointment-lifecycle");
    const { scheduleJobsForAppointment } = await import("./job-scheduling");

    const scheduledAt = new Date(Date.now() - 60_000).toISOString(); // already past
    const appointmentId = await createTestAppointment(scheduledAt);
    // Manually insert an "after" job as if it survived from before the no-show
    // (the real before-step would already be in the past and thus skipped).
    await db.from("reminder_jobs").insert({
      workspace_id: workspaceAId,
      appointment_id: appointmentId,
      step_key: "after",
      contact_id: contactId,
      conversation_id: conversationId,
      scheduled_for: new Date(Date.now() + 60_000).toISOString(),
      idempotency_key: `${appointmentId}:after:manual`,
    });

    await markAppointmentNoShow(appointmentId);

    const jobs = await jobsFor(appointmentId);
    const afterJob = jobs.find((j) => j.step_key === "after")!;
    expect(afterJob.status).toBe("cancelled");
    expect(afterJob.cancel_reason).toBe("no_show");

    // scheduleJobsForAppointment must also refuse to recreate it afterwards.
    const result = await scheduleJobsForAppointment(appointmentId);
    expect(result.created).toBe(0);
  });

  it("pausa manual cancela los jobs pendientes de una cita con un motivo identificable", async (ctx) => {
    if (!reachable) return ctx.skip();
    const { pauseJobsForAppointment } = await import("./job-scheduling");
    const { scheduleJobsForAppointment } = await import("./job-scheduling");

    const scheduledAt = new Date(Date.now() + 11 * 24 * 60 * 60 * 1000).toISOString();
    const appointmentId = await createTestAppointment(scheduledAt);
    await scheduleJobsForAppointment(appointmentId);

    const cancelledCount = await pauseJobsForAppointment(appointmentId);
    expect(cancelledCount).toBe(2);

    const jobs = await jobsFor(appointmentId);
    expect(jobs.every((j) => j.status === "cancelled" && j.cancel_reason === "paused_by_team")).toBe(true);
  });

  it("baja del cliente (opt-out) cancela sus recordatorios pendientes en todas sus citas", async (ctx) => {
    if (!reachable) return ctx.skip();
    const { cancelJobsForContact } = await import("./job-scheduling");
    const { scheduleJobsForAppointment } = await import("./job-scheduling");

    const scheduledAt = new Date(Date.now() + 13 * 24 * 60 * 60 * 1000).toISOString();
    const appointmentId = await createTestAppointment(scheduledAt);
    await scheduleJobsForAppointment(appointmentId);

    const cancelledCount = await cancelJobsForContact(contactId, "opt_out");
    expect(cancelledCount).toBeGreaterThanOrEqual(2);

    const jobs = await jobsFor(appointmentId);
    expect(jobs.every((j) => j.status === "cancelled" && j.cancel_reason === "opt_out")).toBe(true);
  });

  it("aislamiento entre empresas: los jobs de la cita de Empresa A nunca aparecen bajo el workspace_id de Empresa B", async (ctx) => {
    if (!reachable) return ctx.skip();
    const { scheduleJobsForAppointment } = await import("./job-scheduling");

    const scheduledAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();
    const appointmentId = await createTestAppointment(scheduledAt);
    await scheduleJobsForAppointment(appointmentId);

    const { data: crossTenantLeak } = await db
      .from("reminder_jobs")
      .select("id")
      .eq("appointment_id", appointmentId)
      .eq("workspace_id", workspaceBId);

    expect(crossTenantLeak ?? []).toHaveLength(0);

    const { data: correctlyScoped } = await db
      .from("reminder_jobs")
      .select("id")
      .eq("appointment_id", appointmentId)
      .eq("workspace_id", workspaceAId);
    expect((correctlyScoped ?? []).length).toBeGreaterThan(0);
  });

  it("getOrCreateReminderConfig is race-safe: two concurrent calls for a brand-new workspace never throw a duplicate-key error", async (ctx) => {
    if (!reachable) return ctx.skip();
    const { getOrCreateReminderConfig } = await import("./reminder-config");

    // A dedicated brand-new workspace with NO reminder_configs row yet — this
    // is exactly what GET .../reminders/config's Promise.all races the very
    // first time a workspace opens the tab (found via live verification: the
    // route's own call and getReminderReadiness()'s internal call raced and
    // one lost with "duplicate key value violates unique constraint").
    const { data: freshWs } = await db
      .from("workspaces")
      .insert({ name: `${RUN_TAG}-race`, slug: `${RUN_TAG}-race`, gestion_enabled: true })
      .select("id")
      .single();
    const freshWsId = freshWs!.id as string;

    try {
      const [a, b] = await Promise.all([
        getOrCreateReminderConfig(freshWsId),
        getOrCreateReminderConfig(freshWsId),
      ]);
      expect(a.id).toBe(b.id);

      const { data: rows } = await db.from("reminder_configs").select("id").eq("workspace_id", freshWsId);
      expect(rows).toHaveLength(1);
    } finally {
      await db.from("workspaces").delete().eq("id", freshWsId);
    }
  });

  it("sin REMINDERS_LIVE_SENDING_ENABLED: el pipeline real completo nunca envía, nunca marca 'sent', y nunca lanza un error de red — cero llamadas externas", async (ctx) => {
    if (!reachable) return ctx.skip();
    delete process.env.REMINDERS_LIVE_SENDING_ENABLED;
    delete process.env.REMINDERS_TEST_PHONE_ALLOWLIST;

    // The REAL sender end to end (not mocked) — dispatchTemplate is the real
    // implementation too. If the kill switch didn't block before reaching
    // it, this would attempt a real HTTP call to YCloud and either hang or
    // throw in this sandboxed test environment; it never gets that far.
    const { processDueReminderJobs } = await import("./reminder-sender");

    const appointmentId = await createTestAppointment(new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString());
    const { data: jobInsert } = await db
      .from("reminder_jobs")
      .insert({
        workspace_id: workspaceAId,
        appointment_id: appointmentId,
        step_key: "reminder_24h",
        category: "appointment_reminders",
        contact_id: contactId,
        conversation_id: conversationId,
        scheduled_for: new Date(Date.now() - 60_000).toISOString(), // already due
        idempotency_key: `${appointmentId}:reminder_24h:kill-switch-test`,
      })
      .select("id")
      .single();
    const jobId = jobInsert!.id as string;

    const result = await processDueReminderJobs();
    // The fixture workspace also has no active agent/WhatsApp/template
    // configured, so evaluateSendGates blocks for several reasons at once —
    // what matters here is the invariant that holds regardless: never sent,
    // never left claimed as 'processing', and the kill switch's own reason
    // is recorded even alongside the others.
    expect(result.sent).toBe(0);

    const { data: job } = await db
      .from("reminder_jobs")
      .select("status, error_detail, attempts")
      .eq("id", jobId)
      .single();
    expect(job!.status).not.toBe("sent");
    expect(job!.status).not.toBe("processing");
    expect(job!.error_detail).toContain("Envíos reales bloqueados");
  });
});
