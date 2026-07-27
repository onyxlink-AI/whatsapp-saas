import type { OfficeApprovalPolicy, OfficeSpecialistAction } from './configuration';
import type { SpecialistConnectionId } from './specialist-connections';
import type { SpecialistCapability, SpecialistTemplateId } from './specialist-templates';

// Ported from the Agencia IA prototype (src/lib/specialistExtensions.ts) — the
// 8 optional add-ons. Extensions never occupy a seat: they install onto one
// or more of the 8 configurable specialists, adding capabilities without
// becoming a new "worker".
export const SPECIALIST_EXTENSION_IDS = [
  'agenda-reservas',
  'marketing-contenidos',
  'legal-documental',
  'compras-proveedores',
  'calidad-auditoria',
  'documentacion-conocimiento',
  'producto-servicios',
  'automatizacion-sistemas',
] as const;
export type SpecialistExtensionId = (typeof SPECIALIST_EXTENSION_IDS)[number];

export type SpecialistExtension = {
  id: SpecialistExtensionId;
  name: string;
  icon: string;
  summary: string;
  responsibilities: string[];
  capabilities: SpecialistCapability[];
  recommendedOwnerTemplateIds: SpecialistTemplateId[];
  connectionIds: SpecialistConnectionId[];
  allowedActions: OfficeSpecialistAction[];
  approvalPolicy: OfficeApprovalPolicy;
  safetyNotes: string[];
};

export const SPECIALIST_EXTENSIONS: SpecialistExtension[] = [
  {
    id: 'agenda-reservas',
    name: 'Agenda y reservas',
    icon: '📅',
    summary: 'Consulta disponibilidad y gestiona citas sin duplicar reservas ni prometer huecos que no existen.',
    responsibilities: [
      'Consultar disponibilidad real.',
      'Proponer huecos.',
      'Crear, cambiar y cancelar citas.',
      'Enviar datos de acceso o ubicación.',
      'Enviar recordatorios.',
      'Evitar dobles reservas.',
      'Actualizar el CRM o pipeline.',
      'Controlar la zona horaria.',
    ],
    capabilities: [
      { id: 'consultar-disponibilidad', label: 'Consultar disponibilidad', requiredConnectionIds: ['calendario'], sensitive: false },
      { id: 'crear-cita', label: 'Crear cita', requiredConnectionIds: ['calendario'], sensitive: true },
      { id: 'cambiar-cancelar-cita', label: 'Cambiar o cancelar cita', requiredConnectionIds: ['calendario'], sensitive: true },
      { id: 'enviar-recordatorio', label: 'Enviar recordatorio', requiredConnectionIds: ['whatsapp'], sensitive: false },
    ],
    recommendedOwnerTemplateIds: ['atencion-cliente-cs', 'gestor-de-empresa'],
    connectionIds: ['calendario', 'whatsapp'],
    allowedActions: ['read_memory', 'create_task', 'schedule_call'],
    approvalPolicy: 'sensitive_only',
    safetyNotes: ['No confirma una cita sin respuesta válida del calendario.', 'No crea citas sin los datos mínimos.', 'No muestra calendarios privados.'],
  },
  {
    id: 'marketing-contenidos',
    name: 'Marketing y contenidos',
    icon: '📣',
    summary: 'Prepara calendario y borradores de contenido; publicar siempre pasa por aprobación.',
    responsibilities: [
      'Preparar calendarios de contenido.',
      'Redactar campañas.',
      'Adaptar mensajes por canal.',
      'SEO básico.',
      'Analizar rendimiento.',
      'Coordinar piezas creativas.',
      'Mantener un banco de ideas.',
      'Detectar temas de interés.',
      'Preparar respuestas para redes.',
    ],
    capabilities: [
      { id: 'calendario-contenido', label: 'Calendario de contenido', requiredConnectionIds: ['redes-sociales'], sensitive: false },
      { id: 'redactar-campana', label: 'Redactar campaña', requiredConnectionIds: [], sensitive: false },
      { id: 'publicar-contenido', label: 'Publicar contenido', requiredConnectionIds: ['redes-sociales'], sensitive: true },
      { id: 'analizar-rendimiento', label: 'Analizar rendimiento', requiredConnectionIds: ['analitica-web'], sensitive: false },
    ],
    recommendedOwnerTemplateIds: ['comercial-growth'],
    connectionIds: ['redes-sociales', 'analitica-web'],
    allowedActions: ['draft_message', 'create_task'],
    approvalPolicy: 'sensitive_only',
    safetyNotes: ['No publica sin permiso.', 'No usa material sin derechos.', 'No cambia el tono o la marca sin aprobación.'],
  },
  {
    id: 'legal-documental',
    name: 'Legal documental',
    icon: '📄',
    summary: 'Clasifica y revisa documentos legales como borrador; nunca sustituye a un profesional.',
    responsibilities: [
      'Clasificar contratos.',
      'Extraer fechas y obligaciones.',
      'Detectar cláusulas de riesgo.',
      'Preparar borradores.',
      'Preparar listas para revisión.',
      'Controlar vencimientos.',
      'Mantener expedientes.',
      'Coordinar revisión profesional.',
      'Registro documental.',
    ],
    capabilities: [
      { id: 'clasificar-documento', label: 'Clasificar documento', requiredConnectionIds: ['drive'], sensitive: false },
      { id: 'detectar-riesgos', label: 'Detectar cláusulas de riesgo', requiredConnectionIds: ['drive'], sensitive: false },
      { id: 'preparar-borrador-legal', label: 'Preparar borrador', requiredConnectionIds: [], sensitive: true },
      { id: 'controlar-vencimientos', label: 'Controlar vencimientos', requiredConnectionIds: ['drive'], sensitive: false },
    ],
    recommendedOwnerTemplateIds: ['gestor-de-empresa'],
    connectionIds: ['drive'],
    allowedActions: ['read_memory', 'create_task', 'draft_message'],
    approvalPolicy: 'always',
    safetyNotes: ['No da asesoría legal definitiva.', 'No firma documentos.', 'No acepta condiciones en nombre del cliente.', 'No sustituye la revisión de un profesional.'],
  },
  {
    id: 'compras-proveedores',
    name: 'Compras y proveedores',
    icon: '📦',
    summary: 'Compara ofertas y prepara solicitudes de compra; nunca aprueba ni paga.',
    responsibilities: [
      'Recoger necesidades de compra.',
      'Pedir ofertas.',
      'Comparar proveedores.',
      'Revisar plazos.',
      'Preparar solicitudes.',
      'Seguimiento de pedidos.',
      'Registrar incidencias.',
      'Controlar renovaciones.',
      'Mantener fichas de proveedor.',
      'Coordinar con Administrativo-Financiero.',
    ],
    capabilities: [
      { id: 'comparar-ofertas', label: 'Comparar ofertas', requiredConnectionIds: ['base-proveedores'], sensitive: false },
      { id: 'preparar-solicitud-compra', label: 'Preparar solicitud de compra', requiredConnectionIds: ['base-proveedores'], sensitive: true },
      { id: 'seguimiento-pedido', label: 'Seguimiento de pedido', requiredConnectionIds: ['base-proveedores'], sensitive: false },
      { id: 'controlar-renovaciones', label: 'Controlar renovaciones', requiredConnectionIds: [], sensitive: false },
    ],
    recommendedOwnerTemplateIds: ['operaciones-proyectos', 'administrativo-financiero'],
    connectionIds: ['base-proveedores'],
    allowedActions: ['read_memory', 'create_task'],
    approvalPolicy: 'always',
    safetyNotes: ['No aprueba compras.', 'No realiza pagos.', 'No acepta contratos.', 'No elige proveedor sin criterios aprobados.'],
  },
  {
    id: 'calidad-auditoria',
    name: 'Calidad y auditoría',
    icon: '✅',
    summary: 'Revisa entregables y procedimientos, y registra hallazgos sin ocultar fallos.',
    responsibilities: [
      'Revisar entregables.',
      'Mantener listas de control.',
      'Detectar fallos.',
      'Verificar procedimientos.',
      'Auditorías internas.',
      'Registrar hallazgos.',
      'Proponer correcciones.',
      'Comprobar el cierre de acciones.',
      'Medir cumplimiento de servicio.',
    ],
    capabilities: [
      { id: 'revisar-entregable', label: 'Revisar entregable', requiredConnectionIds: [], sensitive: false },
      { id: 'auditoria-interna', label: 'Auditoría interna', requiredConnectionIds: ['drive'], sensitive: false },
      { id: 'registrar-hallazgo', label: 'Registrar hallazgo', requiredConnectionIds: [], sensitive: false },
    ],
    recommendedOwnerTemplateIds: ['operaciones-proyectos'],
    connectionIds: ['drive'],
    allowedActions: ['read_memory', 'create_task'],
    approvalPolicy: 'sensitive_only',
    safetyNotes: ['No oculta fallos detectados.', 'No cambia evidencias.', 'No aprueba su propio trabajo cuando hay conflicto de interés.'],
  },
  {
    id: 'documentacion-conocimiento',
    name: 'Documentación y conocimiento',
    icon: '📚',
    summary: 'Mantiene manuales y FAQ al día, y detecta contenido obsoleto.',
    responsibilities: [
      'Mantener manuales y FAQ.',
      'Ordenar documentos.',
      'Detectar contenido obsoleto.',
      'Documentar procedimientos.',
      'Registrar decisiones.',
      'Preparar guías internas.',
      'Convertir conversaciones aprobadas en conocimiento.',
      'Mantener versiones.',
    ],
    capabilities: [
      { id: 'mantener-base-conocimiento', label: 'Mantener base de conocimiento', requiredConnectionIds: ['base-conocimiento'], sensitive: false },
      { id: 'detectar-contenido-obsoleto', label: 'Detectar contenido obsoleto', requiredConnectionIds: ['base-conocimiento'], sensitive: false },
      { id: 'documentar-procedimiento', label: 'Documentar procedimiento', requiredConnectionIds: ['drive'], sensitive: false },
    ],
    recommendedOwnerTemplateIds: ['personas-rrhh', 'operaciones-proyectos'],
    connectionIds: ['base-conocimiento', 'drive'],
    allowedActions: ['read_memory', 'create_task'],
    approvalPolicy: 'sensitive_only',
    safetyNotes: ['No guarda secretos en texto abierto.', 'No publica documentos internos fuera de su alcance.', 'No elimina versiones sin permiso.'],
  },
  {
    id: 'producto-servicios',
    name: 'Producto y servicios',
    icon: '🧩',
    summary: 'Recoge feedback y prioriza mejoras con criterios aprobados; nunca promete fechas ni cambia precios.',
    responsibilities: [
      'Recoger comentarios.',
      'Clasificar peticiones.',
      'Analizar uso.',
      'Priorizar propuestas con criterios aprobados.',
      'Mantener fichas de servicio.',
      'Documentar requisitos.',
      'Coordinar pruebas.',
      'Controlar cambios.',
      'Preparar notas de versión.',
      'Detectar problemas repetidos.',
    ],
    capabilities: [
      { id: 'recoger-feedback', label: 'Recoger feedback', requiredConnectionIds: ['crm'], sensitive: false },
      { id: 'priorizar-propuesta', label: 'Priorizar propuesta', requiredConnectionIds: [], sensitive: false },
      { id: 'ficha-servicio', label: 'Mantener ficha de servicio', requiredConnectionIds: [], sensitive: false },
    ],
    recommendedOwnerTemplateIds: ['comercial-growth', 'atencion-cliente-cs'],
    connectionIds: ['crm'],
    allowedActions: ['read_contacts', 'read_memory', 'create_task'],
    approvalPolicy: 'sensitive_only',
    safetyNotes: ['No promete fechas de entrega.', 'No cambia precios.', 'No publica cambios sin aprobación.'],
  },
  {
    id: 'automatizacion-sistemas',
    name: 'Automatización y sistemas',
    icon: '⚙️',
    summary: 'Diseña flujos y vigila ejecuciones; cambios en producción o credenciales siempre requieren aprobación.',
    responsibilities: [
      'Diseñar flujos.',
      'Conectar herramientas.',
      'Crear automatizaciones.',
      'Vigilar ejecuciones.',
      'Gestionar errores.',
      'Preparar documentación técnica.',
      'Realizar pruebas.',
      'Control de versiones.',
      'Proponer mejoras técnicas.',
      'Coordinar revisión de seguridad.',
    ],
    capabilities: [
      { id: 'disenar-flujo', label: 'Diseñar flujo', requiredConnectionIds: [], sensitive: false },
      { id: 'vigilar-ejecuciones', label: 'Vigilar ejecuciones', requiredConnectionIds: ['siem'], sensitive: false },
      { id: 'crear-automatizacion', label: 'Crear automatización', requiredConnectionIds: ['administracion-google-microsoft'], sensitive: true },
    ],
    recommendedOwnerTemplateIds: ['ciberseguridad-cumplimiento'],
    connectionIds: ['siem', 'administracion-google-microsoft'],
    allowedActions: ['read_memory', 'create_task'],
    approvalPolicy: 'always',
    safetyNotes: ['No usa credenciales sin control.', 'No cambia producción sin permiso.', 'No desactiva controles de seguridad.', 'No guarda secretos en el código.'],
  },
];

export function findSpecialistExtension(id: SpecialistExtensionId): SpecialistExtension | undefined {
  return SPECIALIST_EXTENSIONS.find((extension) => extension.id === id);
}
