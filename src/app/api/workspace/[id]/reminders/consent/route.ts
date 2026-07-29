import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireWorkspaceMember, readJsonBody } from "@/lib/auth/workspace-access";
import { logAudit } from "@/features/audit/services/audit-log";
import {
  getConsents,
  grantConsent,
  withdrawConsent,
  CONSENT_CATEGORIES,
} from "@/features/reminders/services/consent";

// GET/POST /api/workspace/[id]/reminders/consent — granular, per-category
// consent (appointment_reminders / aftercare_followup / review_request).
// Never inferred from contacts.opt_in — this is the explicit record the
// engine actually checks before a real send.

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: workspaceId } = await params;
  const auth = await requireWorkspaceMember(workspaceId);
  if (!auth.ok) return auth.response;

  const contactId = req.nextUrl.searchParams.get("contactId");
  if (!contactId) {
    return NextResponse.json({ error: "Falta contactId" }, { status: 400 });
  }

  const consents = await getConsents(workspaceId, contactId);
  return NextResponse.json({ consents });
}

const PostSchema = z.object({
  contactId: z.string().uuid(),
  category: z.enum(CONSENT_CATEGORIES as [string, ...string[]]),
  action: z.enum(["grant", "withdraw"]),
  method: z.string().max(120).optional(),
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

  const parsed = PostSchema.safeParse(parsedBody.body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Datos inválidos" },
      { status: 400 },
    );
  }

  try {
    const consent =
      parsed.data.action === "grant"
        ? await grantConsent(
            workspaceId,
            parsed.data.contactId,
            parsed.data.category as never,
            parsed.data.method ?? "manual_staff",
          )
        : await withdrawConsent(
            workspaceId,
            parsed.data.contactId,
            parsed.data.category as never,
          );

    void logAudit({
      workspaceId,
      actorUserId: auth.userId,
      action: `reminders.consent.${parsed.data.action}`,
      targetType: "reminder_consent",
      targetId: parsed.data.contactId,
      summary:
        parsed.data.action === "grant"
          ? `Registró consentimiento de "${parsed.data.category}" para un contacto`
          : `Retiró el consentimiento de "${parsed.data.category}" para un contacto`,
      // Never the contact's phone/name/message — only the category, which is
      // not sensitive on its own.
      metadata: { category: parsed.data.category },
    });

    return NextResponse.json({ consent });
  } catch (err) {
    console.error("[reminders/consent] POST failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error interno" },
      { status: 500 },
    );
  }
}
