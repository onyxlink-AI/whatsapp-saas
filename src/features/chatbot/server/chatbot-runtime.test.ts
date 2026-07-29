import { describe, expect, it, vi } from 'vitest';

vi.mock('@/features/inbox/services/openrouter', () => ({
  generateReply: vi.fn(),
}));

const { generateReply } = await import('@/features/inbox/services/openrouter');
const { runChatbot } = await import('./chatbot-runtime');

const CONFIG = {
  name: 'Ayuda Acme',
  useCase: 'external_faq' as const,
  purpose: 'Resolver dudas de pedidos',
  instructions: 'Responde con amabilidad.',
  faqs: [
    { id: 'faq-1', question: '¿Cuál es el horario?', answer: 'De 9:00 a 18:00.' },
    { id: 'faq-2', question: '¿Hacen envíos?', answer: 'Sí, a toda España.' },
  ],
  fallbackMessage: 'No tengo esa información. Consulta con una persona del equipo.',
  model: 'openai/gpt-4o-mini',
};

describe('runChatbot', () => {
  it('builds a system prompt containing every FAQ, the instructions, and the fallback directive', async () => {
    vi.mocked(generateReply).mockResolvedValue({ text: 'Atendemos de 9 a 18h.', promptTokens: 10, completionTokens: 5 });

    await runChatbot({ workspaceId: 'workspace-a', config: CONFIG, question: '¿A qué hora abren?' });

    const call = vi.mocked(generateReply).mock.calls[0][0];
    expect(call.workspaceId).toBe('workspace-a');
    expect(call.model).toBe(CONFIG.model);
    expect(call.systemPrompt).toContain('¿Cuál es el horario?');
    expect(call.systemPrompt).toContain('De 9:00 a 18:00.');
    expect(call.systemPrompt).toContain('¿Hacen envíos?');
    expect(call.systemPrompt).toContain(CONFIG.instructions);
    expect(call.systemPrompt).toContain(CONFIG.fallbackMessage);
    expect(call.userMessage).toBe('¿A qué hora abren?');
  });

  it('returns the model answer with source "openrouter" on success', async () => {
    vi.mocked(generateReply).mockResolvedValue({ text: 'Atendemos de 9 a 18h.', promptTokens: 10, completionTokens: 5 });
    const result = await runChatbot({ workspaceId: 'workspace-a', config: CONFIG, question: '¿Horario?' });
    expect(result).toEqual({ answer: 'Atendemos de 9 a 18h.', source: 'openrouter' });
  });

  it('falls back to the configured fallback message, never propagating, when OpenRouter throws', async () => {
    vi.mocked(generateReply).mockRejectedValue(new Error('network error'));
    const result = await runChatbot({ workspaceId: 'workspace-a', config: CONFIG, question: '¿Horario?' });
    expect(result).toEqual({ answer: CONFIG.fallbackMessage, source: 'fallback' });
  });

  it('falls back for an empty question without ever calling OpenRouter', async () => {
    vi.mocked(generateReply).mockClear();
    const result = await runChatbot({ workspaceId: 'workspace-a', config: CONFIG, question: '   ' });
    expect(result).toEqual({ answer: CONFIG.fallbackMessage, source: 'fallback' });
    expect(generateReply).not.toHaveBeenCalled();
  });

  it('two sequential calls with different questions are fully independent — no shared state carried over', async () => {
    vi.mocked(generateReply)
      .mockResolvedValueOnce({ text: 'Respuesta 1', promptTokens: 1, completionTokens: 1 })
      .mockResolvedValueOnce({ text: 'Respuesta 2', promptTokens: 1, completionTokens: 1 });

    const first = await runChatbot({ workspaceId: 'workspace-a', config: CONFIG, question: 'Pregunta 1' });
    const second = await runChatbot({ workspaceId: 'workspace-a', config: CONFIG, question: 'Pregunta 2' });

    expect(first.answer).toBe('Respuesta 1');
    expect(second.answer).toBe('Respuesta 2');
    // Neither call's userMessage leaked into the other's prompt.
    const [firstCall, secondCall] = vi.mocked(generateReply).mock.calls.slice(-2);
    expect(firstCall[0].userMessage).toBe('Pregunta 1');
    expect(secondCall[0].userMessage).toBe('Pregunta 2');
  });
});
