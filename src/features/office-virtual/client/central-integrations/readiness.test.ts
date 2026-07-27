import { describe, expect, it } from 'vitest';
import { isChatbotChannelReady, isVoiceChannelReady, isWhatsAppChannelReady } from './readiness';
import { createReadyWorkspaceFixture } from './fixtures';

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
