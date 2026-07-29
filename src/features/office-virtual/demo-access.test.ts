import { describe, expect, it } from 'vitest';
import { isOfficeDemoAccount, OFFICE_DEMO_ACCOUNT_EMAIL } from './demo-access';

describe('office demo access', () => {
  it('only enables the explicit authenticated presentation account', () => {
    expect(isOfficeDemoAccount(OFFICE_DEMO_ACCOUNT_EMAIL)).toBe(true);
    expect(isOfficeDemoAccount(' Demo@OnyxLinkPanel.com ')).toBe(true);
    expect(isOfficeDemoAccount('cliente@empresa.com')).toBe(false);
    expect(isOfficeDemoAccount(null)).toBe(false);
  });
});
