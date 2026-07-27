import { describe, expect, it, vi } from 'vitest';
import type { OfficeOpenRouterRequest } from '../openrouter-connection-contract';
import {
  handleOfficeOpenRouterRequest,
  type OpenRouterConnectionServicePorts,
  type OpenRouterIntegrationRecord,
} from './openrouter-connection-service';

const WORKSPACE = 'workspace-test';

function request(action: OfficeOpenRouterRequest['action'], requestId = 'request-1'): OfficeOpenRouterRequest {
  return { requestId, workspaceId: WORKSPACE, action };
}

function ports(record: OpenRouterIntegrationRecord | null, platformApiKey = '') {
  let current = record;
  const verifyCredential = vi.fn(async () => ({ success: true as const }));
  const servicePorts: OpenRouterConnectionServicePorts = {
    store: {
      load: async () => current,
      saveConfig: async (_workspaceId, config) => {
        current = { ...(current ?? { id: null, enabled: true, credentials: {} }), config };
      },
    },
    platformApiKey,
    verifyCredential,
    now: () => '2026-07-17T12:00:00.000Z',
    createConnectionId: () => 'connection-test',
  };
  return { servicePorts, verifyCredential, getRecord: () => current };
}

describe('Office Virtual OpenRouter connection service', () => {
  it('reuses the workspace integration key and verifies it without exposing it in the report', async () => {
    const harness = ports({
      id: 'integration-1',
      enabled: true,
      credentials: { openrouter_api_key: 'sk-client-only' },
      config: {},
    });

    const result = await handleOfficeOpenRouterRequest(
      request({ type: 'provision_connection', workspaceId: WORKSPACE, connectionKind: 'dedicated' }),
      'admin-user',
      harness.servicePorts,
    );

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.report.status).toBe('connected');
      expect(result.report.hasCredential).toBe(true);
      expect(JSON.stringify(result.report)).not.toContain('sk-client-only');
    }
    expect(harness.verifyCredential).toHaveBeenCalledWith('sk-client-only');
  });

  it('uses the platform credential for a shared connection', async () => {
    const harness = ports(null, 'sk-platform-only');

    const result = await handleOfficeOpenRouterRequest(
      request({ type: 'provision_connection', workspaceId: WORKSPACE, connectionKind: 'shared' }),
      'super-admin',
      harness.servicePorts,
    );

    expect(result.success).toBe(true);
    if (result.success) expect(result.report.status).toBe('connected');
    expect(harness.verifyCredential).toHaveBeenCalledWith('sk-platform-only');
  });

  it('reports a missing dedicated credential without pretending to connect', async () => {
    const harness = ports({ id: 'integration-1', enabled: true, credentials: {}, config: {} });

    const result = await handleOfficeOpenRouterRequest(
      request({ type: 'provision_connection', workspaceId: WORKSPACE, connectionKind: 'dedicated' }),
      'admin-user',
      harness.servicePorts,
    );

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.report.status).toBe('error');
      expect(result.report.hasCredential).toBe(false);
    }
    expect(harness.verifyCredential).not.toHaveBeenCalled();
  });

  it('is idempotent and revokes only the Office Virtual binding', async () => {
    const harness = ports({
      id: 'integration-1',
      enabled: true,
      credentials: { openrouter_api_key: 'sk-client-only' },
      config: {},
    });
    const connectRequest = request({ type: 'provision_connection', workspaceId: WORKSPACE, connectionKind: 'dedicated' });
    const first = await handleOfficeOpenRouterRequest(connectRequest, 'admin-user', harness.servicePorts);
    const duplicate = await handleOfficeOpenRouterRequest(connectRequest, 'admin-user', harness.servicePorts);

    expect(first).toEqual(duplicate);
    expect(harness.verifyCredential).toHaveBeenCalledTimes(1);

    if (!first.success) throw new Error('Expected connection to succeed');
    const revoked = await handleOfficeOpenRouterRequest(
      request({ type: 'revoke_connection', workspaceId: WORKSPACE, connectionId: first.report.connectionId }, 'request-2'),
      'admin-user',
      harness.servicePorts,
    );

    expect(revoked.success).toBe(true);
    if (revoked.success) {
      expect(revoked.report.status).toBe('revoked');
      expect(revoked.report.statusDetail).toContain('API key');
    }
    expect(harness.getRecord()?.credentials.openrouter_api_key).toBe('sk-client-only');
  });
});
