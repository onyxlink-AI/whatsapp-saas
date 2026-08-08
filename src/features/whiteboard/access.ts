import { resolveEntitlements } from "@/features/entitlements/resolve";

// Single source of truth for Board access, shared by the nav link in
// (main)/layout.tsx and the route guards in (main)/pizarra/*/page.tsx so the
// two checks can never drift apart — a workspace that doesn't pass this can
// neither see the link nor reach the route directly.
//
// Fase 2: Board pasa a incluirse automáticamente en los 3 paquetes
// comerciales (none excluido) — deriva de product_package
// (resolveEntitlements), no de whiteboard_enabled directamente.
export function isWhiteboardEnabled(workspace: { product_package: string | null } | null | undefined): boolean {
  return resolveEntitlements(workspace).hasWhiteboard;
}
