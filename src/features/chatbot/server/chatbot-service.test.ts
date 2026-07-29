import { describe, expect, it, vi } from 'vitest';
import {
  getChatbotRuntimeConfig,
  handleChatbotCommand,
  loadOrProvisionChatbot,
  type ChatbotHead,
  type ChatbotServicePorts,
  type ChatbotStore,
} from './chatbot-service';
import type { ChatbotActor, ChatbotHistoryAction, ChatbotDocument } from '../types';

const ADMIN: ChatbotActor = { actorId: 'admin@test', role: 'workspace_admin' };

const VALID_PATCH = {
  name: 'Ayuda Acme',
  purpose: 'Resolver dudas de pedidos',
  instructions: 'Responde con amabilidad.',
  faqs: [{ id: 'faq-1', question: '¿Horario?', answer: 'De 9 a 18h.' }],
  fallbackMessage: 'No lo sé, consulta con el equipo.',
  model: 'openai/gpt-4o-mini',
};

type RevisionRow = {
  workspaceId: string;
  revision: number;
  action: ChatbotHistoryAction;
  actorUserId: string | null;
  actorEmail: string;
  document: ChatbotDocument;
};

function fakeStore() {
  const heads = new Map<string, ChatbotHead>();
  const revisions: RevisionRow[] = [];

  const store: ChatbotStore = {
    async loadHead(workspaceId) {
      return heads.get(workspaceId) ?? null;
    },
    async saveHead(workspaceId, head) {
      heads.set(workspaceId, head);
    },
    async appendRevision(workspaceId, entry) {
      revisions.push({ workspaceId, revision: entry.revision, action: entry.action, actorUserId: entry.actorUserId, actorEmail: entry.actorEmail, document: entry.document });
    },
  };

  return { store, heads, revisions };
}

function ports(store: ChatbotStore, resolveChannelReadiness = vi.fn(async () => true)): ChatbotServicePorts {
  return { store, resolveChannelReadiness, now: () => '2026-07-24T12:00:00.000Z' };
}

describe('chatbot service — provisioning', () => {
  it('provisions once and persists it, so a second load returns the same document without re-provisioning', async () => {
    const { store, revisions } = fakeStore();
    const first = await loadOrProvisionChatbot('workspace-a', ADMIN, ports(store));
    const second = await loadOrProvisionChatbot('workspace-a', ADMIN, ports(store));

    expect(first.document.revision).toBe(1);
    expect(second.document.revision).toBe(1);
    expect(revisions.filter((r) => r.action === 'provisioned')).toHaveLength(1);
  });
});

describe('chatbot service — save and reload', () => {
  it('persists a command and a fresh load reflects it', async () => {
    const { store } = fakeStore();
    const provisioned = await loadOrProvisionChatbot('workspace-a', ADMIN, ports(store));

    const result = await handleChatbotCommand(
      'workspace-a',
      ADMIN,
      'user-1',
      { type: 'update_draft', expectedRevision: provisioned.document.revision, patch: VALID_PATCH },
      ports(store),
    );
    expect(result.success).toBe(true);

    const reloaded = await loadOrProvisionChatbot('workspace-a', ADMIN, ports(store));
    expect(reloaded.document.name).toBe('Ayuda Acme');
  });
});

describe('chatbot service — channel readiness is server-computed, not client-supplied', () => {
  it('rejects select_channel when resolveChannelReadiness reports the channel is not ready', async () => {
    const { store } = fakeStore();
    const notReady = vi.fn(async () => false);
    const provisioned = await loadOrProvisionChatbot('workspace-a', ADMIN, ports(store, notReady));

    const result = await handleChatbotCommand(
      'workspace-a',
      ADMIN,
      'user-1',
      { type: 'select_channel', expectedRevision: provisioned.document.revision, provider: 'whatsapp' },
      ports(store, notReady),
    );
    expect(result).toMatchObject({ success: false, code: 'channel_not_ready' });
    expect(notReady).toHaveBeenCalledWith('workspace-a', 'whatsapp');
  });

  it('rejects set_enabled(true) when the currently-bound channel stops being ready', async () => {
    const { store } = fakeStore();
    const ready = vi.fn(async () => true);
    let document = (await loadOrProvisionChatbot('workspace-a', ADMIN, ports(store, ready))).document;

    let result = await handleChatbotCommand('workspace-a', ADMIN, 'user-1', { type: 'update_draft', expectedRevision: document.revision, patch: VALID_PATCH }, ports(store, ready));
    if (!result.success) throw new Error(result.code);
    document = result.document;

    result = await handleChatbotCommand('workspace-a', ADMIN, 'user-1', { type: 'publish', expectedRevision: document.revision }, ports(store, ready));
    if (!result.success) throw new Error(result.code);
    document = result.document;

    result = await handleChatbotCommand('workspace-a', ADMIN, 'user-1', { type: 'select_channel', expectedRevision: document.revision, provider: 'whatsapp' }, ports(store, ready));
    if (!result.success) throw new Error(result.code);
    document = result.document;

    // Now the channel becomes unready (e.g. the Agente WhatsApp got re-activated).
    const nowUnready = vi.fn(async () => false);
    const finalResult = await handleChatbotCommand(
      'workspace-a', ADMIN, 'user-1',
      { type: 'set_enabled', expectedRevision: document.revision, enabled: true },
      ports(store, nowUnready),
    );
    expect(finalResult).toMatchObject({ success: false, code: 'channel_not_ready' });
  });
});

describe('chatbot service — unauthorized actor', () => {
  it('rejects a command from a non-workspace_admin actor', async () => {
    const { store } = fakeStore();
    const provisioned = await loadOrProvisionChatbot('workspace-a', ADMIN, ports(store));
    const intruder: ChatbotActor = { actorId: 'x', role: 'system' as never };

    const result = await handleChatbotCommand(
      'workspace-a', intruder, 'user-x',
      { type: 'update_draft', expectedRevision: provisioned.document.revision, patch: {} },
      ports(store),
    );
    expect(result).toMatchObject({ success: false, code: 'unauthorized' });
  });
});

describe('chatbot service — workspace isolation', () => {
  it('never lets a command against one workspace read or affect another workspace\'s document', async () => {
    const { store } = fakeStore();
    const a = await loadOrProvisionChatbot('workspace-a', ADMIN, ports(store));
    const b = await loadOrProvisionChatbot('workspace-b', ADMIN, ports(store));

    await handleChatbotCommand('workspace-a', ADMIN, 'user-a', { type: 'update_draft', expectedRevision: a.document.revision, patch: { name: 'Solo A' } }, ports(store));

    const reloadedA = await loadOrProvisionChatbot('workspace-a', ADMIN, ports(store));
    const reloadedB = await loadOrProvisionChatbot('workspace-b', ADMIN, ports(store));
    expect(reloadedA.document.name).toBe('Solo A');
    expect(reloadedB.document.name).toBe(b.document.name);
    expect(reloadedB.document.workspaceId).toBe('workspace-b');
  });
});

describe('chatbot service — getChatbotRuntimeConfig (the only function the webhooks call)', () => {
  it('returns null when no chatbot has been provisioned yet', async () => {
    const { store } = fakeStore();
    const config = await getChatbotRuntimeConfig('workspace-never-provisioned', 'whatsapp', ports(store));
    expect(config).toBeNull();
  });

  it('returns null when the chatbot exists but is not published', async () => {
    const { store } = fakeStore();
    await loadOrProvisionChatbot('workspace-a', ADMIN, ports(store));
    const config = await getChatbotRuntimeConfig('workspace-a', 'whatsapp', ports(store));
    expect(config).toBeNull();
  });

  it('returns null when published+enabled but bound to a DIFFERENT provider than requested', async () => {
    const { store } = fakeStore();
    let document = (await loadOrProvisionChatbot('workspace-a', ADMIN, ports(store))).document;
    let result = await handleChatbotCommand('workspace-a', ADMIN, 'u', { type: 'update_draft', expectedRevision: document.revision, patch: VALID_PATCH }, ports(store));
    if (!result.success) throw new Error(result.code);
    document = result.document;
    result = await handleChatbotCommand('workspace-a', ADMIN, 'u', { type: 'publish', expectedRevision: document.revision }, ports(store));
    if (!result.success) throw new Error(result.code);
    document = result.document;
    result = await handleChatbotCommand('workspace-a', ADMIN, 'u', { type: 'select_channel', expectedRevision: document.revision, provider: 'telegram' }, ports(store));
    if (!result.success) throw new Error(result.code);
    document = result.document;
    result = await handleChatbotCommand('workspace-a', ADMIN, 'u', { type: 'set_enabled', expectedRevision: document.revision, enabled: true }, ports(store));
    if (!result.success) throw new Error(result.code);

    const config = await getChatbotRuntimeConfig('workspace-a', 'whatsapp', ports(store));
    expect(config).toBeNull();
  });

  it('returns the runtime config when published, enabled, bound to the requested provider, and still ready', async () => {
    const { store } = fakeStore();
    let document = (await loadOrProvisionChatbot('workspace-a', ADMIN, ports(store))).document;
    let result = await handleChatbotCommand('workspace-a', ADMIN, 'u', { type: 'update_draft', expectedRevision: document.revision, patch: VALID_PATCH }, ports(store));
    if (!result.success) throw new Error(result.code);
    document = result.document;
    result = await handleChatbotCommand('workspace-a', ADMIN, 'u', { type: 'publish', expectedRevision: document.revision }, ports(store));
    if (!result.success) throw new Error(result.code);
    document = result.document;
    result = await handleChatbotCommand('workspace-a', ADMIN, 'u', { type: 'select_channel', expectedRevision: document.revision, provider: 'whatsapp' }, ports(store));
    if (!result.success) throw new Error(result.code);
    document = result.document;
    result = await handleChatbotCommand('workspace-a', ADMIN, 'u', { type: 'set_enabled', expectedRevision: document.revision, enabled: true }, ports(store));
    if (!result.success) throw new Error(result.code);

    const config = await getChatbotRuntimeConfig('workspace-a', 'whatsapp', ports(store));
    expect(config).toMatchObject({ name: 'Ayuda Acme', model: 'openai/gpt-4o-mini' });
  });

  it('re-checks readiness live and fails closed even when the document itself still says enabled', async () => {
    const { store } = fakeStore();
    const ready = vi.fn(async () => true);
    let document = (await loadOrProvisionChatbot('workspace-a', ADMIN, ports(store, ready))).document;
    let result = await handleChatbotCommand('workspace-a', ADMIN, 'u', { type: 'update_draft', expectedRevision: document.revision, patch: VALID_PATCH }, ports(store, ready));
    if (!result.success) throw new Error(result.code);
    document = result.document;
    result = await handleChatbotCommand('workspace-a', ADMIN, 'u', { type: 'publish', expectedRevision: document.revision }, ports(store, ready));
    if (!result.success) throw new Error(result.code);
    document = result.document;
    result = await handleChatbotCommand('workspace-a', ADMIN, 'u', { type: 'select_channel', expectedRevision: document.revision, provider: 'whatsapp' }, ports(store, ready));
    if (!result.success) throw new Error(result.code);
    document = result.document;
    result = await handleChatbotCommand('workspace-a', ADMIN, 'u', { type: 'set_enabled', expectedRevision: document.revision, enabled: true }, ports(store, ready));
    if (!result.success) throw new Error(result.code);

    // Simulate the Agente WhatsApp being re-activated after the fact — the
    // stored document still says enabled:true, but a fresh readiness check
    // (e.g. from a webhook) must fail closed.
    const nowUnready = vi.fn(async () => false);
    const config = await getChatbotRuntimeConfig('workspace-a', 'whatsapp', ports(store, nowUnready));
    expect(config).toBeNull();
  });
});

describe('chatbot service — no secrets', () => {
  it('the persisted document and every revision snapshot never contain credential-shaped fields', async () => {
    const { store, revisions } = fakeStore();
    await loadOrProvisionChatbot('workspace-a', ADMIN, ports(store));

    for (const revision of revisions) {
      const serialized = JSON.stringify(revision.document).toLowerCase();
      expect(serialized).not.toMatch(/api[_-]?key|token|secret|password|credential/);
    }
  });
});
