import { describe, expect, it } from 'vitest';
import { resolveWhatsAppRuntimeEnabled } from './whatsapp-runtime';

describe('resolveWhatsAppRuntimeEnabled', () => {
  it('requires both the contracted product and activation from Oficina Virtual', () => {
    expect(resolveWhatsAppRuntimeEnabled({ whatsapp_agent_enabled: true, office_whatsapp_enabled: true })).toBe(true);
    expect(resolveWhatsAppRuntimeEnabled({ whatsapp_agent_enabled: true, office_whatsapp_enabled: false })).toBe(false);
    expect(resolveWhatsAppRuntimeEnabled({ whatsapp_agent_enabled: false, office_whatsapp_enabled: true })).toBe(false);
    expect(resolveWhatsAppRuntimeEnabled(null)).toBe(false);
  });
});
