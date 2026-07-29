// Single source of truth for the office_virtual_enabled gate, shared by the
// nav link in (main)/layout.tsx and the route guard in
// (main)/oficina-virtual/page.tsx so the two checks can never drift apart —
// a workspace that doesn't pass this can neither see the link nor reach the
// route directly.
export function isOfficeVirtualEnabled(workspace: { office_virtual_enabled: boolean | null } | null | undefined): boolean {
  return workspace?.office_virtual_enabled === true;
}
