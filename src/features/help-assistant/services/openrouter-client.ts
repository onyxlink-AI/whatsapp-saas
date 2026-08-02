import { createOpenAI } from "@ai-sdk/openai";
import { generateText, stepCountIs } from "ai";
import type { ToolSet } from "ai";
import { withTransientRetry } from "@/features/inbox/services/openrouter";
import type { ChatTurn } from "../types";

/**
 * Deliberately independent from src/features/inbox/services/openrouter.ts's
 * getOpenRouterApiKey() — that helper can resolve to a per-workspace stored
 * key or the shared platform OPENROUTER_API_KEY. The help assistant must
 * always bill to its OWN separate OpenRouter account/key
 * (HELP_ASSISTANT_OPENROUTER_API_KEY) so its consumption can be measured on
 * its own, never mixed into the shared platform key's usage. Only the retry
 * helper is reused from that module — not the key resolution.
 */
const MODEL = "openai/gpt-4o-mini";

export interface HelpAssistantReplyResult {
  text: string;
  promptTokens: number;
  completionTokens: number;
}

export async function generateHelpAssistantReply(params: {
  systemPrompt: string;
  messages: ChatTurn[];
  maxOutputTokens?: number;
  /** Action tools (create/update client, deal, project, task) — see action-tools/. Omit for a plain text-only reply. */
  tools?: ToolSet;
}): Promise<HelpAssistantReplyResult> {
  const apiKey = process.env.HELP_ASSISTANT_OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error(
      "HELP_ASSISTANT_OPENROUTER_API_KEY no está configurada — el asistente de ayuda usa una cuenta de OpenRouter propia y separada de la clave OPENROUTER_API_KEY compartida, para poder medir su consumo real.",
    );
  }

  const openrouter = createOpenAI({
    baseURL: "https://openrouter.ai/api/v1",
    apiKey,
    headers: {
      "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
      "X-Title": "Onyxlink Asistente de Ayuda",
    },
  });

  const hasTools = Boolean(params.tools && Object.keys(params.tools).length > 0);

  const result = await withTransientRetry(() =>
    generateText({
      model: openrouter.chat(MODEL),
      messages: [
        { role: "system", content: params.systemPrompt },
        ...params.messages,
      ],
      tools: hasTools ? params.tools : undefined,
      // Same step cap as generateWithTools (src/features/inbox/services/openrouter.ts)
      // — enough for search-then-act, low enough to bound cost/latency per question.
      stopWhen: hasTools ? stepCountIs(5) : undefined,
      // Tool-calling needs headroom for intermediate tool-call steps, not
      // just the final reply — default higher than the plain-text case when
      // tools are in play, still small enough to keep answers brief.
      maxOutputTokens: params.maxOutputTokens ?? (hasTools ? 600 : 300),
    }),
  );

  return {
    text: result.text,
    promptTokens: result.usage?.inputTokens ?? 0,
    completionTokens: result.usage?.outputTokens ?? 0,
  };
}
