import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireWorkspaceMember, readJsonBody } from "@/lib/auth/workspace-access";
import { logAudit } from "@/features/audit/services/audit-log";
import { isContactPaused, pauseContact, resumeContact } from "@/features/reminders/services/contact-pause";

// POST /api/workspace/[id]/reminders/contact-pause — "pausa por contacto":
// stops the automated sequence for one contact across every appointment,
// independent of cancelling a specific appointment or a full opt-out.

const BodySchema = z.object({
  contactId: z.string().uuid(),
  action: z.enum(["pause", "resume"]),
  reason: z.string().max(500).optional(),
});

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: workspaceId } = await params;
  const auth = await requireWorkspaceMember(workspaceId);
  if (!auth.ok) return auth.response;

  const parsed = z.string().uuid().safeParse(req.nextUrl.searchParams.get("contactId"));
  if (!parsed.success) {
    return NextResponse.json({ error: "Falta un contacto válido" }, { status: 400 });
  }

  return NextResponse.json({ paused: await isContactPaused(workspaceId, parsed.data) });
}

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
    if (parsed.data.action === "pause") {
      await pauseContact(workspaceId, parsed.data.contactId, parsed.data.reason);
    } else {
      await resumeContact(workspaceId, parsed.data.contactId);
    }

    void logAudit({
      workspaceId,
      actorUserId: auth.userId,
      action: `reminders.contact_pause.${parsed.data.action}`,
      targetType: "contact",
      targetId: parsed.data.contactId,
      summary:
        parsed.data.action === "pause"
          ? "Pausó el seguimiento automático de un contacto"
          : "Reanudó el seguimiento automático de un contacto",
      metadata: {},
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[reminders/contact-pause] POST failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error interno" },
      { status: 500 },
    );
  }
}
