import { describe, expect, it } from 'vitest';
import { applyChatbotCommand, emptyChatbotDocument, validateChatbotDraft } from './configuration';
import type { ChatbotCommand, ChatbotDocument, ChatbotDraft } from './types';

const WORKSPACE_ID = 'workspace-chatbot';
const ADMIN = { actorId: 'admin-1', role: 'workspace_admin' as const };
const AT = '2026-07-24T08:00:00.000Z';

function baseDocument(): ChatbotDocument {
  return emptyChatbotDocument(WORKSPACE_ID, ADMIN.actorId, AT);
}

const VALID_DRAFT: ChatbotDraft = {
  name: 'Ayuda Acme',
  useCase: 'external_faq',
  purpose: 'Resolver dudas de pedidos',
  accessNote: '',
  instructions: 'Responde con amabilidad.',
  faqs: [{ id: 'faq-1', question: '¿Horario?', answer: 'De 9 a 18h.' }],
  fallbackMessage: 'No lo sé, consulta con el equipo.',
  model: 'openai/gpt-4o-mini',
};

type CommandInput<T> = T extends ChatbotCommand ? Omit<T, 'workspaceId' | 'expectedRevision' | 'actor' | 'occurredAt'> : never;

function command(document: ChatbotDocument, value: CommandInput<ChatbotCommand>): ChatbotCommand {
  return { ...value, workspaceId: document.workspaceId, expectedRevision: document.revision, actor: ADMIN, occurredAt: AT } as ChatbotCommand;
}

function apply(document: ChatbotDocument, next: ChatbotCommand): ChatbotDocument {
  const result = applyChatbotCommand(document, next);
  expect(result.success).toBe(true);
  if (!result.success) throw new Error(result.code);
  return result.document;
}

describe('chatbot configuration reducer', () => {
  it('preserves identity while updating the draft, and stays in draft status', () => {
    let document = baseDocument();
    document = apply(document, command(document, { type: 'update_draft', patch: VALID_DRAFT }));
    expect(document).toMatchObject({ workspaceId: WORKSPACE_ID, status: 'draft', ...VALID_DRAFT });

    document = apply(document, command(document, { type: 'update_draft', patch: { name: 'Nuevo nombre' } }));
    expect(document.name).toBe('Nuevo nombre');
    expect(document.purpose).toBe(VALID_DRAFT.purpose);
  });

  it('rejects a stale revision', () => {
    const document = baseDocument();
    const stale = command(document, { type: 'update_draft', patch: { name: 'x' } });
    const result = applyChatbotCommand(document, { ...stale, expectedRevision: document.revision + 1 });
    expect(result).toMatchObject({ success: false, code: 'stale_revision' });
  });

  it('rejects a workspace mismatch', () => {
    const document = baseDocument();
    const mismatched = command(document, { type: 'update_draft', patch: {} });
    const result = applyChatbotCommand(document, { ...mismatched, workspaceId: 'workspace-other' });
    expect(result).toMatchObject({ success: false, code: 'workspace_mismatch' });
  });

  it('rejects any actor that is not workspace_admin', () => {
    const document = baseDocument();
    const command_ = { workspaceId: document.workspaceId, expectedRevision: document.revision, occurredAt: AT, type: 'publish' as const, actor: { actorId: 'x', role: 'not_admin' as never } };
    const result = applyChatbotCommand(document, command_);
    expect(result).toMatchObject({ success: false, code: 'unauthorized' });
  });

  it('requires a valid draft before publishing', () => {
    const document = baseDocument();
    const result = applyChatbotCommand(document, command(document, { type: 'publish' }));
    expect(result).toMatchObject({ success: false, code: 'invalid_configuration' });
  });

  it('publishes once the draft is valid', () => {
    let document = baseDocument();
    document = apply(document, command(document, { type: 'update_draft', patch: VALID_DRAFT }));
    document = apply(document, command(document, { type: 'publish' }));
    expect(document.status).toBe('published');
  });

  it('requires publication and a ready channel before enabling', () => {
    let document = baseDocument();
    document = apply(document, command(document, { type: 'update_draft', patch: VALID_DRAFT }));

    expect(applyChatbotCommand(document, command(document, { type: 'set_enabled', enabled: true, channelReady: true }))).toMatchObject({
      success: false,
      code: 'not_published',
    });

    document = apply(document, command(document, { type: 'publish' }));
    expect(applyChatbotCommand(document, command(document, { type: 'set_enabled', enabled: true, channelReady: true }))).toMatchObject({
      success: false,
      code: 'channel_not_ready',
    });

    document = apply(document, command(document, { type: 'select_channel', provider: 'whatsapp', channelReady: true }));
    expect(applyChatbotCommand(document, command(document, { type: 'set_enabled', enabled: true, channelReady: false }))).toMatchObject({
      success: false,
      code: 'channel_not_ready',
    });

    document = apply(document, command(document, { type: 'set_enabled', enabled: true, channelReady: true }));
    expect(document.enabled).toBe(true);
  });

  it('rejects selecting a channel that is not ready', () => {
    const document = baseDocument();
    const result = applyChatbotCommand(document, command(document, { type: 'select_channel', provider: 'telegram', channelReady: false }));
    expect(result).toMatchObject({ success: false, code: 'channel_not_ready' });
  });

  it('disables the chatbot whenever the channel provider actually changes', () => {
    let document = baseDocument();
    document = apply(document, command(document, { type: 'update_draft', patch: VALID_DRAFT }));
    document = apply(document, command(document, { type: 'publish' }));
    document = apply(document, command(document, { type: 'select_channel', provider: 'whatsapp', channelReady: true }));
    document = apply(document, command(document, { type: 'set_enabled', enabled: true, channelReady: true }));
    expect(document.enabled).toBe(true);

    document = apply(document, command(document, { type: 'select_channel', provider: 'telegram', channelReady: true }));
    expect(document.enabled).toBe(false);
    expect(document.channelProvider).toBe('telegram');
  });

  it('allows removing the channel (provider: null) without requiring readiness', () => {
    let document = baseDocument();
    document = apply(document, command(document, { type: 'update_draft', patch: VALID_DRAFT }));
    document = apply(document, command(document, { type: 'select_channel', provider: 'whatsapp', channelReady: true }));
    document = apply(document, command(document, { type: 'select_channel', provider: null, channelReady: false }));
    expect(document.channelProvider).toBeNull();
  });
});

describe('validateChatbotDraft', () => {
  it('requires at least one FAQ', () => {
    const issues = validateChatbotDraft({ ...VALID_DRAFT, faqs: [] } as ChatbotDraft);
    expect(issues.some((i) => i.field === 'faqs')).toBe(true);
  });

  it('requires name, purpose, instructions, fallbackMessage, model to be non-empty', () => {
    const issues = validateChatbotDraft({
      name: '', useCase: 'external_faq', purpose: '', accessNote: '', instructions: '',
      faqs: [{ id: 'f', question: 'q', answer: 'a' }], fallbackMessage: '', model: '',
    });
    const fields = issues.map((i) => i.field);
    expect(fields).toEqual(expect.arrayContaining(['name', 'purpose', 'instructions', 'fallbackMessage', 'model']));
  });

  it('accepts a fully valid draft with zero issues', () => {
    const issues = validateChatbotDraft({ ...VALID_DRAFT, useCase: 'external_faq', accessNote: '' } as ChatbotDraft);
    expect(issues).toEqual([]);
  });
});
