// Telegram webhook receiver for the 💬 Chatbot's Telegram channel.
//
// LOCAL TESTING LIMITATION: Telegram's setWebhook requires a public HTTPS
// URL — it cannot be pointed at localhost. Without deploying (out of scope
// for local validation) or tunneling, a real end-to-end Telegram round trip
// cannot be exercised from this machine. Local verification instead means:
// POST a realistic Telegram `Update` JSON body directly to
// http://localhost:3000/api/webhooks/telegram?wsid=<workspaceId> with the
// `X-Telegram-Bot-Api-Secret-Token` header set to the workspace's stored
// secret, and confirm this route's own logic (auth, parsing, the chatbot
// runtime call, the reply-send call, and the diagnostic log) all behave
// correctly. That is exactly what this route is built to do — the only
// untestable part locally is Telegram's own delivery infrastructure.

import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { getChatbotRuntimeConfig, type ChatbotServicePorts, type ChatbotStore } from '@/features/chatbot/server/chatbot-service';
import { handleChatbotTelegramInbound } from '@/features/chatbot/server/telegram-channel';
import { resolveChannelReadiness } from '@/features/chatbot/server/channel-readiness';
import { decryptCredentials } from '@/shared/lib/crypto';
import type { ChatbotHead } from '@/features/chatbot/server/chatbot-service';

function svc() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

function chatbotStore(): ChatbotStore {
  const client = svc();
  return {
    async loadHead(workspaceId) {
      const { data, error } = await client
        .from('chatbots')
        .select('revision, status, enabled, document, updated_at, updated_by_email')
        .eq('workspace_id', workspaceId)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      return {
        revision: data.revision,
        status: data.status,
        enabled: data.enabled,
        document: data.document as ChatbotHead['document'],
        updatedAt: data.updated_at,
        updatedBy: data.updated_by_email,
      };
    },
    async saveHead() {
      throw new Error('not supported from the webhook path');
    },
    async appendRevision() {
      throw new Error('not supported from the webhook path');
    },
  };
}

function ports(): ChatbotServicePorts {
  return { store: chatbotStore(), resolveChannelReadiness };
}

/** Constant-time string compare; mismatched lengths fail without leaking timing. */
function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

type TelegramUpdate = {
  message?: {
    text?: string;
    chat?: { id?: number };
  };
};

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const workspaceId = request.nextUrl.searchParams.get('wsid');
    if (!workspaceId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: integration } = await svc()
      .from('integrations')
      .select('credentials, enabled')
      .eq('workspace_id', workspaceId)
      .eq('provider', 'telegram')
      .eq('enabled', true)
      .maybeSingle();
    if (!integration) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const creds = await decryptCredentials(integration.credentials as Record<string, unknown> | null);
    const expectedSecret = creds.telegram_webhook_secret;
    const providedSecret = request.headers.get('X-Telegram-Bot-Api-Secret-Token');
    if (!expectedSecret || !providedSecret || !safeEqual(providedSecret, expectedSecret)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const botToken = creds.telegram_bot_token;
    if (!botToken) {
      return NextResponse.json({ ok: true });
    }

    const update = (await request.json().catch(() => null)) as TelegramUpdate | null;
    const chatId = update?.message?.chat?.id;
    if (!update || chatId === undefined) {
      return NextResponse.json({ ok: true });
    }

    const runtimeConfig = await getChatbotRuntimeConfig(workspaceId, 'telegram', ports());
    if (!runtimeConfig) {
      // Chatbot not published/enabled for Telegram right now — nothing to do.
      return NextResponse.json({ ok: true });
    }

    await handleChatbotTelegramInbound({
      workspaceId,
      config: runtimeConfig,
      botToken,
      chatId,
      text: typeof update.message?.text === 'string' ? update.message.text : null,
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[webhook telegram] unhandled error:', err instanceof Error ? err.message : 'unknown error');
    // Always 200 — Telegram retries aggressively on non-2xx, and there is
    // nothing useful a retry would fix here.
    return NextResponse.json({ ok: true });
  }
}
