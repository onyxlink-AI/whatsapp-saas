/**
 * resolve.ts — resolvedor único de entitlements comerciales (Fase 2,
 * docs/CLAUDE-ARQUITECTURA-PAQUETES-NAVEGACION-IA-ASISTENTE.md §2/§3/§4).
 * Módulo isomórfico a propósito (sin "use server"/"use client", sin I/O):
 * lo consumen tanto Server Components/rutas API (gates de acceso) como
 * componentes de cliente (el diálogo de downgrade en Ajustes necesita
 * comparar PACKAGE_MATRIX en el navegador sin ida y vuelta al servidor).
 *
 * `workspaces.product_package` es la única fuente de verdad desde esta
 * fase — los booleanos individuales (gestion_enabled, whatsapp_agent_enabled,
 * office_virtual_enabled, whiteboard_enabled) se conservan en la tabla
 * porque otro código (team_chat_backfill_seat_limit(), RLS…) los sigue
 * leyendo directamente, pero SIEMPRE se escriben en conjunto desde
 * set_workspace_product_package() — nunca sueltos — así que derivarlos
 * aquí a partir del paquete es exactamente equivalente a leerlos de la
 * fila, sin una segunda consulta.
 *
 * chatbot_enabled queda deliberadamente fuera de este resolvedor: hoy no
 * es una capacidad comercial (solo la ve un superadmin, pase lo que pase
 * con el flag — ver src/features/chatbot/access.ts) — sigue siendo un
 * flag independiente, gestionado aparte.
 */

export type ProductPackage = "none" | "gestion" | "whatsapp_gestion" | "suite";

export const PRODUCT_PACKAGES: readonly ProductPackage[] = ["none", "gestion", "whatsapp_gestion", "suite"];

export interface PackageCapabilities {
  hasGestion: boolean;
  hasWhatsappAgent: boolean;
  hasOfficeVirtual: boolean;
  hasWhiteboard: boolean;
}

export interface WorkspaceEntitlements extends PackageCapabilities {
  package: ProductPackage;
  /** A dónde mandar a un usuario que no pidió una ruta concreta (sustituye la escalera vieja de getDefaultRouteForWorkspace). */
  defaultRoute: string;
}

// Matriz definitiva (§2.2, con las dos decisiones confirmadas por el
// usuario: chatbot_enabled fuera del sistema de paquetes, Board incluido
// automáticamente en los 3 paquetes no-"none").
export const PACKAGE_MATRIX: Record<ProductPackage, PackageCapabilities> = {
  none: { hasGestion: false, hasWhatsappAgent: false, hasOfficeVirtual: false, hasWhiteboard: false },
  gestion: { hasGestion: true, hasWhatsappAgent: false, hasOfficeVirtual: false, hasWhiteboard: true },
  whatsapp_gestion: { hasGestion: true, hasWhatsappAgent: true, hasOfficeVirtual: false, hasWhiteboard: true },
  suite: { hasGestion: true, hasWhatsappAgent: true, hasOfficeVirtual: true, hasWhiteboard: true },
};

export const PACKAGE_LABELS: Record<ProductPackage, string> = {
  none: "Sin paquete",
  gestion: "Gestión",
  whatsapp_gestion: "WhatsApp + Gestión",
  suite: "Suite",
};

function isProductPackage(value: string | null | undefined): value is ProductPackage {
  return value !== null && value !== undefined && (PRODUCT_PACKAGES as readonly string[]).includes(value);
}

function defaultRouteFor(pkg: ProductPackage): string {
  // Antes /inbox era el destino por defecto para cualquier workspace con
  // whatsapp_agent_enabled !== false (el propio flag por defecto en true) —
  // con el dashboard ya adaptado por paquete (§4.9: "Gestión entra en
  // /dashboard y recibe un panel completo"), /dashboard es el destino
  // correcto para los 3 paquetes comerciales; solo "sin paquete" no tiene
  // nada que mostrar ahí.
  if (pkg === "none") return "/settings";
  return "/dashboard";
}

/** Deriva el estado comercial completo de un workspace a partir de su product_package. */
export function resolveEntitlements(workspace: { product_package?: string | null } | null | undefined): WorkspaceEntitlements {
  const pkg: ProductPackage = isProductPackage(workspace?.product_package) ? workspace.product_package : "none";
  return {
    package: pkg,
    ...PACKAGE_MATRIX[pkg],
    defaultRoute: defaultRouteFor(pkg),
  };
}

// El asistente de gestión solo tiene herramientas de escritura reales en
// Paquete 2+ (WhatsApp + Gestión, o Suite) — mismo canWrite que hoy calcula
// action-tools/index.ts a partir de dos booleanos sueltos
// (gestionEnabled && whatsappAgentEnabled), ahora derivado del paquete.
// actionsEnabled sigue siendo el kill switch operativo de superadmin,
// independiente del paquene — un paquete comercial correcto nunca basta
// por sí solo si el superadmin lo ha desactivado.
export function canUseAssistantActions(actionsEnabled: boolean, entitlements: WorkspaceEntitlements): boolean {
  return actionsEnabled && entitlements.package !== "none" && entitlements.package !== "gestion";
}

/** Capacidades que se pierden al pasar de `from` a `to` — para el diálogo de confirmación de downgrade. */
export function lostCapabilities(from: ProductPackage, to: ProductPackage): string[] {
  const before = PACKAGE_MATRIX[from];
  const after = PACKAGE_MATRIX[to];
  const lost: string[] = [];
  if (before.hasGestion && !after.hasGestion) lost.push("Clientes, Proyectos, Agenda, Anotaciones y Contenido");
  if (before.hasWhatsappAgent && !after.hasWhatsappAgent) lost.push("Agente de WhatsApp y Conversaciones");
  if (before.hasOfficeVirtual && !after.hasOfficeVirtual) lost.push("Oficina Virtual");
  if (before.hasWhiteboard && !after.hasWhiteboard) lost.push("Board");
  return lost;
}
