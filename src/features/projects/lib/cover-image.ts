/**
 * `project-covers` is a public Storage bucket (see
 * 20260806000000_projects_phase2.sql) — its object URLs are deterministic
 * from the path, so no signed-URL round trip or Supabase client instance is
 * needed to render one.
 */
export function getProjectCoverUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!base) return null;
  return `${base}/storage/v1/object/public/project-covers/${path}`;
}
