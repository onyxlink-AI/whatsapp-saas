import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireWorkspaceMember, readJsonBody } from "@/lib/auth/workspace-access";
import { askHelpAssistant } from "@/features/help-assistant/services/help-assistant-service";

const ChatTurnSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().max(1000),
});

const BodySchema = z.object({
  message: z.string().trim().min(1).max(1000),
  history: z.array(ChatTurnSchema).max(12).default([]),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: workspaceId } = await params;
  const auth = await requireWorkspaceMember(workspaceId);
  if (!auth.ok) return auth.response;

  const body = await readJsonBody(request);
  if (!body.ok) return body.response;
  const parsed = BodySchema.safeParse(body.body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Mensaje no válido" }, { status: 400 });
  }

  const result = await askHelpAssistant({
    workspaceId,
    userId: auth.userId,
    message: parsed.data.message,
    history: parsed.data.history,
  });

  if (!result.ok) {
    if (result.code === "quota_exceeded") {
      return NextResponse.json(
        { error: "quota_exceeded", used: result.used, limit: result.limit },
        { status: 429 },
      );
    }
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }

  return NextResponse.json({ text: result.text, used: result.used, limit: result.limit });
}
