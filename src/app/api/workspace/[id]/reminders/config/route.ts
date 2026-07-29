import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireWorkspaceMember, readJsonBody } from "@/lib/auth/workspace-access";
import { logAudit } from "@/features/audit/services/audit-log";
import {
  getOrCreateReminderConfig,
  getReminderSteps,
  updateReminderConfig,
  installReminderTemplate,
} from "@/features/reminders/services/reminder-config";
import { getReminderReadiness } from "@/features/reminders/services/readiness";
import { isLiveSendingEnabled } from "@/features/reminders/services/live-sending-guard";
import { REMINDER_TEMPLATES } from "@/features/reminders/lib/template-catalog";

// GET/PATCH /api/workspace/[id]/reminders/config
// Workspace self-service (admin/manager) — same tier as agents/prompts/
// business-info, NOT a superadmin-only add-on like Chatbot/Oficina Virtual.

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: workspaceId } = await params;
  const auth = await requireWorkspaceMember(workspaceId);
  if (!auth.ok) return auth.response;

  const [config, steps, readiness] = await Promise.all([
    getOrCreateReminderConfig(workspaceId),
    getReminderSteps(workspaceId),
    getReminderReadiness(workspaceId),
  ]);

  return NextResponse.json({
    config,
    steps,
    readiness,
    // Never expose the allowlist itself (task requirement) — only the
    // boolean state of the kill switch, which is safe/expected in the UI.
    liveSendingEnabled: isLiveSendingEnabled(),
    availableTemplates: REMINDER_TEMPLATES.map((t) => ({
      key: t.key,
      label: t.label,
      description: t.description,
    })),
  });
}

const PatchSchema = z.object({
  install_template_key: z.string().max(60).optional(),
  enabled: z.boolean().optional(),
  appointment_source: z.enum(["google_calendar", "highlevel"]).nullable().optional(),
  timezone: z.string().max(80).optional(),
  send_window_start_minute: z.number().int().min(0).max(1439).optional(),
  send_window_end_minute: z.number().int().min(0).max(1439).optional(),
  allow_ai_personalization: z.boolean().optional(),
  sensitive_keywords: z.array(z.string().max(80)).max(50).optional(),
  sensitive_response_message: z.string().max(1000).optional(),
  continue_after_no_show: z.boolean().optional(),
  max_messages_per_contact_per_day: z.number().int().min(1).max(20).optional(),
  min_minutes_between_messages: z.number().int().min(0).max(1440).optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: workspaceId } = await params;
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

  const { install_template_key, ...patch } = parsed.data;

  try {
    if (install_template_key) {
      const { config, steps } = await installReminderTemplate(
        workspaceId,
        install_template_key,
      );
      void logAudit({
        workspaceId,
        actorUserId: auth.userId,
        action: "reminders.install_template",
        targetType: "reminder_config",
        targetId: workspaceId,
        summary: `Instaló la plantilla "${install_template_key}" de recordatorios y seguimiento`,
        metadata: { template_key: install_template_key },
      });
      return NextResponse.json({ config, steps });
    }

    if (Object.keys(patch).length > 0) {
      const config = await updateReminderConfig(workspaceId, patch);
      void logAudit({
        workspaceId,
        actorUserId: auth.userId,
        action: "reminders.update_config",
        targetType: "reminder_config",
        targetId: workspaceId,
        summary: "Actualizó la configuración de recordatorios y seguimiento",
        metadata: { fields: Object.keys(patch) },
      });
      return NextResponse.json({ config, steps: await getReminderSteps(workspaceId) });
    }

    return NextResponse.json({ error: "No se proporcionaron cambios" }, { status: 400 });
  } catch (err) {
    console.error("[reminders/config] PATCH failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error interno" },
      { status: 500 },
    );
  }
}
