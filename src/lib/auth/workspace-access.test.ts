import { describe, expect, it, vi } from 'vitest';

// Regression test for a real bug found during local end-to-end validation of
// the Oficina Virtual Configurador: routes that call requireSuperAdmin() and
// then build an `{ actorId: auth.userId, ... }` actor object were storing the
// caller's raw UUID in DB columns named `updated_by_email` / `actor_email`
// (TEXT columns meant to hold a human-readable email, per the established
// `actorId: userEmail` convention used everywhere else in the office-virtual
// feature — see src/features/office-virtual/client/OfficeVirtualApp.tsx).
// requireSuperAdmin() only returned `{ ok, userId }`, so the only value routes
// had on hand to plug into `actorId` was the UUID. The fix makes
// requireSuperAdmin() also return the user's real email.

const getUser = vi.fn();
const maybeSingle = vi.fn();

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser },
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle }),
      }),
    }),
  })),
}));

const { requireSuperAdmin } = await import('./workspace-access');

describe('requireSuperAdmin', () => {
  it('returns the caller real email, not their user id, for use as an audit actor identity', async () => {
    getUser.mockResolvedValue({
      data: { user: { id: '04aca791-4a84-4e8d-b2cd-e29a6aed600e', email: 'superadmin@onyxlink.local' } },
    });
    maybeSingle.mockResolvedValue({ data: { is_super_admin: true } });

    const result = await requireSuperAdmin();

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(result.userId).toBe('04aca791-4a84-4e8d-b2cd-e29a6aed600e');
    expect(result.email).toBe('superadmin@onyxlink.local');
    expect(result.email).not.toBe(result.userId);
  });
});
