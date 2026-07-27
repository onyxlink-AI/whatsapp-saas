// Regression test for the access-control fix on the Chatbot's own
// configurator API: this route used to accept any workspace ADMIN member
// (requireWorkspaceMember(workspaceId, { minRole: 'admin' })), which meant a
// client's own admin user could read/write the full Chatbot document
// (instructions, FAQs, model). The Chatbot is not client self-service —
// only the platform superadmin may reach this route, regardless of which
// workspaceId is in the URL. These tests prove that invariant directly
// against the route handlers, with the auth/service layers mocked so no
// real Supabase connection is required.

import { describe, expect, it, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const requireSuperAdmin = vi.fn();
const readJsonBody = vi.fn(async (req: Request) => ({ ok: true as const, body: await req.json() }));
const loadOrProvisionChatbot = vi.fn();
const handleChatbotCommand = vi.fn();
const resolveChannelReadiness = vi.fn(async () => true);
const logAudit = vi.fn();

vi.mock('@/lib/auth/workspace-access', () => ({ requireSuperAdmin, readJsonBody }));
vi.mock('@/features/chatbot/server/chatbot-service', () => ({ loadOrProvisionChatbot, handleChatbotCommand }));
vi.mock('@/features/chatbot/server/channel-readiness', () => ({ resolveChannelReadiness }));
vi.mock('@/features/audit/services/audit-log', () => ({ logAudit }));
vi.mock('@supabase/supabase-js', () => ({ createClient: vi.fn(() => ({})) }));

const { GET, POST } = await import('./route');

const FORBIDDEN = {
  ok: false as const,
  response: new Response(JSON.stringify({ error: 'Esta función solo la puede activar Onyxlink' }), { status: 403 }),
};

function params(workspaceId: string) {
  return { params: Promise.resolve({ id: workspaceId }) };
}

beforeEach(() => {
  vi.clearAllMocks();
  resolveChannelReadiness.mockResolvedValue(true);
});

describe('GET /api/workspace/[id]/chatbot — superadmin only', () => {
  it('a superadmin can load the Chatbot configuration', async () => {
    requireSuperAdmin.mockResolvedValue({ ok: true, userId: 'admin-1', email: 'superadmin@onyxlink.local' });
    loadOrProvisionChatbot.mockResolvedValue({ revision: 1, status: 'draft', enabled: false, document: {}, updatedAt: 'now', updatedBy: 'x' });

    const req = new NextRequest('http://localhost/api/workspace/empresa-a/chatbot');
    const res = await GET(req, params('empresa-a'));

    expect(res.status).toBe(200);
    expect(loadOrProvisionChatbot).toHaveBeenCalledWith('empresa-a', expect.anything(), expect.anything());
  });

  it("Empresa A's own workspace admin gets 403 reading Empresa A's own Chatbot", async () => {
    requireSuperAdmin.mockResolvedValue(FORBIDDEN);

    const req = new NextRequest('http://localhost/api/workspace/empresa-a/chatbot');
    const res = await GET(req, params('empresa-a'));

    expect(res.status).toBe(403);
    expect(loadOrProvisionChatbot).not.toHaveBeenCalled();
  });

  it("Empresa A's admin gets 403 reaching Empresa B's Chatbot too (not workspace-scoped, superadmin-only)", async () => {
    requireSuperAdmin.mockResolvedValue(FORBIDDEN);

    const req = new NextRequest('http://localhost/api/workspace/empresa-b/chatbot');
    const res = await GET(req, params('empresa-b'));

    expect(res.status).toBe(403);
    expect(loadOrProvisionChatbot).not.toHaveBeenCalled();
  });
});

describe('POST /api/workspace/[id]/chatbot — superadmin only', () => {
  it('rejects a non-superadmin before touching the command handler', async () => {
    requireSuperAdmin.mockResolvedValue(FORBIDDEN);

    const req = new NextRequest('http://localhost/api/workspace/empresa-a/chatbot', {
      method: 'POST',
      body: JSON.stringify({ expectedRevision: 1, command: { type: 'publish' } }),
    });
    const res = await POST(req, params('empresa-a'));

    expect(res.status).toBe(403);
    expect(handleChatbotCommand).not.toHaveBeenCalled();
  });

  it('a superadmin can send a command', async () => {
    requireSuperAdmin.mockResolvedValue({ ok: true, userId: 'admin-1', email: 'superadmin@onyxlink.local' });
    handleChatbotCommand.mockResolvedValue({ success: true, document: { revision: 2, status: 'published' } });

    const req = new NextRequest('http://localhost/api/workspace/empresa-a/chatbot', {
      method: 'POST',
      body: JSON.stringify({ expectedRevision: 1, command: { type: 'publish' } }),
    });
    const res = await POST(req, params('empresa-a'));

    expect(res.status).toBe(200);
    expect(handleChatbotCommand).toHaveBeenCalled();
  });
});
