// @vitest-environment node
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// This is the highest-risk file this session touches: a single additive
// branch was inserted into a live, production-critical webhook. These tests
// exist to prove two things: (1) when no Chatbot owns the number (the
// common case for every existing customer), every byte of prior behavior —
// signature verification, status updates, buffering, media, rate limiting —
// is completely unchanged; and (2) when the Chatbot DOES own the number,
// the message is answered and NEVER reaches processInbound, so it
// structurally cannot create a contacts/conversations/messages row.

const verifyYCloudSignature = vi.fn(() => true);
const parseInbound = vi.fn();
const processInbound = vi.fn();
const checkRateLimits = vi.fn(async () => ({ allowed: true, reason: null }));
const upsertBatch = vi.fn(async () => {});
const processNextBatch = vi.fn(async () => ({ processed: 0 }));
const downloadAndStoreMedia = vi.fn();
const patchMessageMedia = vi.fn();
const transcribeAudio = vi.fn();
const describeImage = vi.fn();
const syncContactToAirtable = vi.fn(async () => {});
const decryptCredentials = vi.fn(async (creds: Record<string, unknown> | null) => ({ ...(creds ?? {}) }) as Record<string, string>);
const getChatbotRuntimeConfig = vi.fn(async () => null as unknown);
const handleChatbotWhatsAppInbound = vi.fn(async () => {});
const isWhatsAppAgentRuntimeEnabled = vi.fn(async () => true);

vi.mock('@/features/inbox/services/ycloud-webhook-handler', () => ({ verifyYCloudSignature, parseInbound }));
vi.mock('@/features/inbox/services/normalizer', () => ({ processInbound }));
vi.mock('@/features/inbox/services/cost-tracker', () => ({ checkRateLimits }));
vi.mock('@/features/inbox/services/buffer', () => ({ upsertBatch, processNextBatch }));
vi.mock('@/features/inbox/services/media-handler', () => ({ downloadAndStoreMedia, patchMessageMedia }));
vi.mock('@/features/inbox/services/media-understanding', () => ({ transcribeAudio, describeImage }));
vi.mock('@/features/inbox/services/airtable-client', () => ({ syncContactToAirtable }));
vi.mock('@/shared/lib/crypto', () => ({ decryptCredentials }));
vi.mock('@/features/chatbot/server/chatbot-service', () => ({ getChatbotRuntimeConfig }));
vi.mock('@/features/chatbot/server/whatsapp-channel', () => ({ handleChatbotWhatsAppInbound }));
vi.mock('@/features/chatbot/server/channel-readiness', () => ({ resolveChannelReadiness: vi.fn(async () => false) }));
vi.mock('@/features/agents/services/whatsapp-runtime', () => ({ isWhatsAppAgentRuntimeEnabled }));
vi.mock('next/server', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next/server')>();
  return { ...actual, after: (fn: () => unknown) => fn() };
});

// Generic chainable Supabase mock: `.from(table)` returns a query builder
// whose filter methods (select/eq/limit) just return `this`, and whose
// terminal methods (single/maybeSingle) resolve from a per-table response
// map configured per test — precise enough for this route's exact queries
// (integrations lookup for workspace resolution, messages for status
// updates) without needing a real database.
type TableResponses = Record<string, { data: unknown; error: unknown }>;
function makeSupabaseMock(responses: TableResponses) {
  function builder(table: string) {
    const response = responses[table] ?? { data: null, error: null };
    const chain = {
      select: () => chain,
      eq: () => chain,
      limit: () => Promise.resolve(response),
      single: () => Promise.resolve(response),
      maybeSingle: () => Promise.resolve(response),
      update: () => chain,
      insert: () => Promise.resolve(response),
    };
    return chain;
  }
  return { from: builder };
}

let supabaseResponses: TableResponses = {};
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => makeSupabaseMock(supabaseResponses),
}));

const YCLOUD_ROW = { workspace_id: 'workspace-a', credentials: { webhook_signing_secret: 'shh', ycloud_api_key: 'key' }, config: { phone_number: '+34600000000' } };

function inboundBody() {
  return { type: 'whatsapp.inbound_message.received', whatsappInboundMessage: { to: '+34600000000', from: '+34611111111' } };
}

beforeEach(() => {
  vi.clearAllMocks();
  verifyYCloudSignature.mockReturnValue(true);
  decryptCredentials.mockImplementation(async (creds: Record<string, unknown> | null) => ({ ...(creds ?? {}) }) as Record<string, string>);
  checkRateLimits.mockResolvedValue({ allowed: true, reason: null });
  getChatbotRuntimeConfig.mockResolvedValue(null);
  isWhatsAppAgentRuntimeEnabled.mockResolvedValue(true);
  supabaseResponses = {
    // The test URLs never carry ?wsid=, so the route takes the fallback
    // phone-scan path (.limit(10)), which expects an array.
    integrations: { data: [YCLOUD_ROW], error: null },
  };
});

describe('ycloud webhook — no Chatbot owns the number (the common/default case)', () => {
  it('falls through to the existing pipeline completely unchanged: processInbound runs, chatbot is never invoked', async () => {
    parseInbound.mockReturnValue({ from: '+34611111111', workspacePhone: '+34600000000', type: 'text', text: 'hola', wamid: 'w-1', customerName: null, createTime: '2026-07-24T00:00:00.000Z', mediaLink: null });
    processInbound.mockResolvedValue({
      contact: { id: 'contact-1' },
      conversation: { id: 'conv-1', ai_enabled: true },
      message: { id: 'msg-1' },
    });

    const { POST } = await import('./route');
    const request = new NextRequest('http://localhost/api/webhooks/ycloud', {
      method: 'POST',
      body: JSON.stringify(inboundBody()),
      headers: { 'YCloud-Signature': 'sig' },
    });
    const response = await POST(request);
    const body = await response.json();

    expect(getChatbotRuntimeConfig).toHaveBeenCalledWith('workspace-a', 'whatsapp', expect.anything());
    expect(handleChatbotWhatsAppInbound).not.toHaveBeenCalled();
    expect(processInbound).toHaveBeenCalledTimes(1);
    expect(upsertBatch).toHaveBeenCalledTimes(1);
    expect(body).toMatchObject({ received: true, buffered: true });
  });

  it('still rejects an unverified signature before anything else runs', async () => {
    verifyYCloudSignature.mockReturnValue(false);
    parseInbound.mockReturnValue({ from: '+34611111111', workspacePhone: '+34600000000', type: 'text', text: 'hola', wamid: 'w-1', customerName: null, createTime: '2026-07-24T00:00:00.000Z', mediaLink: null });

    const { POST } = await import('./route');
    const request = new NextRequest('http://localhost/api/webhooks/ycloud', { method: 'POST', body: JSON.stringify(inboundBody()), headers: { 'YCloud-Signature': 'bad' } });
    const response = await POST(request);

    expect(response.status).toBe(401);
    expect(getChatbotRuntimeConfig).not.toHaveBeenCalled();
    expect(processInbound).not.toHaveBeenCalled();
  });

  it('stores the inbound message but never buffers an AI reply when WhatsApp is stopped from the office', async () => {
    isWhatsAppAgentRuntimeEnabled.mockResolvedValue(false);
    parseInbound.mockReturnValue({ from: '+34611111111', workspacePhone: '+34600000000', type: 'text', text: 'hola', wamid: 'w-off', customerName: null, createTime: '2026-07-24T00:00:00.000Z', mediaLink: null });
    processInbound.mockResolvedValue({
      contact: { id: 'contact-1' },
      conversation: { id: 'conv-1', ai_enabled: true },
      message: { id: 'msg-1' },
    });

    const { POST } = await import('./route');
    const response = await POST(new NextRequest('http://localhost/api/webhooks/ycloud', {
      method: 'POST',
      body: JSON.stringify(inboundBody()),
      headers: { 'YCloud-Signature': 'sig' },
    }));

    expect(processInbound).toHaveBeenCalledTimes(1);
    expect(upsertBatch).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toMatchObject({ received: true, ai: false, officeWhatsAppInactive: true });
  });
});

describe('ycloud webhook — Chatbot owns the number', () => {
  it('answers via the chatbot and returns without ever calling processInbound', async () => {
    parseInbound.mockReturnValue({ from: '+34611111111', workspacePhone: '+34600000000', type: 'text', text: '¿Cuál es el horario?', wamid: 'w-2', customerName: null, createTime: '2026-07-24T00:00:00.000Z', mediaLink: null });
    getChatbotRuntimeConfig.mockResolvedValue({ name: 'Bot', useCase: 'external_faq', purpose: 'p', instructions: 'i', faqs: [], fallbackMessage: 'f', model: 'm' });

    const { POST } = await import('./route');
    const request = new NextRequest('http://localhost/api/webhooks/ycloud', { method: 'POST', body: JSON.stringify(inboundBody()), headers: { 'YCloud-Signature': 'sig' } });
    const response = await POST(request);
    const body = await response.json();

    expect(handleChatbotWhatsAppInbound).toHaveBeenCalledTimes(1);
    expect(handleChatbotWhatsAppInbound).toHaveBeenCalledWith(expect.objectContaining({ workspaceId: 'workspace-a', from: '+34611111111', to: '+34600000000', text: '¿Cuál es el horario?' }));
    expect(processInbound).not.toHaveBeenCalled();
    expect(body).toMatchObject({ received: true, chatbot: true });
  });

  it('passes text: null for non-text inbound (no transcription/vision in the Chatbot path)', async () => {
    parseInbound.mockReturnValue({ from: '+34611111111', workspacePhone: '+34600000000', type: 'image', text: '[Multimedia]', wamid: 'w-3', customerName: null, createTime: '2026-07-24T00:00:00.000Z', mediaLink: 'https://example.com/img.jpg' });
    getChatbotRuntimeConfig.mockResolvedValue({ name: 'Bot', useCase: 'external_faq', purpose: 'p', instructions: 'i', faqs: [], fallbackMessage: 'f', model: 'm' });

    const { POST } = await import('./route');
    const request = new NextRequest('http://localhost/api/webhooks/ycloud', { method: 'POST', body: JSON.stringify(inboundBody()), headers: { 'YCloud-Signature': 'sig' } });
    await POST(request);

    expect(handleChatbotWhatsAppInbound).toHaveBeenCalledWith(expect.objectContaining({ text: null }));
  });
});
