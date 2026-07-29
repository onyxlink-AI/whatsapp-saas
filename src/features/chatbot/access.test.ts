import { describe, expect, it } from 'vitest';
import { canSeeChatbotNav, isChatbotEnabled } from './access';

describe('isChatbotEnabled', () => {
  it('is false for null/undefined/false and true only when the flag is exactly true', () => {
    expect(isChatbotEnabled(null)).toBe(false);
    expect(isChatbotEnabled(undefined)).toBe(false);
    expect(isChatbotEnabled({ chatbot_enabled: null })).toBe(false);
    expect(isChatbotEnabled({ chatbot_enabled: false })).toBe(false);
    expect(isChatbotEnabled({ chatbot_enabled: true })).toBe(true);
  });
});

describe('canSeeChatbotNav — the Chatbot is not client self-service', () => {
  it('hides the nav link from a non-superadmin even when the plan flag is on', () => {
    expect(canSeeChatbotNav(false, { chatbot_enabled: true })).toBe(false);
  });

  it('hides the nav link from a superadmin when the plan flag is off', () => {
    expect(canSeeChatbotNav(true, { chatbot_enabled: false })).toBe(false);
  });

  it('shows the nav link only for a superadmin on a workspace with the plan flag on', () => {
    expect(canSeeChatbotNav(true, { chatbot_enabled: true })).toBe(true);
  });
});
