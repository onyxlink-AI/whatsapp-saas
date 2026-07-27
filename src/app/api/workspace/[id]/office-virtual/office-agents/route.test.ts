// Route-level proof that the live office roster endpoint (a) is reachable
// by a regular workspace member (not superadmin-exclusive, unlike
// /configurator) and (b) only ever returns the sanitized, enabled-only
// projection scoped to the requested workspace — never a disabled seat's
// data, never another workspace's document.

import { describe, expect, it, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const requireOfficeVirtualReader = vi.fn();
const maybeSingle = vi.fn();

vi.mock('@/features/office-virtual/server/office-virtual-access', () => ({ requireOfficeVirtualReader }));
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle }) }) }),
  })),
}));

const { GET } = await import('./route');

function params(workspaceId: string) {
  return { params: Promise.resolve({ id: workspaceId }) };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('GET /api/workspace/[id]/office-virtual/office-agents', () => {
  it('rejects a caller requireOfficeVirtualReader denies, before touching the document', async () => {
    requireOfficeVirtualReader.mockResolvedValue({
      ok: false,
      response: new Response(JSON.stringify({ error: 'Acceso denegado' }), { status: 403 }),
    });

    const res = await GET(new NextRequest('http://localhost/api/workspace/empresa-a/office-virtual/office-agents'), params('empresa-a'));
    expect(res.status).toBe(403);
    expect(maybeSingle).not.toHaveBeenCalled();
  });

  it('only returns the enabled specialist, never the disabled one, to an authorized reader', async () => {
    requireOfficeVirtualReader.mockResolvedValue({ ok: true, userId: 'manager-1', isSuperAdmin: false });
    function seat(agentId: string, overrides: Record<string, unknown>) {
      return {
        agentId,
        enabled: false,
        name: `Especialista ${agentId}`,
        function: 'Puesto sin configurar',
        objective: 'Elige una plantilla para preparar este puesto.',
        color: '#2563eb',
        instructions: 'Trabaja solo dentro de las acciones y aprobaciones configuradas.',
        clientLayer: '',
        templateId: null,
        extensions: [],
        skills: [],
        allowedActions: ['read_contacts'],
        approvalPolicy: 'sensitive_only',
        ...overrides,
      };
    }
    const specialists: Record<string, unknown> = {};
    for (let i = 1; i <= 8; i += 1) specialists[`specialist-${i}`] = seat(`specialist-${i}`, {});
    specialists['specialist-1'] = seat('specialist-1', {
      enabled: true,
      name: 'Visible',
      function: 'Ventas',
      objective: 'x',
      color: '#2563eb',
      instructions: 'SECRETO',
      clientLayer: 'SECRETO',
    });
    specialists['specialist-2'] = seat('specialist-2', { enabled: false, name: 'Invisible', function: 'Soporte', objective: 'y', color: '#e11d48' });

    const document = {
      workspaceId: 'empresa-a',
      officeDisplayName: 'Oficina Empresa A',
      revision: 3,
      status: 'published',
      specialists,
    };
    maybeSingle.mockResolvedValue({ data: { document }, error: null });

    const res = await GET(new NextRequest('http://localhost/api/workspace/empresa-a/office-virtual/office-agents'), params('empresa-a'));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.projection.seats).toHaveLength(1);
    expect(body.projection.seats[0]).toMatchObject({ agentId: 'specialist-1', name: 'Visible' });
    const serialized = JSON.stringify(body);
    expect(serialized).not.toMatch(/Invisible|SECRETO/);
  });

  it("never leaks another workspace's document even if the DB row somehow mismatched", async () => {
    requireOfficeVirtualReader.mockResolvedValue({ ok: true, userId: 'manager-1', isSuperAdmin: false });
    const document = {
      workspaceId: 'empresa-b',
      officeDisplayName: 'Oficina Empresa B',
      revision: 1,
      status: 'published',
      specialists: {
        'specialist-1': { agentId: 'specialist-1', enabled: true, name: 'Solo Empresa B', function: 'x', objective: 'x', color: '#000', instructions: '', clientLayer: '', templateId: null, extensions: [], skills: [], allowedActions: ['read_contacts'], approvalPolicy: 'never' },
      },
    };
    maybeSingle.mockResolvedValue({ data: { document }, error: null });

    const res = await GET(new NextRequest('http://localhost/api/workspace/empresa-a/office-virtual/office-agents'), params('empresa-a'));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.projection.seats).toEqual([]);
    expect(JSON.stringify(body)).not.toMatch(/Solo Empresa B/);
  });
});
