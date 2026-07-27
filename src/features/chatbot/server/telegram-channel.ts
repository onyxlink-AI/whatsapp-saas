import { runChatbot } from './chatbot-runtime';
import { sendTelegramMessage } from './telegram-client';
import { logChatbotRuntime } from './runtime-logs';
import type { ChatbotRuntimeConfig } from './chatbot-service';

/**
 * Handles one inbound Telegram message destined for the Chatbot. Swallows
 * every error so a Chatbot failure can never make the webhook itself fail —
 * Telegram retries aggressively on non-2xx/slow responses.
 */
export async function handleChatbotTelegramInbound(input: {
  workspaceId: string;
  config: ChatbotRuntimeConfig;
  botToken: string;
  chatId: number | string;
  /** null for non-text inbound (photo/voice/sticker/etc.) — no transcription here. */
  text: string | null;
}): Promise<void> {
  const startedAt = Date.now();
  try {
    const { answer, source } = input.text !== null
      ? await runChatbot({ workspaceId: input.workspaceId, config: input.config, question: input.text })
      : { answer: input.config.fallbackMessage, source: 'fallback' as const };

    await sendTelegramMessage(input.botToken, input.chatId, answer);

    await logChatbotRuntime({
      workspaceId: input.workspaceId,
      provider: 'telegram',
      source,
      question: input.text ?? '[multimedia]',
      latencyMs: Date.now() - startedAt,
    });
  } catch (error) {
    await logChatbotRuntime({
      workspaceId: input.workspaceId,
      provider: 'telegram',
      source: 'error',
      question: input.text ?? '[multimedia]',
      latencyMs: Date.now() - startedAt,
      errorCode: error instanceof Error ? error.message.slice(0, 200) : 'unknown_error',
    });
  }
}
