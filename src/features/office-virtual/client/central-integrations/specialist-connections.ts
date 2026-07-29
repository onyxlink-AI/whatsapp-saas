// Ported from the Agencia IA prototype (src/lib/specialistConnections.ts). A
// workspace has ONE CRM, ONE Gmail/Outlook, etc. — connections are a
// deduplicated global catalog, referenced by id from every specialist
// template that needs them (each with its own `purpose` text).
//
// Nothing here is wired to a real provider yet. `connectionStatuses` starts
// empty, which `resolveConnectionStatus` below reads as `not_configured` for
// every id — honest-by-default: no connection is ever shown as active
// without a real status behind it.
export const SPECIALIST_CONNECTION_STATUSES = ['not_configured', 'connected', 'degraded', 'error', 'unavailable'] as const;
export type SpecialistConnectionStatus = (typeof SPECIALIST_CONNECTION_STATUSES)[number];

export const SPECIALIST_CONNECTION_IDS = [
  'gmail-outlook',
  'crm',
  'catalogo-precios',
  'programa-presupuestos',
  'facturacion-erp',
  'drive',
  'sistema-contable',
  'banco',
  'hojas-calculo',
  'whatsapp',
  'helpdesk',
  'base-conocimiento',
  'calendario',
  'analitica-web',
  'plataformas-publicitarias',
  'redes-sociales',
  'gestor-tareas-proyectos',
  'inventario',
  'base-proveedores',
  'ats',
  'hris',
  'base-documental-interna',
  'herramienta-bi',
  'data-warehouse',
  'analitica',
  'administracion-google-microsoft',
  'siem',
  'gestion-endpoints',
  'inventario-tecnologico',
  'base-politicas',
  'herramientas-cumplimiento',
  'sistema-reservas-pms',
  'channel-manager',
  'portales-anuncios',
  'pasarela-pago',
  'financiera-scoring',
  'aseguradora-asistencia',
  'tpv-caja',
  'herramienta-reputacion',
] as const;
export type SpecialistConnectionId = (typeof SPECIALIST_CONNECTION_IDS)[number];

export const SPECIALIST_CONNECTION_CATALOG: Record<SpecialistConnectionId, { label: string }> = {
  'gmail-outlook': { label: 'Gmail u Outlook' },
  crm: { label: 'CRM' },
  'catalogo-precios': { label: 'Catálogo de productos y tarifas' },
  'programa-presupuestos': { label: 'Programa de presupuestos' },
  'facturacion-erp': { label: 'Facturación o ERP' },
  drive: { label: 'Drive u OneDrive' },
  'sistema-contable': { label: 'Sistema contable' },
  banco: { label: 'Banco o fuente financiera' },
  'hojas-calculo': { label: 'Hojas de cálculo' },
  whatsapp: { label: 'WhatsApp' },
  helpdesk: { label: 'Helpdesk' },
  'base-conocimiento': { label: 'Base de conocimiento' },
  calendario: { label: 'Calendario' },
  'analitica-web': { label: 'Analítica web' },
  'plataformas-publicitarias': { label: 'Plataformas publicitarias' },
  'redes-sociales': { label: 'Redes sociales' },
  'gestor-tareas-proyectos': { label: 'Gestor de tareas y proyectos' },
  inventario: { label: 'Inventario' },
  'base-proveedores': { label: 'Base de proveedores' },
  ats: { label: 'ATS' },
  hris: { label: 'HRIS' },
  'base-documental-interna': { label: 'Base documental interna' },
  'herramienta-bi': { label: 'Herramienta BI' },
  'data-warehouse': { label: 'Data warehouse' },
  analitica: { label: 'Analítica' },
  'administracion-google-microsoft': { label: 'Administración de Google o Microsoft' },
  siem: { label: 'SIEM o sistema de alertas' },
  'gestion-endpoints': { label: 'Gestión de endpoints' },
  'inventario-tecnologico': { label: 'Inventario tecnológico' },
  'base-politicas': { label: 'Drive o base de políticas' },
  'herramientas-cumplimiento': { label: 'Herramientas de cumplimiento' },
  'sistema-reservas-pms': { label: 'Sistema de reservas o PMS' },
  'channel-manager': { label: 'Channel manager (sincronización con OTAs)' },
  'portales-anuncios': { label: 'Portales de anuncios (Idealista, coches.net, etc.)' },
  'pasarela-pago': { label: 'Pasarela de pago' },
  'financiera-scoring': { label: 'Financiera o scoring de solvencia' },
  'aseguradora-asistencia': { label: 'Aseguradora o asistencia' },
  'tpv-caja': { label: 'TPV o caja' },
  'herramienta-reputacion': { label: 'Herramienta de reputación online' },
};

export type SpecialistConnectionStatusMap = Partial<Record<SpecialistConnectionId, SpecialistConnectionStatus>>;

/** Absent from the map means the connection was never configured — never inferred as connected. */
export function resolveConnectionStatus(id: SpecialistConnectionId, statuses: SpecialistConnectionStatusMap): SpecialistConnectionStatus {
  return statuses[id] ?? 'not_configured';
}

export type SpecialistTemplateConnectionRequirement = 'required' | 'recommended';

export type SpecialistTemplateConnection = {
  connectionId: SpecialistConnectionId;
  purpose: string;
  requirement: SpecialistTemplateConnectionRequirement;
  /** Capability ids (see specialist-templates.ts) this connection unlocks when connected. */
  unlocksCapabilityIds: string[];
};
