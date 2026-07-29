import { createClient as createSbClient } from "@supabase/supabase-js";
import { dispatchTemplate } from "./dispatch";
import { getApprovedTemplates } from "./template-actions";
import { fillTemplateVariables } from "./templates";
import { getBusinessInfo } from "./business-info";

// appointment-reminders.ts — sends a WhatsApp reminder ~2h before a booked
// appointment. Deterministic, not AI — no LLM call, no opt-in flag. Activates
// itself per workspace purely from data: needs a booked appointment (written
// by schedule-google.ts / schedule-highlevel.ts) AND an approved template
// named "recordatorio_cita" (falls back to any approved 'utility' template).
// Reminders are sent as templates, not free text, since by the time one is
// due the booking's 24h customer-service window has almost always expired.

const REMINDER_WINDOW_HOURS = 2;
const REMINDER_TEMPLATE_NAME = "recordatorio_cita";
const MAX_REMINDERS_PER_RUN = 50;

function svc() {
  return createSbClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

interface DueAppointment {
  id: string;
  workspace_id: string;
  contact_id: string | null;
  conversation_id: string | null;
  scheduled_at: string;
}

async function formatApptTime(workspaceId: string, scheduledAt: string): Promise<string> {
  const info = await getBusinessInfo(workspaceId);
  const tz =
    ((info?.structured as { timezone?: string } | null)?.timezone as string) ??
    "America/Mexico_City";
  try {
    return new Intl.DateTimeFormat("es", {
      timeZone: tz,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(new Date(scheduledAt));
  } catch {
    // Intl.DateTimeFormat throws for an invalid IANA timezone string — a raw
    // UTC HH:MM is a safe, never-crashing fallback for a template variable,
    // not a silently swallowed real error.
    return new Date(scheduledAt).toISOString().slice(11, 16);
  }
}

export async function sendDueReminders(): Promise<{
  sent: number;
  skipped: number;
  failed: number;
}> {
  const db = svc();
  const now = new Date();
  const windowEnd = new Date(
    now.getTime() + REMINDER_WINDOW_HOURS * 60 * 60 * 1000,
  ).toISOString();

  const { data: dueAppointments } = await db
    .from("appointments")
    .select("id, workspace_id, contact_id, conversation_id, scheduled_at")
    .is("reminder_sent_at", null)
    .in("status", ["booked", "confirmed"])
    .gte("scheduled_at", now.toISOString())
    .lte("scheduled_at", windowEnd)
    .order("scheduled_at", { ascending: true })
    .limit(MAX_REMINDERS_PER_RUN);

  let sent = 0;
  let skipped = 0;
  let failed = 0;

  const templateCache = new Map<string, { name: string; language: string; body_template: string; variables: unknown[] } | null>();

  for (const appt of (dueAppointments ?? []) as DueAppointment[]) {
    try {
      if (!appt.contact_id || !appt.conversation_id) {
        skipped++;
        continue;
      }

      let template = templateCache.get(appt.workspace_id);
      if (template === undefined) {
        const templates = await getApprovedTemplates(appt.workspace_id);
        const found =
          templates.find((t) => t.name === REMINDER_TEMPLATE_NAME) ??
          templates.find((t) => t.category === "utility") ??
          null;
        template = found;
        templateCache.set(appt.workspace_id, template);
      }

      if (!template) {
        skipped++;
        continue;
      }

      const { data: contact } = await db
        .from("contacts")
        .select("name")
        .eq("id", appt.contact_id)
        .maybeSingle();

      const contactName = (contact?.name as string | null)?.trim() || "";
      const time = await formatApptTime(appt.workspace_id, appt.scheduled_at);
      const values = [contactName, time];

      const renderedBody = fillTemplateVariables(template.body_template, values);
      const components =
        template.variables.length > 0
          ? [
              {
                type: "body" as const,
                parameters: values.map((v) => ({ type: "text" as const, text: v })),
              },
            ]
          : undefined;

      const result = await dispatchTemplate({
        workspaceId: appt.workspace_id,
        conversationId: appt.conversation_id,
        templateName: template.name,
        templateLanguage: template.language,
        components,
      });

      await db
        .from("appointments")
        .update({
          reminder_sent_at: result.ok ? new Date().toISOString() : null,
        })
        .eq("id", appt.id);

      await db.from("events").insert({
        type: result.ok ? "appointment_reminder_sent" : "appointment_reminder_failed",
        level: result.ok ? "info" : "warn",
        workspace_id: appt.workspace_id,
        conversation_id: appt.conversation_id,
        payload: {
          appointment_id: appt.id,
          contact_id: appt.contact_id,
          scheduled_at: appt.scheduled_at,
          template: template.name,
          rendered_preview: renderedBody,
          error: result.ok ? null : result.error,
        },
      });

      if (result.ok) sent++;
      else failed++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "unknown error";
      console.error("[appointment-reminders] failed for appointment:", appt.id, msg);
      failed++;
      await db
        .from("events")
        .insert({
          type: "appointment_reminder_error",
          level: "error",
          workspace_id: appt.workspace_id,
          conversation_id: appt.conversation_id,
          payload: { error: msg, appointment_id: appt.id },
        })
        .then(
          () => {},
          () => {},
        );
    }
  }

  return { sent, skipped, failed };
}
