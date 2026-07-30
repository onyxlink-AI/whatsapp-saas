// Proof that the real chat route stays gated the same way every other real
// Oficina Virtual data route is (requireOfficeVirtualReader), rejects a
// malformed body before touching the service, and relays the service's
// coordinator/delegation result — or its refusal reason — unmodified.

import { describe, expect, it, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const requireOfficeVirtualReader = vi.fn();
const readJsonBody = vi.fn();
const handleCoordinatorMessage = vi.fn();

vi.mock('@/features/office-virtual/server/office-virtual-access', () => ({ requireOfficeVirtualReader }));
vi.mock('@/lib/auth/workspace-access', () => ({ readJsonBody }));
vi.mock('@/features/office-virtual/server/real-chat-service', async () => {
  const actual = await vi.importActual<typeof import('@/features/office-virtual/server/real-chat-service')>(
    '@/features/office-virtual/server/real-chat-service',
  );
  return { ...actual, handleCoordinatorMessage };
});
vi.mock('@/features/office-virtual/server/real-integration-status', () => ({ resolveRealIntegrationStatuses: vi.fn() }));
vi.mock('@/features/inbox/services/openrouter', () => ({ generateChatReply: vi.fn() }));
vi.mock('@supabase/supabase-js', () => ({ createClient: vi.fn(() => ({})) }));

const { POST } = await import('./route');

function params(workspaceId: string) {
  return { params: Promise.resolve({ id: workspaceId }) };
}

function request(body: unknown) {
  return new NextRequest('http://localhost/api/workspace/empresa-a/office-virtual/chat', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('POST /api/workspace/[id]/office-virtual/chat', () => {
  it('rejects a caller who fails the same Oficina Virtual reader gate as the rest of the feature', async () => {
    requireOfficeVirtualReader.mockResolvedValue({
      ok: false,
      response: new Response(JSON.stringify({ error: 'Oficina Virtual no está activada para este workspace' }), { status: 409 }),
    });

    const res = await POST(request({ message: 'hola' }), params('empresa-a'));
    expect(res.status).toBe(409);
    expect(handleCoordinatorMessage).not.toHaveBeenCalled();
  });

  it('rejects an empty message before touching the service', async () => {
    requireOfficeVirtualReader.mockResolvedValue({ ok: true, userId: 'user-1', isSuperAdmin: false });
    readJsonBody.mockResolvedValue({ ok: true, body: { message: '', history: [] } });

    const res = await POST(request({ message: '' }), params('empresa-a'));
    expect(res.status).toBe(400);
    expect(handleCoordinatorMessage).not.toHaveBeenCalled();
  });

  it('relays a successful coordinator reply with its delegation', async () => {
    requireOfficeVirtualReader.mockResolvedValue({ ok: true, userId: 'user-1', isSuperAdmin: false });
    readJsonBody.mockResolvedValue({ ok: true, body: { message: 'Necesito una propuesta', history: [] } });
    handleCoordinatorMessage.mockResolvedValue({
      success: true,
      coordinatorText: 'Se lo paso a Marco.',
      delegation: { agentId: 'specialist-1', specialistName: 'Marco', text: 'Aquí está la propuesta.' },
    });

    const res = await POST(request({ message: 'Necesito una propuesta' }), params('empresa-a'));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.coordinatorText).toBe('Se lo paso a Marco.');
    expect(body.delegation.specialistName).toBe('Marco');
  });

  it('surfaces a missing-API-key refusal as 409 with a readable message, not a 500', async () => {
    requireOfficeVirtualReader.mockResolvedValue({ ok: true, userId: 'user-1', isSuperAdmin: false });
    readJsonBody.mockResolvedValue({ ok: true, body: { message: 'hola', history: [] } });
    handleCoordinatorMessage.mockResolvedValue({ success: false, code: 'api_key_missing' });

    const res = await POST(request({ message: 'hola' }), params('empresa-a'));
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(typeof body.error).toBe('string');
    expect(body.error.length).toBeGreaterThan(0);
  });
});
