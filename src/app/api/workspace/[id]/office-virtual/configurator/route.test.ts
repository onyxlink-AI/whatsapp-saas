// Proof that the Configurador's own route stays superadmin-exclusive and
// keeps returning the FULL document — every one of the 8 seats, including
// disabled ones with their real name/function/objective/instructions —
// since the superadmin must be able to see and re-enable them without data
// loss. This is the deliberate counterpart to office-agents/route.test.ts,
// which proves the opposite (client-facing) route sanitizes.

import { describe, expect, it, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import type { RealIntegrationStatus } from '@/features/office-virtual/server/real-integration-status';

const requireSuperAdmin = vi.fn();
const readJsonBody = vi.fn();
const loadOrProvisionOfficeConfiguration = vi.fn();
const resolveRealIntegrationStatuses = vi.fn<() => Promise<RealIntegrationStatus>>(async () => ({ execution: {}, openRouter: 'not_configured' }));

vi.mock('@/lib/auth/workspace-access', () => ({ requireSuperAdmin, readJsonBody }));
vi.mock('@/features/office-virtual/server/office-configuration-service', () => ({
  loadOrProvisionOfficeConfiguration,
  handleOfficeConfigurationCommand: vi.fn(),
}));
vi.mock('@/features/office-virtual/server/real-integration-status', () => ({ resolveRealIntegrationStatuses }));
vi.mock('@/features/audit/services/audit-log', () => ({ logAudit: vi.fn() }));
vi.mock('@supabase/supabase-js', () => ({ createClient: vi.fn(() => ({})) }));

const { GET } = await import('./route');

function params(workspaceId: string) {
  return { params: Promise.resolve({ id: workspaceId }) };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('GET /api/workspace/[id]/office-virtual/configurator — superadmin only, full data', () => {
  it('rejects an unauthenticated request with 401 before loading any configuration', async () => {
    // Mirrors requireSuperAdmin()'s real "no session" shape (platform-access.ts)
    // — distinct from the "authenticated but not superadmin" 403 case below.
    // This route.ok===false branch used to only be proven end-to-end by a
    // live HTTP fetch in rls-helper-privileges.test.ts; that depended on an
    // external app/domain being reachable, so the real route-level assertion
    // now lives here instead, fully deterministic via the same mocking the
    // rest of this file already uses.
    requireSuperAdmin.mockResolvedValue({
      ok: false,
      response: new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 }),
    });

    const res = await GET(new NextRequest('http://localhost/api/workspace/empresa-a/office-virtual/configurator'), params('empresa-a'));
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body).toEqual({ error: 'Unauthorized' });
    expect(loadOrProvisionOfficeConfiguration).not.toHaveBeenCalled();
    expect(resolveRealIntegrationStatuses).not.toHaveBeenCalled();
  });

  it('rejects a non-superadmin before loading any configuration', async () => {
    requireSuperAdmin.mockResolvedValue({
      ok: false,
      response: new Response(JSON.stringify({ error: 'Esta función solo la puede activar Onyxlink' }), { status: 403 }),
    });

    const res = await GET(new NextRequest('http://localhost/api/workspace/empresa-a/office-virtual/configurator'), params('empresa-a'));
    expect(res.status).toBe(403);
    expect(loadOrProvisionOfficeConfiguration).not.toHaveBeenCalled();
  });

  it('returns the full document for a superadmin, including a disabled seat\'s real name/function/objective/instructions', async () => {
    requireSuperAdmin.mockResolvedValue({ ok: true, userId: 'admin-1', email: 'superadmin@onyxlink.local' });
    resolveRealIntegrationStatuses.mockResolvedValue({
      execution: { ycloud: false, highlevel: false, google_calendar: true, airtable: false },
      openRouter: 'verified',
    });
    loadOrProvisionOfficeConfiguration.mockResolvedValue({
      revision: 2,
      status: 'published',
      document: {
        specialists: {
          'specialist-1': {
            agentId: 'specialist-1',
            enabled: false,
            name: 'Especialista Desactivado',
            function: 'Cobros',
            objective: 'Recuperar pagos vencidos',
            instructions: 'Instrucciones internas completas',
          },
        },
      },
    });

    const res = await GET(new NextRequest('http://localhost/api/workspace/empresa-a/office-virtual/configurator'), params('empresa-a'));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.head.document.specialists['specialist-1']).toMatchObject({
      enabled: false,
      name: 'Especialista Desactivado',
      function: 'Cobros',
      objective: 'Recuperar pagos vencidos',
      instructions: 'Instrucciones internas completas',
    });
    expect(body.realIntegrations).toEqual({ ycloud: false, highlevel: false, google_calendar: true, airtable: false });
    expect(body.openRouterStatus).toBe('verified');
  });
});
