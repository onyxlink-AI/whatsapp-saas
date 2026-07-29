import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireWorkspaceMember, readJsonBody } from "@/lib/auth/workspace-access";
import { logAudit } from "@/features/audit/services/audit-log";
import { setWorkspacePaused } from "@/features/reminders/services/job-scheduling";

// POST /api/workspace/[id]/reminders/emergency-stop — "botón lógico de
// emergencia": pauses the whole workspace (blocks new scheduling AND
// sending) and cancels every pending job in one action. Resuming does not
// recreate anything — it only lifts the pause going forward.

const BodySchema = z.object({
  action: z.enum(["stop", "resume"]),
  reason: z.string().max(500).optional(),
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

  const parsed = BodySchema.safeParse(parsedBody.body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Datos inválidos" },
      { status: 400 },
    );
  }

  try {
    const result = await setWorkspacePaused(
      workspaceId,
      parsed.data.action === "stop",
      parsed.data.reason,
    );

    void logAudit({
      workspaceId,
      actorUserId: auth.userId,
      action: `reminders.emergency_stop.${parsed.data.action}`,
      targetType: "reminder_config",
      targetId: workspaceId,
      summary:
        parsed.data.action === "stop"
          ? `Detuvo de emergencia todos los recordatorios (${result.cancelledJobs} cancelados)`
          : "Reanudó los recordatorios tras una parada de emergencia",
      metadata: { cancelledJobs: result.cancelledJobs },
    });

    return NextResponse.json({ ok: true, cancelledJobs: result.cancelledJobs });
  } catch (err) {
    console.error("[reminders/emergency-stop] POST failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error interno" },
      { status: 500 },
    );
  }
}
