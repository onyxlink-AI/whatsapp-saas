import { describe, expect, it, vi } from 'vitest';

// isSignupOpen() reads live DB state via the Supabase service-role client.
// If this page is ever statically prerenderable again, `next build` crashes
// whenever env vars aren't loaded at build time (e.g. a CI build without
// secrets, or this sandbox) — see src/features/auth/services/signup-gate.ts.
// This regression test only needs the module to import without constructing
// a real Supabase client, so env vars are irrelevant here.
vi.mock('@/features/auth/services/signup-gate', () => ({
  isSignupOpen: vi.fn(async () => true),
}));

describe('/signup page', () => {
  it('is never statically prerendered, since signup-open state is live and can flip at any time', async () => {
    const page = await import('./page');
    expect(page.dynamic).toBe('force-dynamic');
  });
});
