import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { runChatbot } from '@/features/chatbot/server/chatbot-runtime';
import { ChatbotTestBodySchema } from '@/features/chatbot/validation';
import type { ChatbotDocument, ChatbotStatus } from '@/features/chatbot/types';
import { requireSuperAdmin, readJsonBody } from '@/lib/auth/workspace-access';

function serviceClient() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

/**
 * Live-test endpoint: runs the CURRENT draft (even if unpublished) through
 * the real backend runtime, so the admin can iterate before publishing.
 * Never a client-side heuristic — credentials never reach the browser.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: workspaceId } = await params;
  const auth = await requireSuperAdmin();
  if (!auth.ok) return auth.response;

  const body = await readJsonBody(request);
  if (!body.ok) return body.response;
  const parsed = ChatbotTestBodySchema.safeParse(body.body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Pregunta no válida' }, { status: 400 });
  }

  try {
    const { data, error } = await serviceClient()
      .from('chatbots')
      .select('document')
      .eq('workspace_id', workspaceId)
      .maybeSingle<{ document: ChatbotDocument & { status: ChatbotStatus } }>();
    if (error) throw error;
    if (!data) {
      return NextResponse.json({ error: 'chatbot_missing' }, { status: 409 });
    }

    const { answer, source } = await runChatbot({
      workspaceId,
      config: data.document,
      question: parsed.data.question,
    });

    return NextResponse.json({ answer, source });
  } catch (error) {
    console.error('[POST chatbot/test]', error);
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}
