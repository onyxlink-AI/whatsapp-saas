import { describe, expect, it } from 'vitest';
import { isChatbotChannelReady, isVoiceChannelReady, isWhatsAppChannelConfigured, isWhatsAppChannelReady } from './readiness';
import { createReadyWorkspaceFixture, createIncompleteWorkspaceFixture } from './fixtures';

describe('isVoiceChannelReady', () => {
  it('is ready when a real assistantId is linked and the channel is configured/enabled/healthy', () => {
    const snapshot = createReadyWorkspaceFixture();
    expect(isVoiceChannelReady(snapshot)).toBe(true);
  });

  it('is NOT ready without a linked assistantId — Voz nunca se activa sin configuración', () => {
    const snapshot = createIncompleteWorkspaceFixture();
    expect(snapshot.voice.assistantId).toBeNull();
    expect(isVoiceChannelReady(snapshot)).toBe(false);
  });

  it('is NOT ready if assistantId exists but the channel is not configured/enabled', () => {
    const snapshot = createReadyWorkspaceFixture({
      voice: { configured: false, enabled: false, health: 'unknown', assistantId: 'vapi-assistant-1' },
    });
    expect(isVoiceChannelReady(snapshot)).toBe(false);
  });

  it('cada workspace es independiente — el snapshot de una empresa nunca hereda el assistantId de otra', () => {
    const empresaA = createReadyWorkspaceFixture({ workspaceId: 'empresa-a' });
    const empresaB = createIncompleteWorkspaceFixture();
    expect(empresaA.workspaceId).toBe('empresa-a');
    expect(empresaB.voice.assistantId).toBeNull();
    expect(isVoiceChannelReady(empresaA)).toBe(true);
    expect(isVoiceChannelReady(empresaB)).toBe(false);
  });
});

describe('WhatsApp configuration and office activation', () => {
  it('does not show WhatsApp when the profile exists but YCloud is not configured', () => {
    const snapshot = createReadyWorkspaceFixture({
      ycloud: { configured: false, enabled: false, health: 'unknown' },
    });
    expect(isWhatsAppChannelConfigured(snapshot)).toBe(false);
    expect(isWhatsAppChannelReady(snapshot)).toBe(false);
  });

  it('does not show WhatsApp when configured but not activated from the office', () => {
    const snapshot = createReadyWorkspaceFixture({
      whatsappAgent: {
        enabled: true,
        officeEnabled: false,
        activeAgentId: 'agent-setter-1',
        activeAgentType: 'setter',
      },
    });
    expect(isWhatsAppChannelConfigured(snapshot)).toBe(true);
    expect(isWhatsAppChannelReady(snapshot)).toBe(false);
  });

  it('shows WhatsApp only when panel configuration and office activation are both ready', () => {
    const snapshot = createReadyWorkspaceFixture();
    expect(isWhatsAppChannelConfigured(snapshot)).toBe(true);
    expect(isWhatsAppChannelReady(snapshot)).toBe(true);
  });
});

describe('isChatbotChannelReady', () => {
  it('is ready when the chatbot channel is configured, enabled, healthy, and bound to a provider', () => {
    const snapshot = createReadyWorkspaceFixture();
    expect(isChatbotChannelReady(snapshot)).toBe(true);
  });

  it('is not ready when disabled', () => {
    const snapshot = createReadyWorkspaceFixture({
      chatbot: { configured: true, enabled: false, health: 'healthy', provider: 'whatsapp' },
    });
    expect(isChatbotChannelReady(snapshot)).toBe(false);
  });

  it('is not ready when no provider is bound, even if otherwise healthy', () => {
    const snapshot = createReadyWorkspaceFixture({
      chatbot: { configured: true, enabled: true, health: 'healthy', provider: null },
    });
    expect(isChatbotChannelReady(snapshot)).toBe(false);
  });

  it('is not ready when health is not healthy', () => {
    const snapshot = createReadyWorkspaceFixture({
      chatbot: { configured: true, enabled: true, health: 'error', provider: 'telegram' },
    });
    expect(isChatbotChannelReady(snapshot)).toBe(false);
  });

  it('does not affect WhatsApp/voice readiness — each channel is independent', () => {
    const snapshot = createReadyWorkspaceFixture({
      chatbot: { configured: false, enabled: false, health: 'unknown', provider: null },
    });
    expect(isWhatsAppChannelReady(snapshot)).toBe(true);
    expect(isVoiceChannelReady(snapshot)).toBe(true);
    expect(isChatbotChannelReady(snapshot)).toBe(false);
  });
});
