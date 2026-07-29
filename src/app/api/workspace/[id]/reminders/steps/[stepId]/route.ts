import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireWorkspaceMember, readJsonBody } from "@/lib/auth/workspace-access";
import { logAudit } from "@/features/audit/services/audit-log";
import { updateReminderStep } from "@/features/reminders/services/reminder-config";

const PatchSchema = z.object({
  enabled: z.boolean().optional(),
  offset_minutes: z.number().int().min(-90 * 24 * 60).max(180 * 24 * 60).optional(),
  message_base: z.string().max(2000).optional(),
  allow_ai_personalize: z.boolean().optional(),
  requires_consent: z.boolean().optional(),
  position: z.number().int().min(0).max(100).optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; stepId: string }> },
) {
  const { id: workspaceId, stepId } = await params;
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

  if (Object.keys(parsed.data).length === 0) {
    return NextResponse.json({ error: "No se proporcionaron cambios" }, { status: 400 });
  }

  try {
    const step = await updateReminderStep(workspaceId, stepId, parsed.data);
    void logAudit({
      workspaceId,
      actorUserId: auth.userId,
      action: "reminders.update_step",
      targetType: "reminder_step",
      targetId: stepId,
      summary: `Editó el paso "${step.name}" de recordatorios y seguimiento`,
      metadata: { fields: Object.keys(parsed.data) },
    });
    return NextResponse.json({ step });
  } catch (err) {
    console.error("[reminders/steps] PATCH failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error interno" },
      { status: 500 },
    );
  }
}
