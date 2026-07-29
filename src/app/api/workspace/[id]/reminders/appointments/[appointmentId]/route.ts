import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient as createSbClient } from "@supabase/supabase-js";
import { requireWorkspaceMember, readJsonBody } from "@/lib/auth/workspace-access";
import { logAudit } from "@/features/audit/services/audit-log";
import {
  rescheduleAppointment,
  cancelAppointment,
  markAppointmentCompleted,
  markAppointmentNoShow,
} from "@/features/reminders/services/appointment-lifecycle";
import { pauseJobsForAppointment } from "@/features/reminders/services/job-scheduling";

function svc() {
  return createSbClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

const PatchSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("reschedule"), newScheduledAt: z.string().datetime({ offset: true }) }),
  z.object({ action: z.literal("cancel"), reason: z.string().max(500).optional() }),
  z.object({ action: z.literal("complete") }),
  z.object({ action: z.literal("no_show") }),
  z.object({ action: z.literal("pause") }),
]);

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; appointmentId: string }> },
) {
  const { id: workspaceId, appointmentId } = await params;
  const auth = await requireWorkspaceMember(workspaceId, { minRole: "manager" });
  if (!auth.ok) return auth.response;

  const parsedBody = await readJsonBody(req);
  if (!parsedBody.ok) return parsedBody.response;

  const parsed = PatchSchema.safeParse(parsedBody.body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Datos inválidos" },
      { status: 400 },
    );
  }

  // Cross-workspace IDOR guard — same pattern as agents/test-chat.
  const db = svc();
  const { data: appt } = await db
    .from("appointments")
    .select("id, workspace_id")
    .eq("id", appointmentId)
    .maybeSingle();

  if (!appt || (appt as { workspace_id: string }).workspace_id !== workspaceId) {
    return NextResponse.json({ error: "Cita no encontrada" }, { status: 404 });
  }

  try {
    switch (parsed.data.action) {
      case "reschedule":
        await rescheduleAppointment(appointmentId, parsed.data.newScheduledAt);
        break;
      case "cancel":
        await cancelAppointment(appointmentId, parsed.data.reason ?? "cita_cancelada");
        break;
      case "complete":
        await markAppointmentCompleted(appointmentId);
        break;
      case "no_show":
        await markAppointmentNoShow(appointmentId);
        break;
      case "pause":
        await pauseJobsForAppointment(appointmentId);
        break;
    }

    void logAudit({
      workspaceId,
      actorUserId: auth.userId,
      action: `reminders.appointment.${parsed.data.action}`,
      targetType: "appointment",
      targetId: appointmentId,
      summary: `Actualizó una cita en recordatorios y seguimiento (${parsed.data.action})`,
      metadata: { action: parsed.data.action },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[reminders/appointments/:id] PATCH failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error interno" },
      { status: 500 },
    );
  }
}
