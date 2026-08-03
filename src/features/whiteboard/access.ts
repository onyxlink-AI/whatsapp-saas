// Single source of truth for the whiteboard_enabled gate, shared by the nav
// link in (main)/layout.tsx and the route guards in (main)/pizarra/*/page.tsx
// so the two checks can never drift apart — a workspace that doesn't pass
// this can neither see the link nor reach the route directly.
export function isWhiteboardEnabled(
  workspace: { whiteboard_enabled: boolean | null } | null | undefined,
): boolean {
  return workspace?.whiteboard_enabled === true;
}
