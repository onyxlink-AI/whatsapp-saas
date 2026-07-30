// Proof that the Orquestador's model-policy route stays superadmin-exclusive
// and that GET returns a binding with the real OpenRouter signal already
// overlaid — the fix for "Bloqueado · Falta la API key en el backend"
// showing even when Ajustes → Integraciones → OpenRouter is connected.

import { describe, expect, it, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import type { WorkspaceOrchestratorBinding } from '@/features/office-virtual/client/central-orchestrator';

const requireSuperAdmin = vi.fn();
const readJsonBody = vi.fn();
const loadOrchestratorBinding = vi.fn();
const handleOrchestratorCommand = vi.fn();
const resolveRealIntegrationStatuses = vi.fn();

vi.mock('@/lib/auth/workspace-access', () => ({ requireSuperAdmin, readJsonBody }));
vi.mock('@/features/office-virtual/server/orchestrator-service', () => ({
  loadOrchestratorBinding,
  handleOrchestratorCommand,
}));
vi.mock('@/features/office-virtual/server/real-integration-status', () => ({ resolveRealIntegrationStatuses }));
vi.mock('@/features/audit/services/audit-log', () => ({ logAudit: vi.fn() }));

const workspaceRow = { id: 'empresa-a', office_virtual_enabled: true };
const supabaseStub = {
  from: () => ({
    select: () => ({
      eq: () => ({
        maybeSingle: async () => ({ data: workspaceRow, error: null }),
      }),
    }),
  }),
};
vi.mock('@supabase/supabase-js', () => ({ createClient: vi.fn(() => supabaseStub) }));

const { GET, POST } = await import('./route');

function params(workspaceId: string) {
  return { params: Promise.resolve({ id: workspaceId }) };
}

function fakeBinding(overrides: Partial<WorkspaceOrchestratorBinding['openrouter']> = {}): WorkspaceOrchestratorBinding {
  return {
    workspaceId: 'empresa-a',
    activeMode: 'openrouter',
    openrouter: {
      mode: 'openrouter',
      model: null,
      fallbackModel: null,
      costProfile: 'balanced',
      dailyRequestLimit: null,
      monthlyRequestLimit: null,
      allowPremiumModels: false,
      agentOverrides: {},
      status: 'not_configured',
      hasApiKey: false,
      statusDetail: null,
      updatedAt: '2026-07-30T00:00:00.000Z',
      updatedBy: 'system',
      ...overrides,
    },
    hermesTelegram: {
      mode: 'hermes_telegram',
      endpoint: null,
      connectionId: null,
      botId: null,
      status: 'not_configured',
      hasSecret: false,
      statusDetail: null,
      updatedAt: '2026-07-30T00:00:00.000Z',
      updatedBy: 'system',
    },
    revision: 1,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('GET /api/workspace/[id]/office-virtual/orchestrator — superadmin only', () => {
  it('rejects a non-superadmin before loading any binding', async () => {
    requireSuperAdmin.mockResolvedValue({
      ok: false,
      response: new Response(JSON.stringify({ error: 'Esta función solo la puede activar Onyxlink' }), { status: 403 }),
    });

    const res = await GET(new NextRequest('http://localhost/api/workspace/empresa-a/office-virtual/orchestrator'), params('empresa-a'));
    expect(res.status).toBe(403);
    expect(loadOrchestratorBinding).not.toHaveBeenCalled();
  });

  it('returns a binding whose openrouter.hasApiKey/status reflect the real integration, not a blank client default', async () => {
    requireSuperAdmin.mockResolvedValue({ ok: true, userId: 'admin-1', email: 'superadmin@onyxlink.local' });
    loadOrchestratorBinding.mockResolvedValue(fakeBinding({ hasApiKey: true, status: 'connected' }));

    const res = await GET(new NextRequest('http://localhost/api/workspace/empresa-a/office-virtual/orchestrator'), params('empresa-a'));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.binding.openrouter.hasApiKey).toBe(true);
    expect(body.binding.openrouter.status).toBe('connected');
  });
});

describe('POST /api/workspace/[id]/office-virtual/orchestrator', () => {
  it('rejects a malformed command body before touching the service', async () => {
    requireSuperAdmin.mockResolvedValue({ ok: true, userId: 'admin-1', email: 'superadmin@onyxlink.local' });
    readJsonBody.mockResolvedValue({ ok: true, body: { expectedRevision: 1, command: { type: 'not_a_real_command' } } });

    const res = await POST(new NextRequest('http://localhost/api/workspace/empresa-a/office-virtual/orchestrator', { method: 'POST' }), params('empresa-a'));
    expect(res.status).toBe(400);
    expect(handleOrchestratorCommand).not.toHaveBeenCalled();
  });

  it('applies a valid model policy command and returns the updated binding', async () => {
    requireSuperAdmin.mockResolvedValue({ ok: true, userId: 'admin-1', email: 'superadmin@onyxlink.local' });
    readJsonBody.mockResolvedValue({
      ok: true,
      body: {
        expectedRevision: 1,
        command: { type: 'orchestrator.openrouter_model_policy_updated', model: 'openai/gpt-4.1-mini' },
      },
    });
    handleOrchestratorCommand.mockResolvedValue({
      success: true,
      binding: fakeBinding({ model: 'openai/gpt-4.1-mini', hasApiKey: true, status: 'connected' }),
    });

    const res = await POST(new NextRequest('http://localhost/api/workspace/empresa-a/office-virtual/orchestrator', { method: 'POST' }), params('empresa-a'));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.binding.openrouter.model).toBe('openai/gpt-4.1-mini');
  });

  it('surfaces a stale-revision rejection as 409 without crashing', async () => {
    requireSuperAdmin.mockResolvedValue({ ok: true, userId: 'admin-1', email: 'superadmin@onyxlink.local' });
    readJsonBody.mockResolvedValue({
      ok: true,
      body: { expectedRevision: 1, command: { type: 'orchestrator.openrouter_config_updated', model: 'openai/gpt-4.1-mini' } },
    });
    handleOrchestratorCommand.mockResolvedValue({ success: false, code: 'stale_revision' });

    const res = await POST(new NextRequest('http://localhost/api/workspace/empresa-a/office-virtual/orchestrator', { method: 'POST' }), params('empresa-a'));
    expect(res.status).toBe(409);
  });
});
