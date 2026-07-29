import { createClient as createSbClient } from "@supabase/supabase-js";
import { normalizePhone } from "../../inbox/services/normalizer";
import {
  scheduleJobsForAppointment,
  cancelJobsForAppointment,
} from "./job-scheduling";

// Appointment lifecycle — the single place that creates/reschedules/
// cancels an `appointments` row and keeps its `reminder_jobs` in sync.
//
// Google Calendar and HighLevel don't push webhooks for appointment
// creation/reschedule/cancellation (confirmed: neither integration's client
// exposes update/delete-event calls or an appointments webhook — see the
// audit). The only real adapter that exists today is the AI booking tools
// (schedule-google.ts / schedule-highlevel.ts), which insert directly into
// `appointments` mid-conversation. This module is the minimal adapter the
// task asks for on top of that real integration: it's what a business uses
// to log an appointment it booked through its real calendar/other channel
// (e.g. its own reception booked it in Google Calendar), and it's also what
// the reminders engine's own admin tooling/tests use to create a fixture
// appointment. It does NOT poll or sync from Google/HighLevel — there is no
// live external event source to adapt today, only this manual entry point.

function svc() {
  return createSbClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export interface CreateAppointmentParams {
  workspaceId: string;
  scheduledAt: string; // ISO
  contactPhone: string;
  contactName?: string;
  professionalName?: string;
  notes?: string;
  source: "google_calendar" | "highlevel" | "manual";
}

export interface CreateAppointmentResult {
  appointmentId: string;
  contactId: string;
  conversationId: string;
}

export async function createAppointment(
  params: CreateAppointmentParams,
): Promise<CreateAppointmentResult> {
  const db = svc();
  const phone = normalizePhone(params.contactPhone);

  // Resolve or create the contact WITHOUT clobbering an existing opt_in
  // decision (a returning contact who opted out must stay opted out).
  const { data: existingContact } = await db
    .from("contacts")
    .select("id")
    .eq("workspace_id", params.workspaceId)
    .eq("phone", phone)
    .maybeSingle();

  let contactId: string;
  if (existingContact) {
    contactId = (existingContact as { id: string }).id;
    if (params.contactName) {
      await db.from("contacts").update({ name: params.contactName }).eq("id", contactId);
    }
  } else {
    const { data: newContact, error } = await db
      .from("contacts")
      .insert({
        workspace_id: params.workspaceId,
        phone,
        name: params.contactName ?? null,
        // Booking an appointment through a real channel implies an existing
        // business relationship — same assumption schedule-google.ts/
        // schedule-highlevel.ts already make by writing appointments for
        // whatever contact the conversation resolved to.
        opt_in: true,
        opt_in_at: new Date().toISOString(),
      })
      .select("id")
      .single();
    if (error || !newContact) {
      throw new Error(`No se pudo crear el contacto: ${error?.message}`);
    }
    contactId = (newContact as { id: string }).id;
  }

  // Resolve or create the WhatsApp conversation for this contact — required
  // because dispatchTemplate/dispatchText both send through a conversation.
  const { data: conv, error: convError } = await db
    .from("conversations")
    .upsert(
      { workspace_id: params.workspaceId, contact_id: contactId, channel: "whatsapp" },
      { onConflict: "workspace_id,contact_id,channel", ignoreDuplicates: true },
    )
    .select("id")
    .maybeSingle();

  let conversationId: string;
  if (conv) {
    conversationId = (conv as { id: string }).id;
  } else {
    // ignoreDuplicates on an existing row returns no data — fetch it.
    const { data: existingConv, error: fetchError } = await db
      .from("conversations")
      .select("id")
      .eq("workspace_id", params.workspaceId)
      .eq("contact_id", contactId)
      .eq("channel", "whatsapp")
      .single();
    if (fetchError || !existingConv) {
      throw new Error(
        `No se pudo resolver la conversación: ${convError?.message ?? fetchError?.message}`,
      );
    }
    conversationId = (existingConv as { id: string }).id;
  }

  const { data: appt, error: apptError } = await db
    .from("appointments")
    .insert({
      workspace_id: params.workspaceId,
      contact_id: contactId,
      conversation_id: conversationId,
      scheduled_at: params.scheduledAt,
      status: "booked",
      meta: {
        source: params.source,
        professional_name: params.professionalName ?? null,
        notes: params.notes ?? null,
      },
    })
    .select("id")
    .single();

  if (apptError || !appt) {
    throw new Error(`No se pudo crear la cita: ${apptError?.message}`);
  }

  const appointmentId = (appt as { id: string }).id;
  await scheduleJobsForAppointment(appointmentId);

  return { appointmentId, contactId, conversationId };
}

export async function rescheduleAppointment(
  appointmentId: string,
  newScheduledAt: string,
): Promise<void> {
  const db = svc();
  await cancelJobsForAppointment(appointmentId, "rescheduled");

  const { error } = await db
    .from("appointments")
    .update({ scheduled_at: newScheduledAt })
    .eq("id", appointmentId);

  if (error) {
    throw new Error(`No se pudo reprogramar la cita: ${error.message}`);
  }

  await scheduleJobsForAppointment(appointmentId);
}

export async function cancelAppointment(
  appointmentId: string,
  reason: string,
): Promise<void> {
  const db = svc();
  const { error } = await db
    .from("appointments")
    .update({ status: "cancelled" })
    .eq("id", appointmentId);

  if (error) {
    throw new Error(`No se pudo cancelar la cita: ${error.message}`);
  }

  await cancelJobsForAppointment(appointmentId, reason);
}

export async function markAppointmentCompleted(appointmentId: string): Promise<void> {
  const db = svc();
  const { error } = await db
    .from("appointments")
    .update({ status: "completed" })
    .eq("id", appointmentId);
  if (error) {
    throw new Error(`No se pudo marcar la cita como completada: ${error.message}`);
  }
}

export async function markAppointmentNoShow(appointmentId: string): Promise<void> {
  const db = svc();
  const { data: appt, error } = await db
    .from("appointments")
    .update({ status: "no_show" })
    .eq("id", appointmentId)
    .select("workspace_id")
    .single();
  if (error || !appt) {
    throw new Error(`No se pudo marcar la cita como no presentada: ${error?.message}`);
  }

  // A no-show must not receive post-appointment steps (aftercare, follow-up)
  // unless the business explicitly opted in — cancel any already-scheduled
  // future job now (scheduleJobsForAppointment also refuses to recreate them).
  const { data: config } = await db
    .from("reminder_configs")
    .select("continue_after_no_show")
    .eq("workspace_id", (appt as { workspace_id: string }).workspace_id)
    .maybeSingle();

  if (!config || !(config as { continue_after_no_show: boolean }).continue_after_no_show) {
    await cancelJobsForAppointment(appointmentId, "no_show");
  }
}
