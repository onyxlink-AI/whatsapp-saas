import { describe, expect, it } from 'vitest';
import {
  GENERIC_TO_REAL_INTEGRATION,
  REAL_INTEGRATION_IDS,
  isRealIntegrationConnected,
  resolveRequiredRealIntegrations,
} from './real-integrations';
import { SPECIALIST_CONNECTION_IDS } from './specialist-connections';

describe('GENERIC_TO_REAL_INTEGRATION — the only bridge to the 38-entry generic catalog', () => {
  it('maps exactly 4 of the 38 generic connections, never more', () => {
    const mappedIds = Object.keys(GENERIC_TO_REAL_INTEGRATION);
    expect(mappedIds.sort()).toEqual(['calendario', 'crm', 'hojas-calculo', 'whatsapp'].sort());
  });

  it('every mapped value is one of the 5 real integrations', () => {
    for (const value of Object.values(GENERIC_TO_REAL_INTEGRATION)) {
      expect(REAL_INTEGRATION_IDS).toContain(value);
    }
  });

  it('the other 34 generic connection ids are deliberately unmapped', () => {
    const unmapped = SPECIALIST_CONNECTION_IDS.filter((id) => !(id in GENERIC_TO_REAL_INTEGRATION));
    expect(unmapped).toHaveLength(SPECIALIST_CONNECTION_IDS.length - 4);
    expect(unmapped).not.toContain('whatsapp');
    expect(unmapped).toContain('gmail-outlook');
    expect(unmapped).toContain('siem');
  });
});

describe('resolveRequiredRealIntegrations', () => {
  it('a capability with no connections needs nothing', () => {
    expect(resolveRequiredRealIntegrations([])).toEqual({ integrations: [], unsupported: false });
  });

  it('a capability needing only mapped connections resolves to real integrations, never unsupported', () => {
    expect(resolveRequiredRealIntegrations(['crm', 'calendario'])).toEqual({
      integrations: expect.arrayContaining(['highlevel', 'google_calendar']),
      unsupported: false,
    });
  });

  it('a capability needing even one unmapped connection is unsupported, regardless of the others', () => {
    const result = resolveRequiredRealIntegrations(['calendario', 'ats']);
    expect(result.unsupported).toBe(true);
  });

  it('deduplicates when two generic ids map to the same real integration id (not possible today, but the contract holds)', () => {
    const result = resolveRequiredRealIntegrations(['whatsapp']);
    expect(result.integrations).toEqual(['ycloud']);
  });
});

describe('isRealIntegrationConnected', () => {
  it('is false for an integration absent from the map (never seen)', () => {
    expect(isRealIntegrationConnected('airtable', {})).toBe(false);
  });

  it('is false for a saved-but-disabled integration', () => {
    expect(isRealIntegrationConnected('airtable', { airtable: false })).toBe(false);
  });

  it('is true only when explicitly true', () => {
    expect(isRealIntegrationConnected('airtable', { airtable: true })).toBe(true);
  });
});
