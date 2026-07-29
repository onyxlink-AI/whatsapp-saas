import { generateReply } from '@/features/inbox/services/openrouter';
import type { ChatbotRuntimeConfig } from './chatbot-service';

export type ChatbotAnswer = { answer: string; source: 'openrouter' | 'fallback' };

function buildSystemPrompt(config: ChatbotRuntimeConfig): string {
  const faqBlock = config.faqs
    .map((faq, index) => `${index + 1}. P: ${faq.question}\n   R: ${faq.answer}`)
    .join('\n');

  return [
    `Eres "${config.name}", un chatbot de preguntas frecuentes. Tu único propósito: ${config.purpose}`,
    config.instructions,
    '',
    'Preguntas frecuentes de referencia (tu única fuente de verdad):',
    faqBlock,
    '',
    `Reglas estrictas: responde ÚNICAMENTE con información de las preguntas frecuentes anteriores o de las instrucciones. Si la pregunta no está cubierta por ellas, responde EXACTAMENTE con este mensaje, sin añadir nada más: "${config.fallbackMessage}"`,
    'No tienes memoria de conversaciones anteriores — cada pregunta es independiente. Nunca afirmes recordar mensajes previos. Nunca realices acciones (no agendas, no envías datos a ningún sistema, no ejecutas tareas) — solo respondes texto.',
  ].join('\n');
}

/**
 * The only place a Chatbot question becomes an answer. Deliberately has NO
 * history/session parameter of any kind — statelessness is enforced by this
 * function's signature, not by a policy that could be forgotten by a caller.
 * Never imports anything from contacts/conversations/messages/contact-memory.
 */
export async function runChatbot(input: {
  workspaceId: string;
  config: ChatbotRuntimeConfig;
  question: string;
}): Promise<ChatbotAnswer> {
  const question = input.question.trim().slice(0, 2_000);
  if (!question) return { answer: input.config.fallbackMessage, source: 'fallback' };

  try {
    const result = await generateReply({
      workspaceId: input.workspaceId,
      model: input.config.model,
      systemPrompt: buildSystemPrompt(input.config),
      userMessage: question,
    });
    const text = result.text.trim();
    return text ? { answer: text, source: 'openrouter' } : { answer: input.config.fallbackMessage, source: 'fallback' };
  } catch {
    return { answer: input.config.fallbackMessage, source: 'fallback' };
  }
}
