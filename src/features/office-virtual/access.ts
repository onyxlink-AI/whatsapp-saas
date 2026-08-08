import { resolveEntitlements } from "@/features/entitlements/resolve";

// Single source of truth for Oficina Virtual access, shared by the nav link
// in (main)/layout.tsx and the route guard in (main)/oficina-virtual/page.tsx
// so the two checks can never drift apart — a workspace that doesn't pass
// this can neither see the link nor reach the route directly.
//
// Fase 2: deriva de product_package (resolveEntitlements), no de
// office_virtual_enabled directamente — el paquete es la única fuente de
// verdad desde ahora (docs/CLAUDE-ARQUITECTURA-PAQUETES-NAVEGACION-IA-ASISTENTE.md §2).
export function isOfficeVirtualEnabled(workspace: { product_package: string | null } | null | undefined): boolean {
  return resolveEntitlements(workspace).hasOfficeVirtual;
}
