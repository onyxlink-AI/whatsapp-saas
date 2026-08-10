import { createClient } from '@/lib/supabase/server';
import type { ContentItemPatch } from '@/features/content/services/content-actions';

/**
 * Pure/isolated mapping helpers used by the office-virtual chat route to
 * bridge the Creador de Contenido specialist's tag payload
 * (real-chat-service.ts's ContentDraftFields) onto the real, already-tested
 * content_items write path (content-actions.ts/content-tools.ts). Split out
 * from route.ts so they're directly unit-testable without dragging in the
 * route's unrelated Zoom/Google Calendar/OpenRouter wiring.
 */

/**
 * The model only ever sees a person's NAME, never a raw UUID — so it
 * physically cannot pass through a foreign/made-up membership id. A name
 * that doesn't match any ACTIVE member of THIS workspace simply fails to
 * resolve (returns null) — the caller then leaves the responsible field
 * untouched rather than ever writing an unverified value. This is the
 * "un responsable externo es rechazado" guarantee for the office-virtual
 * specialist flow.
 */
export type ResponsibleResolution =
  | { ok: true; userId: string }
  | { ok: false; code: 'responsible_not_found' | 'responsible_ambiguous' | 'database_error' };

export async function resolveResponsibleMemberId(workspaceId: string, name: string): Promise<ResponsibleResolution> {
  const trimmed = name.trim();
  if (!trimmed) return { ok: false, code: 'responsible_not_found' };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('memberships')
    .select('user_id, users(full_name)')
    .eq('workspace_id', workspaceId)
    .eq('is_active', true);
  if (error || !data) {
    console.error('[resolveResponsibleMemberId] Supabase error:', error?.message);
    return { ok: false, code: 'database_error' };
  }
  const target = trimmed.toLowerCase();
  const rows = data as unknown as { user_id: string; users: { full_name: string | null } | null }[];
  const matches = rows.filter((row) => (row.users?.full_name ?? '').trim().toLowerCase() === target);
  if (matches.length === 0) return { ok: false, code: 'responsible_not_found' };
  if (matches.length > 1) return { ok: false, code: 'responsible_ambiguous' };
  return { ok: true, userId: matches[0].user_id };
}

export type ContentTagFields = {
  content_type?: string;
  platform?: string;
  orientation?: 'vertical' | 'horizontal';
  duration_estimate?: string;
  scheduled_date?: string;
  script_hook?: string;
  script_body?: string;
  script_closing?: string;
  script_cta?: string;
  bullet_points?: string[];
  reference_links?: { label: string; url: string }[];
  lighting_notes?: string;
  music_notes?: string;
  notes?: string;
  title?: string;
  main_idea?: string;
  description?: string;
};

/** Only the keys the model actually sent — omitted keys stay untouched, never coerced to null/empty by this mapping. */
export function contentFieldsToPatch(fields: ContentTagFields): ContentItemPatch {
  const patch: ContentItemPatch = {};
  if (fields.title !== undefined && fields.title.trim()) patch.title = fields.title;
  if (fields.main_idea !== undefined) patch.main_idea = fields.main_idea;
  if (fields.description !== undefined) patch.description = fields.description;
  if (fields.content_type !== undefined) patch.content_type = fields.content_type;
  if (fields.platform !== undefined) patch.platform = fields.platform;
  if (fields.orientation !== undefined) patch.orientation = fields.orientation;
  if (fields.duration_estimate !== undefined) patch.duration_estimate = fields.duration_estimate;
  if (fields.scheduled_date !== undefined) patch.scheduled_date = fields.scheduled_date;
  if (fields.script_hook !== undefined) patch.script_hook = fields.script_hook;
  if (fields.script_body !== undefined) patch.script_body = fields.script_body;
  if (fields.script_closing !== undefined) patch.script_closing = fields.script_closing;
  if (fields.script_cta !== undefined) patch.script_cta = fields.script_cta;
  if (fields.bullet_points !== undefined) patch.bullet_points = fields.bullet_points;
  if (fields.reference_links !== undefined) patch.reference_links = fields.reference_links;
  if (fields.lighting_notes !== undefined) patch.lighting_notes = fields.lighting_notes;
  if (fields.music_notes !== undefined) patch.music_notes = fields.music_notes;
  if (fields.notes !== undefined) patch.notes = fields.notes;
  return patch;
}
