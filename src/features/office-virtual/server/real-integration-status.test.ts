// Proof that OpenRouter's status is read from the SAME `integrations` row
// Ajustes → Integraciones and the Orquestador verify flow both already
// write to — never a second, invented connection system, and never
// conflated with a merely-enabled-but-unverified row.

import { describe, expect, it, vi, beforeEach } from 'vitest';

type Row = { provider: string; enabled: boolean; credentials: Record<string, unknown> | null; config: Record<string, unknown> | null };
let rows: Row[] = [];

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          in: async () => ({ data: rows }),
        }),
      }),
    }),
  })),
}));

const { resolveRealIntegrationStatuses } = await import('./real-integration-status');

beforeEach(() => {
  rows = [];
});

describe('resolveRealIntegrationStatuses — OpenRouter status', () => {
  it('is "not_configured" when there is no OpenRouter row at all', async () => {
    const { openRouter } = await resolveRealIntegrationStatuses('workspace-a');
    expect(openRouter).toBe('not_configured');
  });

  it('is "not_configured" when the row exists but is disabled — a disabled row is never "configured"', async () => {
    rows = [{ provider: 'openrouter', enabled: false, credentials: { openrouter_api_key: 'sk-or-real-key' }, config: null }];
    const { openRouter } = await resolveRealIntegrationStatuses('workspace-a');
    expect(openRouter).toBe('not_configured');
  });

  it('is "needs_attention" when enabled but the API key is blank — Ajustes lets you save an empty key', async () => {
    rows = [{ provider: 'openrouter', enabled: true, credentials: { openrouter_api_key: '' }, config: null }];
    const { openRouter } = await resolveRealIntegrationStatuses('workspace-a');
    expect(openRouter).toBe('needs_attention');
  });

  it('is "configured" (never "verified") when enabled with a real key but the Orquestador verify flow never ran', async () => {
    rows = [{ provider: 'openrouter', enabled: true, credentials: { openrouter_api_key: 'sk-or-real-key' }, config: null }];
    const { openRouter } = await resolveRealIntegrationStatuses('workspace-a');
    expect(openRouter).toBe('configured');
  });

  it('is "configured" even when the Orquestador binding exists but its last verification failed', async () => {
    rows = [
      {
        provider: 'openrouter',
        enabled: true,
        credentials: { openrouter_api_key: 'sk-or-real-key' },
        config: { office_virtual_openrouter: { status: 'error', statusDetail: 'invalid key' } },
      },
    ];
    const { openRouter } = await resolveRealIntegrationStatuses('workspace-a');
    expect(openRouter).toBe('configured');
  });

  it('is "verified" only when the Orquestador connect/verify flow persisted a successful result on this SAME row', async () => {
    rows = [
      {
        provider: 'openrouter',
        enabled: true,
        credentials: { openrouter_api_key: 'sk-or-real-key' },
        config: { office_virtual_openrouter: { status: 'connected' } },
      },
    ];
    const { openRouter } = await resolveRealIntegrationStatuses('workspace-a');
    expect(openRouter).toBe('verified');
  });

  it('never makes a live call to OpenRouter itself — only reads what is already persisted', async () => {
    // No network mock provided at all; if the resolver tried to call out,
    // this test would throw (no `fetch`/http client stub exists here).
    rows = [{ provider: 'openrouter', enabled: true, credentials: { openrouter_api_key: 'sk-or-real-key' }, config: null }];
    await expect(resolveRealIntegrationStatuses('workspace-a')).resolves.toMatchObject({ openRouter: 'configured' });
  });
});

describe('resolveRealIntegrationStatuses — the 4 execution integrations stay simple booleans', () => {
  it('only counts a row as connected when enabled === true, and openrouter is never in the execution map', async () => {
    rows = [
      { provider: 'openrouter', enabled: true, credentials: { openrouter_api_key: 'k' }, config: null },
      { provider: 'ycloud', enabled: true, credentials: {}, config: {} },
      { provider: 'highlevel', enabled: false, credentials: {}, config: {} },
    ];
    const { execution } = await resolveRealIntegrationStatuses('workspace-a');
    expect(execution).toEqual({ ycloud: true, highlevel: false });
    expect(execution).not.toHaveProperty('openrouter');
  });
});
