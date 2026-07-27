import { sendText } from '@/features/inbox/services/ycloud-client';
import { runChatbot } from './chatbot-runtime';
import { logChatbotRuntime } from './runtime-logs';
import type { ChatbotRuntimeConfig } from './chatbot-service';

/**
 * Handles one inbound WhatsApp message destined for the Chatbot (never the
 * Agente WhatsApp — the caller already confirmed via getChatbotRuntimeConfig
 * that this workspace's number is Chatbot-owned right now). Swallows every
 * error so a Chatbot failure can never make the webhook itself fail.
 */
export async function handleChatbotWhatsAppInbound(input: {
  workspaceId: string;
  config: ChatbotRuntimeConfig;
  apiKey: string;
  from: string;
  to: string;
  /** null for non-text inbound (image/audio/etc.) — no transcription/vision here, that's Agente WhatsApp territory. */
  text: string | null;
}): Promise<void> {
  const startedAt = Date.now();
  try {
    const { answer, source } = input.text !== null
      ? await runChatbot({ workspaceId: input.workspaceId, config: input.config, question: input.text })
      : { answer: input.config.fallbackMessage, source: 'fallback' as const };

    await sendText({ apiKey: input.apiKey, from: input.to, to: input.from, body: answer });

    await logChatbotRuntime({
      workspaceId: input.workspaceId,
      provider: 'whatsapp',
      source,
      question: input.text ?? '[multimedia]',
      latencyMs: Date.now() - startedAt,
    });
  } catch (error) {
    await logChatbotRuntime({
      workspaceId: input.workspaceId,
      provider: 'whatsapp',
      source: 'error',
      question: input.text ?? '[multimedia]',
      latencyMs: Date.now() - startedAt,
      errorCode: error instanceof Error ? error.message.slice(0, 200) : 'unknown_error',
    });
  }
}
