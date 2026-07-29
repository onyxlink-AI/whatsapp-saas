import { describe, expect, it } from 'vitest';
import { getWhatsAppOfficeActivationBlocker } from './whatsapp-office-activation';

describe('getWhatsAppOfficeActivationBlocker', () => {
  it('allows activation only with entitlement, selected profile and YCloud', () => {
    expect(getWhatsAppOfficeActivationBlocker({ productEnabled: true, selectedAgent: true, ycloudConfigured: true })).toBeNull();
  });

  it.each([
    [{ productEnabled: false, selectedAgent: true, ycloudConfigured: true }, 'producto Agente de WhatsApp'],
    [{ productEnabled: true, selectedAgent: false, ycloudConfigured: true }, 'configura y selecciona'],
    [{ productEnabled: true, selectedAgent: true, ycloudConfigured: false }, 'conecta YCloud'],
  ] as const)('blocks incomplete configuration %#', (input, expected) => {
    expect(getWhatsAppOfficeActivationBlocker(input)).toContain(expected);
  });
});
