import { createClient as createServiceClient } from '@supabase/supabase-js';
import type { ChatbotProvider } from '../types';

function serviceClient() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

/**
 * Best-effort diagnostic log — never conversational memory. Failures here
 * are swallowed: a logging problem must never break answering a question.
 */
export async function logChatbotRuntime(entry: {
  workspaceId: string;
  provider: ChatbotProvider;
  source: 'openrouter' | 'fallback' | 'error';
  question: string;
  latencyMs: number;
  errorCode?: string;
}): Promise<void> {
  try {
    await serviceClient().from('chatbot_runtime_logs').insert({
      workspace_id: entry.workspaceId,
      provider: entry.provider,
      source: entry.source,
      question_excerpt: entry.question.slice(0, 300),
      latency_ms: entry.latencyMs,
      error_code: entry.errorCode ?? null,
    });
  } catch {
    // Diagnostics only — never let a logging failure affect the reply path.
  }
}
