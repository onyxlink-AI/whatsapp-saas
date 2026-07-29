import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient as createSbClient } from "@supabase/supabase-js";
import { requireWorkspaceMember, readJsonBody } from "@/lib/auth/workspace-access";
import { getOrCreateReminderConfig, getReminderSteps } from "@/features/reminders/services/reminder-config";
import { getBusinessInfo } from "@/features/inbox/services/business-info";
import { computeScheduledFor } from "@/features/reminders/lib/scheduling";
import { evaluateSendGates } from "@/features/reminders/services/send-gates";
import { REASON_LABELS_ES } from "@/features/reminders/lib/send-guard-types";

// POST /api/workspace/[id]/reminders/simulate — "🧪 Probar sin enviar".
// Pure computation: never calls YCloud, never creates contacts/conversations/
// messages, never runs a tool, never marks a job as sent. Reuses the exact
// same date-math (computeScheduledFor) AND the exact same authorization
// evaluator (evaluateSendGates) the real sender uses, so "por qué estaría
// bloqueado" is never a separately-maintained (and potentially wrong)
// approximation — it's the identical check, just never acted on.

function svc() {
  return createSbClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

const BodySchema = z.object({
  appointmentId: z.string().uuid().optional(),
  // Only used when no appointmentId is given — lets the preview reflect a
  // hypothetical date/time without touching real data.
  exampleScheduledAt: z.string().datetime({ offset: true }).optional(),
});

const EXAMPLE = {
  name: "Cliente de ejemplo",
  professional: "el equipo",
};

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: workspaceId } = await params;
  const auth = await requireWorkspaceMember(workspaceId);
  if (!auth.ok) return auth.response;

  const parsedBody = await readJsonBody(req);
  if (!parsedBody.ok) return parsedBody.response;
  const parsed = BodySchema.safeParse(parsedBody.body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Datos inválidos" },
      { status: 400 },
    );
  }

  const db = svc();
  const config = await getOrCreateReminderConfig(workspaceId);
  const steps = (await getReminderSteps(workspaceId)).sort((a, b) => a.position - b.position);
  const info = await getBusinessInfo(workspaceId);
  const businessName = ((info?.structured as { name?: string } | null)?.name as string) ?? "tu negocio";

  let usedRealAppointment = false;
  let exampleLabel = `🧪 ${EXAMPLE.name} (dato de ejemplo)`;
  let scheduledAtIso = parsed.data.exampleScheduledAt ?? new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();
  let contactName = EXAMPLE.name;
  let professionalName = EXAMPLE.professional;
  let contactId: string | null = null;
  let contactPhone: string | null = null;

  if (parsed.data.appointmentId) {
    const { data: appt } = await db
      .from("appointments")
      .select("workspace_id, scheduled_at, contact_id, meta")
      .eq("id", parsed.data.appointmentId)
      .maybeSingle();

    if (appt && (appt as { workspace_id: string }).workspace_id === workspaceId) {
      usedRealAppointment = true;
      scheduledAtIso = (appt as { scheduled_at: string }).scheduled_at;
      const meta = (appt as { meta: Record<string, unknown> }).meta ?? {};
      professionalName = (meta.professional_name as string | null) ?? professionalName;

      contactId = (appt as { contact_id: string | null }).contact_id;
      if (contactId) {
        const { data: contact } = await db
          .from("contacts")
          .select("name, phone")
          .eq("id", contactId)
          .maybeSingle();
        contactName = (contact as { name: string | null } | null)?.name?.trim() || "tu cliente";
        contactPhone = (contact as { phone: string | null } | null)?.phone ?? null;
      }
      exampleLabel = `Cita real (${contactName})`;
    }
    // If the appointment doesn't belong to this workspace, silently fall
    // back to the synthetic example rather than leaking cross-tenant data.
  }

  const appointmentScheduledAt = new Date(scheduledAtIso);
  const time = new Intl.DateTimeFormat("es", {
    timeZone: config.timezone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(appointmentScheduledAt);

  const simulatedSteps = await Promise.all(
    steps.map(async (step) => {
      const computed = computeScheduledFor(appointmentScheduledAt, step.offset_minutes, {
        timezone: config.timezone,
        startMinute: config.send_window_start_minute,
        endMinute: config.send_window_end_minute,
      });

      const renderedMessage = step.message_base
        .replaceAll("{{nombre}}", contactName)
        .replaceAll("{{empresa}}", businessName)
        .replaceAll("{{hora}}", time)
        .replaceAll("{{profesional}}", professionalName);

      // Same evaluator the real sender uses — never a second, potentially
      // divergent implementation of "why would this be blocked".
      const gate = await evaluateSendGates({
        workspaceId,
        contactId,
        phone: contactPhone,
        category: step.category,
        stepKey: step.step_key,
      });

      return {
        stepKey: step.step_key,
        name: step.name,
        enabled: step.enabled,
        offsetMinutes: step.offset_minutes,
        scheduledFor: computed.scheduledFor.toISOString(),
        adjusted: computed.adjusted,
        adjustReason: computed.reason ?? null,
        renderedMessage: `🧪 [SIMULACIÓN] ${renderedMessage}`,
        wouldBeBlocked: !gate.allowed,
        blockedReasons: gate.blockedReasons,
        blockedReasonsLabels: gate.blockedReasons.map((r) => REASON_LABELS_ES[r]),
      };
    }),
  );

  // Technical event only — step count and whether a real appointment was
  // used, never the phone/message content. This is what satisfies "registrar
  // únicamente un evento técnico de simulación, sin datos sensibles".
  void db
    .from("events")
    .insert({
      type: "reminder_simulation_run",
      level: "info",
      workspace_id: workspaceId,
      payload: {
        used_real_appointment: usedRealAppointment,
        step_count: simulatedSteps.length,
        actor_user_id: auth.userId,
      },
    })
    .then(
      () => undefined,
      () => undefined,
    );

  return NextResponse.json({
    simulation: true,
    usedRealAppointment,
    exampleLabel,
    appointmentScheduledAt: appointmentScheduledAt.toISOString(),
    steps: simulatedSteps,
  });
}
