// Same access-control regression as ../route.test.ts, for the live-test
// endpoint: it must never run a workspace's Chatbot config for anyone but
// the platform superadmin, regardless of the caller's role in that
// workspace or which workspaceId is targeted.

import { describe, expect, it, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const requireSuperAdmin = vi.fn();
const readJsonBody = vi.fn(async (req: Request) => ({ ok: true as const, body: await req.json() }));
const runChatbot = vi.fn();

vi.mock('@/lib/auth/workspace-access', () => ({ requireSuperAdmin, readJsonBody }));
vi.mock('@/features/chatbot/server/chatbot-runtime', () => ({ runChatbot }));
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { document: {} }, error: null }) }) }) }),
  })),
}));

const { POST } = await import('./route');

const FORBIDDEN = {
  ok: false as const,
  response: new Response(JSON.stringify({ error: 'Esta función solo la puede activar Onyxlink' }), { status: 403 }),
};

function params(workspaceId: string) {
  return { params: Promise.resolve({ id: workspaceId }) };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('POST /api/workspace/[id]/chatbot/test — superadmin only', () => {
  it("Empresa A's own admin gets 403, never reaching the runtime", async () => {
    requireSuperAdmin.mockResolvedValue(FORBIDDEN);

    const req = new NextRequest('http://localhost/api/workspace/empresa-a/chatbot/test', {
      method: 'POST',
      body: JSON.stringify({ question: '¿Cual es el horario?' }),
    });
    const res = await POST(req, params('empresa-a'));

    expect(res.status).toBe(403);
    expect(runChatbot).not.toHaveBeenCalled();
  });

  it('a superadmin can run a live test', async () => {
    requireSuperAdmin.mockResolvedValue({ ok: true, userId: 'admin-1', email: 'superadmin@onyxlink.local' });
    runChatbot.mockResolvedValue({ answer: 'De 9 a 18h.', source: 'openrouter' });

    const req = new NextRequest('http://localhost/api/workspace/empresa-a/chatbot/test', {
      method: 'POST',
      body: JSON.stringify({ question: '¿Cual es el horario?' }),
    });
    const res = await POST(req, params('empresa-a'));

    expect(res.status).toBe(200);
    expect(runChatbot).toHaveBeenCalled();
  });
});
