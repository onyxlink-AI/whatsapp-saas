import { createClient as createSbClient } from "@supabase/supabase-js";
import { dispatchTemplate } from "../../inbox/services/dispatch";
import { fillTemplateVariables } from "../../inbox/services/templates";
import { getBusinessInfo } from "../../inbox/services/business-info";
import { getOrCreateReminderConfig } from "./reminder-config";
import { evaluateSendGates, findApprovedTemplateForStep } from "./send-gates";
import { adjustToAllowedWindow } from "../lib/scheduling";
import { REASON_LABELS_ES, type SendBlockReason } from "../lib/send-guard-types";

// The deterministic sender — the ONLY place a reminder_job actually goes out.
// Mirrors appointment-reminders.ts's own send shape exactly (dispatchTemplate,
// approved-template lookup, events logging) so this reads as "the same
// system, generalized to N steps" rather than a parallel mechanism. Every
// authorization check (kill switch, allowlist, consent, template, pauses,
// limits, infra readiness) goes through evaluateSendGates() in send-gates.ts
// — the exact same function the safe simulator uses — so the two can never
// silently disagree about what would be blocked and why.

const MAX_ATTEMPTS = 3;
const RETRY_BACKOFF_MINUTES = 15;

// These two reasons only change when an operator flips a switch/edits the
// allowlist — never from the mere passage of time — so retrying them on the
// normal bounded backoff would eventually (and misleadingly) mark a
// perfectly fine, deliberately-not-live-yet job as "error". They wait
// indefinitely instead: same 'scheduled' status, no attempts penalty, no
// scheduled_for change, re-evaluated fresh on every cron tick.
const INDEFINITE_WAIT_REASONS: SendBlockReason[] = [
  "live_sending_disabled",
  "recipient_not_allowlisted",
];

function svc() {
  return createSbClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

interface ClaimedJob {
  id: string;
  workspace_id: string;
  appointment_id: string;
  step_id: string | null;
  step_key: string;
  category: "appointment_reminders" | "aftercare_followup" | "review_request";
  contact_id: string | null;
  conversation_id: string | null;
  scheduled_for: string;
  attempts: number;
}

async function formatApptTime(workspaceId: string, scheduledAt: string, timezone: string): Promise<string> {
  try {
    return new Intl.DateTimeFormat("es", {
      timeZone: timezone,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(new Date(scheduledAt));
  } catch {
    // Intl.DateTimeFormat throws for an invalid IANA timezone string (e.g. a
    // workspace config that was never validated) — a raw UTC HH:MM is a safe,
    // never-crashing fallback for a template variable, not a silently
    // swallowed real error.
    return new Date(scheduledAt).toISOString().slice(11, 16);
  }
}

/**
 * Bounded, backed-off retry for genuine per-job problems (missing template,
 * missing consent, daily limit, a real send error...) — after MAX_ATTEMPTS
 * it gives up and surfaces as 'error' so an admin notices. Never immediate
 * (avoids hammering a permanently-broken condition every cron tick), and the
 * retry time itself is adjusted back into the allowed send window — a
 * window-violating backoff would otherwise be able to sneak a job outside
 * business hours, which the task explicitly forbids even on retry.
 */
async function retryOrFail(
  db: ReturnType<typeof svc>,
  job: ClaimedJob,
  errorDetail: string,
): Promise<"retry" | "failed"> {
  const attempts = job.attempts + 1;
  if (attempts >= MAX_ATTEMPTS) {
    await db
      .from("reminder_jobs")
      .update({ status: "error", attempts, error_detail: errorDetail })
      .eq("id", job.id);
    return "failed";
  }

  const config = await getOrCreateReminderConfig(job.workspace_id);
  const rawNextTry = new Date(Date.now() + RETRY_BACKOFF_MINUTES * attempts * 60_000);
  const adjusted = adjustToAllowedWindow(rawNextTry, {
    timezone: config.timezone,
    startMinute: config.send_window_start_minute,
    endMinute: config.send_window_end_minute,
  });
  await db
    .from("reminder_jobs")
    .update({
      status: "scheduled",
      attempts,
      error_detail: errorDetail,
      scheduled_for: adjusted.scheduledFor.toISOString(),
    })
    .eq("id", job.id);
  return "retry";
}

/**
 * live_sending_disabled / recipient_not_allowlisted only change when an
 * operator flips a switch/edits the allowlist, never with time — so they
 * wait indefinitely (unchanged status, no attempts penalty, no
 * scheduled_for change) instead of eventually being marked 'error' for a
 * condition that was never actually a problem with the job itself.
 */
async function waitIndefinitely(
  db: ReturnType<typeof svc>,
  job: ClaimedJob,
  errorDetail: string,
): Promise<void> {
  await db
    .from("reminder_jobs")
    .update({ status: "scheduled", error_detail: errorDetail })
    .eq("id", job.id);
}

export interface ProcessResult {
  sent: number;
  cancelled: number;
  errored: number;
  retried: number;
}

export async function processDueReminderJobs(limit = 20): Promise<ProcessResult> {
  const db = svc();
  const result: ProcessResult = { sent: 0, cancelled: 0, errored: 0, retried: 0 };

  const { data: claimed, error: claimError } = await db.rpc("claim_due_reminder_jobs", {
    p_limit: limit,
  });
  if (claimError) {
    console.error("[reminder-sender] claim_due_reminder_jobs failed:", claimError.message);
    return result;
  }

  for (const job of (claimed as ClaimedJob[] | null) ?? []) {
    try {
      await processJob(db, job, result);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "unknown error";
      console.error("[reminder-sender] job failed:", job.id, msg);
      const outcome = await retryOrFail(db, job, msg);
      if (outcome === "failed") result.errored++;
      else result.retried++;
    }
  }

  return result;
}

async function processJob(
  db: ReturnType<typeof svc>,
  job: ClaimedJob,
  result: ProcessResult,
): Promise<void> {
  if (!job.contact_id || !job.conversation_id) {
    await db
      .from("reminder_jobs")
      .update({ status: "cancelled", cancel_reason: "sin_contacto_o_conversacion" })
      .eq("id", job.id);
    result.cancelled++;
    return;
  }

  const { data: appt } = await db
    .from("appointments")
    .select("status, scheduled_at, meta")
    .eq("id", job.appointment_id)
    .maybeSingle();

  if (!appt || (appt as { status: string }).status === "cancelled") {
    await db
      .from("reminder_jobs")
      .update({ status: "cancelled", cancel_reason: "cita_cancelada" })
      .eq("id", job.id);
    result.cancelled++;
    return;
  }

  const { data: contact } = await db
    .from("contacts")
    .select("name, phone, opt_in")
    .eq("id", job.contact_id)
    .maybeSingle();

  if (!contact || (contact as { opt_in: boolean }).opt_in === false) {
    await db
      .from("reminder_jobs")
      .update({ status: "cancelled", cancel_reason: "opt_out" })
      .eq("id", job.id);
    result.cancelled++;
    return;
  }

  // Single source of truth for "is this actually allowed to go out right
  // now" — kill switch, allowlist, consent, approved template, pauses,
  // per-contact limits, infra readiness. Never fakes a send: any missing
  // requirement blocks here, before dispatchTemplate is ever called.
  const gate = await evaluateSendGates({
    workspaceId: job.workspace_id,
    contactId: job.contact_id,
    phone: (contact as { phone: string }).phone,
    category: job.category,
    stepKey: job.step_key,
  });

  if (!gate.allowed) {
    await db.from("events").insert({
      type: "reminder_send_blocked",
      level: "warn",
      workspace_id: job.workspace_id,
      conversation_id: job.conversation_id,
      payload: {
        reminder_job_id: job.id,
        appointment_id: job.appointment_id,
        step_key: job.step_key,
        reasons: gate.blockedReasons,
      },
    });

    const label = gate.blockedReasons.map((r) => REASON_LABELS_ES[r]).join(" · ");
    const onlyIndefiniteWaits = gate.blockedReasons.every((r) =>
      INDEFINITE_WAIT_REASONS.includes(r),
    );
    if (onlyIndefiniteWaits) {
      await waitIndefinitely(db, job, label);
      result.retried++;
      return;
    }
    const outcome = await retryOrFail(db, job, label);
    if (outcome === "failed") result.errored++;
    else result.retried++;
    return;
  }

  const { data: step } = job.step_id
    ? await db.from("reminder_steps").select("*").eq("id", job.step_id).maybeSingle()
    : { data: null };

  const stepRow = step as {
    name: string;
    message_base: string;
    collects_response: boolean;
  } | null;

  const config = await getOrCreateReminderConfig(job.workspace_id);
  const timezone = config.timezone;

  const info = await getBusinessInfo(job.workspace_id);
  const businessName =
    ((info?.structured as { name?: string } | null)?.name as string) ?? "nuestro negocio";
  const contactName = (contact as { name: string | null }).name?.trim() || "";
  const apptMeta = (appt as { meta: Record<string, unknown> }).meta ?? {};
  const professionalName = (apptMeta.professional_name as string | null) ?? "nuestro equipo";
  const time = await formatApptTime(job.workspace_id, (appt as { scheduled_at: string }).scheduled_at, timezone);

  const messageBase = stepRow?.message_base ?? "";
  const renderedText = messageBase
    .replaceAll("{{nombre}}", contactName || "hola")
    .replaceAll("{{empresa}}", businessName)
    .replaceAll("{{hora}}", time)
    .replaceAll("{{profesional}}", professionalName);

  // Already confirmed to exist by evaluateSendGates — fetched again here
  // because the gate only needed to know "does one exist", not the row
  // itself. A null here (template deleted/unapproved in the split second
  // between the two calls) is handled defensively, never assumed away.
  const template = await findApprovedTemplateForStep(job.workspace_id, job.step_key);

  if (!template) {
    const outcome = await retryOrFail(db, job, REASON_LABELS_ES.template_not_approved);
    if (outcome === "failed") result.errored++;
    else result.retried++;
    return;
  }

  const values = template.variables.length > 0 ? [contactName, time] : [];
  const components =
    values.length > 0
      ? [{ type: "body" as const, parameters: values.map((v) => ({ type: "text" as const, text: v })) }]
      : undefined;

  const dispatchResult = await dispatchTemplate({
    workspaceId: job.workspace_id,
    conversationId: job.conversation_id,
    templateName: template.name,
    templateLanguage: template.language,
    components,
  });

  if (!dispatchResult.ok) {
    const outcome = await retryOrFail(db, job, dispatchResult.error ?? "Error al enviar");
    if (outcome === "failed") result.errored++;
    else result.retried++;
    return;
  }

  await db
    .from("reminder_jobs")
    .update({ status: "sent", sent_at: new Date().toISOString() })
    .eq("id", job.id);
  result.sent++;

  await db.from("events").insert({
    type: "reminder_job_sent",
    level: "info",
    workspace_id: job.workspace_id,
    conversation_id: job.conversation_id,
    payload: {
      reminder_job_id: job.id,
      appointment_id: job.appointment_id,
      step_key: job.step_key,
      template: template.name,
      rendered_preview: renderedText,
    },
  });

  // Give the AI durable context for when the customer replies days later —
  // conversations.summary is always injected into the system prompt
  // (unlike contact_memories, which requires advanced_memory_enabled), so
  // this is what makes "conservar el contexto de la cita" work regardless
  // of that per-workspace opt-in.
  if (stepRow?.collects_response) {
    const { data: conv } = await db
      .from("conversations")
      .select("summary")
      .eq("id", job.conversation_id)
      .maybeSingle();
    const prevSummary = (conv as { summary: string | null } | null)?.summary ?? "";
    const note = `[Seguimiento] ${stepRow.name} enviado (${new Date().toISOString().slice(0, 10)}). Cita: ${(appt as { scheduled_at: string }).scheduled_at}.`;
    const nextSummary = `${prevSummary}\n${note}`.trim().slice(-2000);
    await db.from("conversations").update({ summary: nextSummary }).eq("id", job.conversation_id);
  }
}
