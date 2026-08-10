// resolveResponsibleMemberId is the ONLY path through which the Creador de
// Contenido specialist can attach a responsible person — it only ever
// receives a NAME (never a raw membership id) from the model, and only
// resolves it against ACTIVE members of the SAME workspace. This is what
// makes "un responsable externo es rechazado" true by construction: there's
// no field the model could fill with a foreign UUID even if it tried.

import { describe, expect, it, vi, beforeEach } from 'vitest';

const maybeSingle = vi.fn();
let membershipRows: { data: unknown; error: { message: string } | null } = { data: [], error: null };

const sessionClient = {
  from: (table: string) => {
    if (table !== 'memberships') throw new Error(`unexpected table ${table}`);
    return {
      select: () => ({
        eq: () => ({
          eq: () => Promise.resolve(membershipRows),
        }),
      }),
    };
  },
};
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => sessionClient }));

const { resolveResponsibleMemberId, contentFieldsToPatch } = await import('./office-content-mapping');

beforeEach(() => {
  vi.clearAllMocks();
  membershipRows = { data: [], error: null };
});

describe('resolveResponsibleMemberId', () => {
  it('resolves a name that matches an active member of the workspace, case-insensitively', async () => {
    membershipRows = {
      data: [{ user_id: 'user-1', users: { full_name: 'Ana López' } }],
      error: null,
    };
    const result = await resolveResponsibleMemberId('workspace-a', 'ana lópez');
    expect(result).toEqual({ ok: true, userId: 'user-1' });
  });

  it('rejects (returns null) a name with no match in this workspace — never guesses or picks the closest one', async () => {
    membershipRows = {
      data: [{ user_id: 'user-1', users: { full_name: 'Ana López' } }],
      error: null,
    };
    const result = await resolveResponsibleMemberId('workspace-a', 'Nombre Externo Inventado');
    expect(result).toEqual({ ok: false, code: 'responsible_not_found' });
  });

  it('never resolves across workspaces — a name that matches a member of a DIFFERENT workspace is invisible here (query itself is workspace-scoped)', async () => {
    // membershipRows simulates the query already filtered to workspace-a —
    // a member of workspace-b never appears in this result set at all.
    membershipRows = { data: [], error: null };
    const result = await resolveResponsibleMemberId('workspace-a', 'Miembro De Otra Empresa');
    expect(result).toEqual({ ok: false, code: 'responsible_not_found' });
  });

  it('distinguishes a DB error from a missing responsible', async () => {
    membershipRows = { data: null, error: { message: 'connection reset' } };
    const result = await resolveResponsibleMemberId('workspace-a', 'Ana López');
    expect(result).toEqual({ ok: false, code: 'database_error' });
  });

  it('rejects a blank/whitespace-only name without inventing an assignment', async () => {
    const result = await resolveResponsibleMemberId('workspace-a', '   ');
    expect(result).toEqual({ ok: false, code: 'responsible_not_found' });
  });

  it('rejects an ambiguous name instead of choosing one member arbitrarily', async () => {
    membershipRows = {
      data: [
        { user_id: 'user-1', users: { full_name: 'Ana López' } },
        { user_id: 'user-2', users: { full_name: 'Ana López' } },
      ],
      error: null,
    };
    const result = await resolveResponsibleMemberId('workspace-a', 'Ana López');
    expect(result).toEqual({ ok: false, code: 'responsible_ambiguous' });
  });
});

describe('contentFieldsToPatch', () => {
  it('includes only the keys actually present in the input — omitted keys never appear in the patch', () => {
    const patch = contentFieldsToPatch({ script_hook: 'Hook nuevo' });
    expect(patch).toEqual({ script_hook: 'Hook nuevo' });
  });

  it('drops a blank/whitespace-only title instead of ever writing an empty title', () => {
    const patch = contentFieldsToPatch({ title: '   ' });
    expect(patch.title).toBeUndefined();
  });

  it('maps every documented content field 1:1, with no translation-layer typos', () => {
    const patch = contentFieldsToPatch({
      title: 'T', main_idea: 'M', description: 'D', content_type: 'Reel', platform: 'Instagram',
      orientation: 'vertical', duration_estimate: '30s', scheduled_date: '2026-08-20',
      script_hook: 'H', script_body: 'B', script_closing: 'C', script_cta: 'CTA',
      bullet_points: ['a', 'b'], reference_links: [{ label: 'L', url: 'https://x.com' }],
      lighting_notes: 'Luz', music_notes: 'Música', notes: 'Notas',
    });
    expect(patch).toEqual({
      title: 'T', main_idea: 'M', description: 'D', content_type: 'Reel', platform: 'Instagram',
      orientation: 'vertical', duration_estimate: '30s', scheduled_date: '2026-08-20',
      script_hook: 'H', script_body: 'B', script_closing: 'C', script_cta: 'CTA',
      bullet_points: ['a', 'b'], reference_links: [{ label: 'L', url: 'https://x.com' }],
      lighting_notes: 'Luz', music_notes: 'Música', notes: 'Notas',
    });
  });

  it('returns an empty patch for an empty input, never a patch with stray null-filled keys', () => {
    expect(contentFieldsToPatch({})).toEqual({});
  });
});
