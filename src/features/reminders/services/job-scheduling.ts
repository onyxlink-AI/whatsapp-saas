import { createClient as createSbClient } from "@supabase/supabase-js";
import { computeScheduledFor } from "../lib/scheduling";
import { getOrCreateReminderConfig, getReminderSteps } from "./reminder-config";

// NOTE: deliberately not importing from contact-pause.ts here (it imports
// cancelJobsForContact FROM this module) — the pause check below is a plain
// inline query to avoid a circular module dependency between the two files.

function svc() {
  return createSbClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

interface AppointmentRow {
  id: string;
  workspace_id: string;
  contact_id: string | null;
  conversation_id: string | null;
  scheduled_at: string;
  status: string;
}

// Jobs in these statuses represent work that hasn't completed yet — safe to
// cancel and replace. 'sent'/'responded' are historical fact and must never
// be touched (this is what makes "reprogramar no duplica lo ya enviado" hold).
const CANCELLABLE_STATUSES = ["scheduled", "processing", "error", "needs_attention"];
const COMPLETED_STATUSES = ["sent", "responded"];

export interface ScheduleResult {
  created: number;
  skippedAlreadySent: number;
  skippedInPast: number;
  skippedDisabledOrNoStep: number;
}

/**
 * Computes and inserts a `reminder_jobs` row for every enabled step that
 * doesn't already have one — this is the ONLY place send times get computed
 * (the AI never does this). Idempotent: safe to call repeatedly for the same
 * appointment; steps already sent, already scheduled, or landing in the past
 * are silently skipped, never duplicated (also enforced at the DB level by
 * `uq_reminder_jobs_active_step`).
 */
export async function scheduleJobsForAppointment(
  appointmentId: string,
): Promise<ScheduleResult> {
  const db = svc();
  const result: ScheduleResult = {
    created: 0,
    skippedAlreadySent: 0,
    skippedInPast: 0,
    skippedDisabledOrNoStep: 0,
  };

  const { data: appt } = await db
    .from("appointments")
    .select("id, workspace_id, contact_id, conversation_id, scheduled_at, status")
    .eq("id", appointmentId)
    .maybeSingle();

  if (!appt) return result;
  const appointment = appt as AppointmentRow;

  if (appointment.status === "cancelled") return result;

  const config = await getOrCreateReminderConfig(appointment.workspace_id);
  if (!config.enabled) {
    result.skippedDisabledOrNoStep++;
    return result;
  }
  // Emergency-stopped workspaces never get new work scheduled either, not
  // just blocked at send time — otherwise a paused workspace would keep
  // quietly accumulating jobs it can never actually send.
  if (config.paused_at) {
    result.skippedDisabledOrNoStep++;
    return result;
  }
  if (appointment.contact_id) {
    const { data: pause } = await db
      .from("reminder_contact_pauses")
      .select("id")
      .eq("workspace_id", appointment.workspace_id)
      .eq("contact_id", appointment.contact_id)
      .maybeSingle();
    if (pause) {
      result.skippedDisabledOrNoStep++;
      return result;
    }
  }

  const steps = (await getReminderSteps(appointment.workspace_id)).filter(
    (s) => s.enabled,
  );

  const noShowBlocked =
    appointment.status === "no_show" && !config.continue_after_no_show;

  const { data: existingJobs } = await db
    .from("reminder_jobs")
    .select("step_key, status")
    .eq("appointment_id", appointmentId);
  const existingByStep = new Map<string, string[]>();
  for (const j of (existingJobs as { step_key: string; status: string }[] | null) ?? []) {
    const list = existingByStep.get(j.step_key) ?? [];
    list.push(j.status);
    existingByStep.set(j.step_key, list);
  }

  const now = new Date();

  for (const step of steps) {
    // Post-appointment steps don't apply to a no-show unless the business
    // explicitly opted in — a before-appointment step (offset <= 0) is
    // unaffected since no_show can only be known after the appointment time.
    if (noShowBlocked && step.offset_minutes > 0) {
      result.skippedDisabledOrNoStep++;
      continue;
    }

    const statuses = existingByStep.get(step.step_key) ?? [];
    if (statuses.some((s) => COMPLETED_STATUSES.includes(s))) {
      result.skippedAlreadySent++;
      continue;
    }
    if (statuses.some((s) => CANCELLABLE_STATUSES.includes(s))) {
      // An active (not yet completed, not cancelled) job already exists for
      // this step — idempotent no-op, not a duplicate.
      continue;
    }

    const computed = computeScheduledFor(new Date(appointment.scheduled_at), step.offset_minutes, {
      timezone: config.timezone,
      startMinute: config.send_window_start_minute,
      endMinute: config.send_window_end_minute,
    });

    if (computed.scheduledFor <= now) {
      result.skippedInPast++;
      continue;
    }

    const idempotencyKey = `${appointmentId}:${step.step_key}:${computed.scheduledFor.getTime()}`;

    const { error } = await db.from("reminder_jobs").insert({
      workspace_id: appointment.workspace_id,
      appointment_id: appointmentId,
      step_id: step.id,
      step_key: step.step_key,
      category: step.category,
      contact_id: appointment.contact_id,
      conversation_id: appointment.conversation_id,
      scheduled_for: computed.scheduledFor.toISOString(),
      idempotency_key: idempotencyKey,
    });

    // A unique-constraint hit here means a concurrent call already created
    // the same job — that's the idempotency guarantee working, not an error.
    if (!error) result.created++;
  }

  return result;
}

/** Cancels every not-yet-completed job for an appointment. Never touches sent/responded history. */
export async function cancelJobsForAppointment(
  appointmentId: string,
  reason: string,
): Promise<number> {
  const db = svc();
  const { data, error } = await db
    .from("reminder_jobs")
    .update({ status: "cancelled", cancel_reason: reason })
    .eq("appointment_id", appointmentId)
    .in("status", CANCELLABLE_STATUSES)
    .select("id");

  if (error) {
    throw new Error(`No se pudieron cancelar los recordatorios: ${error.message}`);
  }
  return data?.length ?? 0;
}

/** Cancels every not-yet-completed job for a contact, across all their appointments (opt-out, "no me escribáis más"). */
export async function cancelJobsForContact(
  contactId: string,
  reason: string,
): Promise<number> {
  const db = svc();
  const { data, error } = await db
    .from("reminder_jobs")
    .update({ status: "cancelled", cancel_reason: reason })
    .eq("contact_id", contactId)
    .in("status", CANCELLABLE_STATUSES)
    .select("id");

  if (error) {
    throw new Error(`No se pudieron cancelar los recordatorios: ${error.message}`);
  }
  return data?.length ?? 0;
}

/** Pauses (cancels, with a distinguishable reason) every not-yet-completed job for an appointment — used by "pausa manual" from a team member. */
export async function pauseJobsForAppointment(appointmentId: string): Promise<number> {
  return cancelJobsForAppointment(appointmentId, "paused_by_team");
}

/** Cancels every not-yet-completed job of exactly one consent category for a contact — used when that category's consent is withdrawn (never touches other categories, never the whole contact). */
export async function cancelJobsForContactCategory(
  contactId: string,
  category: string,
  reason: string,
): Promise<number> {
  const db = svc();
  const { data, error } = await db
    .from("reminder_jobs")
    .update({ status: "cancelled", cancel_reason: reason })
    .eq("contact_id", contactId)
    .eq("category", category)
    .in("status", CANCELLABLE_STATUSES)
    .select("id");

  if (error) {
    throw new Error(`No se pudieron cancelar los recordatorios: ${error.message}`);
  }
  return data?.length ?? 0;
}

/**
 * "Botón lógico de emergencia": pauses the whole workspace (blocks future
 * scheduling and sending) AND cancels every pending job in one action. Also
 * used to lift the pause (resume=true), which does NOT recreate anything —
 * appointments created/rescheduled afterwards will schedule normally again.
 */
export async function setWorkspacePaused(
  workspaceId: string,
  paused: boolean,
  reason?: string,
): Promise<{ cancelledJobs: number }> {
  const db = svc();
  const { error } = await db
    .from("reminder_configs")
    .update({
      paused_at: paused ? new Date().toISOString() : null,
      paused_reason: paused ? (reason ?? null) : null,
    })
    .eq("workspace_id", workspaceId);

  if (error) {
    throw new Error(`No se pudo actualizar la pausa del workspace: ${error.message}`);
  }

  if (!paused) return { cancelledJobs: 0 };

  const { data, error: cancelError } = await db
    .from("reminder_jobs")
    .update({ status: "cancelled", cancel_reason: "workspace_paused" })
    .eq("workspace_id", workspaceId)
    .in("status", CANCELLABLE_STATUSES)
    .select("id");

  if (cancelError) {
    throw new Error(`No se pudieron cancelar los recordatorios: ${cancelError.message}`);
  }
  return { cancelledJobs: data?.length ?? 0 };
}
