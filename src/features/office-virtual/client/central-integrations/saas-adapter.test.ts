import { describe, expect, it } from 'vitest';
import { adaptSaasWorkspaceCapabilities, type SaasWorkspaceCapabilityRow } from './saas-adapter';

const BASE_WORKSPACE: SaasWorkspaceCapabilityRow = {
  id: 'workspace-a',
  whatsapp_agent_enabled: false,
  vapi_assistant_id: null,
  advanced_memory_enabled: false,
  cross_channel_memory_enabled: false,
  pipeline_ai_enabled: false,
  cold_lead_recovery_enabled: false,
  virtual_office_enabled: true,
};

describe('adaptSaasWorkspaceCapabilities — Chatbot projection never leaks private config', () => {
  it('only ever exposes configured/enabled/health/provider for the chatbot, nothing from the document', () => {
    const snapshot = adaptSaasWorkspaceCapabilities({
      workspace: BASE_WORKSPACE,
      activeWhatsappAgent: null,
      ycloudIntegration: null,
      ycloudHealth: { health: 'unknown' },
      voiceHealth: { health: 'unknown' },
      chatbot: { configured: true, enabled: true, provider: 'whatsapp' },
      capturedAt: '2026-07-24T00:00:00.000Z',
    });

    expect(Object.keys(snapshot.chatbot).sort()).toEqual(['configured', 'enabled', 'health', 'provider']);
    expect(snapshot.chatbot).toEqual({ configured: true, enabled: true, health: 'healthy', provider: 'whatsapp' });

    // No amount of a caller trying to smuggle extra document fields through
    // the `chatbot` input can reach the projection — the input type itself
    // (SaasChatbotRow) has no name/instructions/faqs/model/credential
    // fields, and the adapter only ever reads the four it declares.
    const serialized = JSON.stringify(snapshot).toLowerCase();
    for (const forbidden of ['instructions', 'faqs', 'fallbackmessage', 'model', 'apikey', 'token', 'secret', 'credential']) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it('reports the chatbot as not configured/not enabled when absent, never fabricating a value', () => {
    const snapshot = adaptSaasWorkspaceCapabilities({
      workspace: BASE_WORKSPACE,
      activeWhatsappAgent: null,
      ycloudIntegration: null,
      ycloudHealth: { health: 'unknown' },
      voiceHealth: { health: 'unknown' },
      chatbot: null,
      capturedAt: '2026-07-24T00:00:00.000Z',
    });

    expect(snapshot.chatbot).toEqual({ configured: false, enabled: false, health: 'unknown', provider: null });
  });
});
