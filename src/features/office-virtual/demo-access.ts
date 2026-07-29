export const OFFICE_DEMO_ACCOUNT_EMAIL = 'demo@onyxlinkpanel.com';

/**
 * The showroom is an explicit product account, never a query-string or
 * client-controlled toggle. API permissions remain unchanged: this flag only
 * enables isolated in-memory presentation data for the authenticated demo user.
 */
export function isOfficeDemoAccount(email: string | null | undefined): boolean {
  return email?.trim().toLocaleLowerCase('en-US') === OFFICE_DEMO_ACCOUNT_EMAIL;
}
