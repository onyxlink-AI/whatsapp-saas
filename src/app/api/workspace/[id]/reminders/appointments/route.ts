import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient as createSbClient } from "@supabase/supabase-js";
import { requireWorkspaceMember, readJsonBody } from "@/lib/auth/workspace-access";
import { logAudit } from "@/features/audit/services/audit-log";
import { createAppointment } from "@/features/reminders/services/appointment-lifecycle";

function svc() {
  return createSbClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

// GET — short list for the "elegir una cita de ejemplo" picker in the
// simulator and for the manual reschedule/cancel controls. Never exposes
// another workspace's data (scoped by workspace_id, RLS-equivalent via the
// same requireWorkspaceMember gate used everywhere else in this feature).
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: workspaceId } = await params;
  const auth = await requireWorkspaceMember(workspaceId);
  if (!auth.ok) return auth.response;

  const db = svc();
  const { data: appointments, error } = await db
    .from("appointments")
    .select("id, scheduled_at, status, contact_id")
    .eq("workspace_id", workspaceId)
    .neq("status", "cancelled")
    .order("scheduled_at", { ascending: false })
    .limit(10);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const contactIds = Array.from(
    new Set((appointments ?? []).map((a) => a.contact_id).filter((v): v is string => Boolean(v))),
  );
  const { data: contacts } = contactIds.length
    ? await db.from("contacts").select("id, name, phone").in("id", contactIds)
    : { data: [] };
  const contactById = new Map(
    (contacts ?? []).map((c) => [c.id as string, c as { id: string; name: string | null; phone: string }]),
  );

  return NextResponse.json({
    appointments: (appointments ?? []).map((a) => ({
      ...a,
      contact_name: a.contact_id ? contactById.get(a.contact_id)?.name ?? null : null,
      contact_phone: a.contact_id ? contactById.get(a.contact_id)?.phone ?? null : null,
    })),
  });
}

// POST /api/workspace/[id]/reminders/appointments
//
// Minimal manual-entry adapter (see appointment-lifecycle.ts's header comment
// for why this exists): Google Calendar/HighLevel don't push webhooks for
// appointment creation, so this is how a real appointment booked through a
// business's actual calendar gets logged here for the reminders engine to
// act on — NOT a parallel booking UI/agenda.

const CreateSchema = z.object({
  scheduledAt: z.string().datetime({ offset: true }),
  contactPhone: z.string().min(5).max(30),
  contactName: z.string().max(200).optional(),
  professionalName: z.string().max(200).optional(),
  notes: z.string().max(1000).optional(),
  source: z.enum(["google_calendar", "highlevel", "manual"]),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: workspaceId } = await params;
  const auth = await requireWorkspaceMember(workspaceId, { minRole: "manager" });
  if (!auth.ok) return auth.response;

  const parsedBody = await readJsonBody(req);
  if (!parsedBody.ok) return parsedBody.response;

  const parsed = CreateSchema.safeParse(parsedBody.body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Datos inválidos" },
      { status: 400 },
    );
  }

  try {
    const result = await createAppointment({ workspaceId, ...parsed.data });
    void logAudit({
      workspaceId,
      actorUserId: auth.userId,
      action: "reminders.create_appointment",
      targetType: "appointment",
      targetId: result.appointmentId,
      summary: "Registró una cita para recordatorios y seguimiento",
      metadata: { source: parsed.data.source },
    });
    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    console.error("[reminders/appointments] POST failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error interno" },
      { status: 500 },
    );
  }
}
