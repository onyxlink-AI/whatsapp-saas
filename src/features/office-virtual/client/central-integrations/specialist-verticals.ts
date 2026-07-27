import type { SpecialistTemplateConnection } from './specialist-connections';
import type { SpecialistExtensionId } from './specialist-extensions';
import type { SpecialistSkillId } from './specialist-skills';
import type { SpecialistTemplateId } from './specialist-templates';

// Ported from the Agencia IA prototype (src/lib/specialistVerticals.ts) — the
// 9 sector configurations. A sector adapts the 8 base templates (vocabulary,
// prompt overlay, typical connections, approvals, KPIs, onboarding) — it
// never adds a 9th worker. Mirrors the BASE < SECTOR < CLIENTE precedence:
// applying a sector only proposes template installs into empty seats and
// exposes a read-only prompt overlay per seat — it never edits or deletes
// the client's own free-text layer (see vertical-application-plan.ts /
// specialist-prompt-layers.ts).
export const VERTICAL_IDS = [
  'alquiler-barcos',
  'inmobiliaria',
  'compraventa-coches',
  'renting-coches',
  'hoteles',
  'camping',
  'clinica-dental',
  'clinica-estetica',
  'barberia',
] as const;
export type VerticalId = (typeof VERTICAL_IDS)[number];

export type VerticalPromptOverlay = {
  templateId: SpecialistTemplateId;
  instructions: string;
  responsibilities?: string[];
  safetyNotes?: string[];
};

export type VerticalOnboardingField = {
  id: string;
  label: string;
  description?: string;
  type: 'text' | 'textarea' | 'number' | 'boolean' | 'select' | 'multiselect';
  required: boolean;
  options?: string[];
  sensitive?: boolean;
};

export type OfficeVertical = {
  id: VerticalId;
  name: string;
  sector: string;
  icon: string;
  summary: string;
  customerType: string;
  recommendedTemplateIds: SpecialistTemplateId[];
  optionalTemplateIds: SpecialistTemplateId[];
  extensionIds: SpecialistExtensionId[];
  recommendedSkillIds: SpecialistSkillId[];
  recommendedChannels: Array<{ channel: 'whatsapp' | 'voice' | 'chatbot'; purpose: string }>;
  vocabulary: Array<{ term: string; meaning: string }>;
  promptOverlays: VerticalPromptOverlay[];
  connections: SpecialistTemplateConnection[];
  approvalRules: string[];
  kpis: string[];
  onboardingFields: VerticalOnboardingField[];
  handlesSensitiveData: boolean;
  safetyNotes: string[];
};

export const SPECIALIST_VERTICALS: OfficeVertical[] = [
  {
    id: 'alquiler-barcos',
    name: 'Alquiler de Barcos',
    sector: 'Náutica de recreo',
    icon: '⛵',
    summary: 'Chárter con o sin patrón, flota propia, temporada alta marcada y fianzas por embarcación.',
    customerType: 'Empresa de chárter náutico con flota propia',
    recommendedTemplateIds: ['gestor-de-empresa', 'administrativo-financiero', 'comercial-growth', 'atencion-cliente-cs', 'operaciones-proyectos'],
    optionalTemplateIds: ['datos-bi', 'ciberseguridad-cumplimiento'],
    extensionIds: ['agenda-reservas', 'legal-documental'],
    recommendedSkillIds: ['redaccion', 'analisis-documental'],
    recommendedChannels: [
      { channel: 'whatsapp', purpose: 'Reservas y atención principal.' },
      { channel: 'chatbot', purpose: 'FAQ de precios, titulación e incluido en el alquiler.' },
      { channel: 'voice', purpose: 'Disponibilidad en temporada alta.' },
    ],
    vocabulary: [
      { term: 'Chárter', meaning: 'Alquiler de embarcación, con o sin patrón.' },
      { term: 'Titulación', meaning: 'PNB/PER/licencia de navegación exigida para ir sin patrón.' },
      { term: 'Fianza', meaning: 'Depósito bloqueado que se devuelve tras el check-out si no hay daños.' },
      { term: 'Check-in/out', meaning: 'Inventario y revisión de la embarcación al entregarla y devolverla.' },
      { term: 'Temporada alta/media/baja', meaning: 'Determina la tarifa y la estancia mínima.' },
      { term: 'Amarre', meaning: 'Puerto base de la embarcación.' },
    ],
    promptOverlays: [
      {
        templateId: 'gestor-de-empresa',
        instructions: 'Verifica siempre fechas, embarcación, número de personas y titulación (si es sin patrón) antes de presupuestar. El presupuesto indica qué incluye y el importe de la fianza. Nunca confirmes una reserva sin disponibilidad verificada en el sistema de reservas de flota.',
        responsibilities: ['Preparar presupuestos por temporada con fianza incluida.', 'Coordinar el check-out y la gestión de la fianza.'],
      },
      {
        templateId: 'atencion-cliente-cs',
        instructions: 'Explica la política de cambios por mal tiempo sin prometer devoluciones que no estén contempladas. Cualquier incidencia en el mar con riesgo para las personas es prioridad máxima: escala de inmediato a un humano.',
        safetyNotes: ['Incidentes en el mar con riesgo para personas se escalan de inmediato, sin excepción.'],
      },
    ],
    connections: [
      { connectionId: 'sistema-reservas-pms', purpose: 'Necesario para consultar y bloquear disponibilidad de la flota.', requirement: 'required', unlocksCapabilityIds: [] },
      { connectionId: 'whatsapp', purpose: 'Necesario para reservas y atención.', requirement: 'required', unlocksCapabilityIds: [] },
      { connectionId: 'facturacion-erp', purpose: 'Necesario para facturar alquileres y fianzas.', requirement: 'required', unlocksCapabilityIds: [] },
      { connectionId: 'crm', purpose: 'Recomendado para el seguimiento de clientes.', requirement: 'recommended', unlocksCapabilityIds: [] },
      { connectionId: 'pasarela-pago', purpose: 'Recomendado para cobrar fianzas y señales.', requirement: 'recommended', unlocksCapabilityIds: [] },
    ],
    approvalRules: ['Confirmar una reserva con cobro.', 'Devolver o retener una fianza.', 'Aplicar descuentos fuera de tarifa.', 'Cancelaciones con devolución.'],
    kpis: ['Ocupación de flota por temporada', 'Reservas confirmadas vs. solicitudes', 'Ingresos por embarcación', 'Incidencias de fianza', 'Clientes repetidores'],
    onboardingFields: [
      { id: 'flota', label: 'Flota (embarcaciones, capacidad, con/sin patrón, puerto base)', type: 'textarea', required: true },
      { id: 'tarifas-temporada', label: 'Tarifas por temporada y qué incluyen', type: 'textarea', required: true },
      { id: 'importe-fianza', label: 'Importe de fianza por embarcación', type: 'text', required: true },
      { id: 'politica-cancelacion', label: 'Política de cancelación y meteorología', type: 'textarea', required: true },
      { id: 'titulaciones', label: 'Titulaciones exigidas', type: 'text', required: false },
      { id: 'horarios-checkinout', label: 'Horarios de check-in y check-out', type: 'text', required: true },
    ],
    handlesSensitiveData: false,
    safetyNotes: ['Un incidente en el mar con riesgo para las personas siempre se escala de inmediato a un humano.'],
  },
  {
    id: 'barberia',
    name: 'Barbería',
    sector: 'Barbería y peluquería masculina',
    icon: '💈',
    summary: 'Varios barberos, cita previa y walk-ins, servicios con duración propia y clientela fiel.',
    customerType: 'Barbería con uno o varios barberos',
    recommendedTemplateIds: ['atencion-cliente-cs', 'comercial-growth', 'administrativo-financiero'],
    optionalTemplateIds: ['gestor-de-empresa', 'datos-bi', 'personas-rrhh'],
    extensionIds: ['agenda-reservas', 'marketing-contenidos'],
    recommendedSkillIds: ['redaccion'],
    recommendedChannels: [
      { channel: 'whatsapp', purpose: 'Citas, recordatorios y lista de espera.' },
      { channel: 'chatbot', purpose: 'FAQ de precios, horarios y servicios.' },
      { channel: 'voice', purpose: 'Citas telefónicas (opcional).' },
    ],
    vocabulary: [
      { term: 'Walk-in', meaning: 'Cliente sin cita que espera un hueco libre.' },
      { term: 'Servicio', meaning: 'Corte, barba, afeitado o tratamiento, cada uno con su duración y precio.' },
      { term: 'Barbero preferido', meaning: 'Barbero que el cliente suele elegir.' },
      { term: 'Bono', meaning: 'Pack de N servicios prepagados.' },
      { term: 'No-show', meaning: 'Cliente que no se presenta a su cita.' },
      { term: 'Lista de espera', meaning: 'Aviso automático si se libera un hueco el mismo día.' },
    ],
    promptOverlays: [
      {
        templateId: 'atencion-cliente-cs',
        instructions: 'Pregunta siempre servicio, barbero preferido y franja horaria. Respeta la duración de cada servicio: no encajes corte+barba en un hueco pensado solo para corte. Envía recordatorio 24h antes y avisa si hay retraso. Si no hay hueco, ofrece la lista de espera.',
        responsibilities: ['Gestionar la lista de espera y avisar al primero en cuanto se libera un hueco.'],
      },
      {
        templateId: 'comercial-growth',
        instructions: 'Detecta clientes que llevan más semanas de las habituales sin venir (según su frecuencia histórica) y usa solo la plantilla de reactivación aprobada. Bonos y promociones nuevas requieren aprobación antes de ofrecerse.',
      },
    ],
    connections: [
      { connectionId: 'sistema-reservas-pms', purpose: 'Necesario para la agenda por barbero.', requirement: 'required', unlocksCapabilityIds: [] },
      { connectionId: 'whatsapp', purpose: 'Necesario para citas y recordatorios.', requirement: 'required', unlocksCapabilityIds: [] },
      { connectionId: 'tpv-caja', purpose: 'Recomendado para el control de caja e ingresos por barbero.', requirement: 'recommended', unlocksCapabilityIds: [] },
      { connectionId: 'redes-sociales', purpose: 'Recomendado para promociones.', requirement: 'recommended', unlocksCapabilityIds: [] },
    ],
    approvalRules: ['Nuevas promociones o bonos.', 'Publicaciones en redes.', 'Cambios de precio de servicios.', 'Aplicar penalización por no-show.'],
    kpis: ['Ocupación por barbero', 'Citas vs. walk-ins', 'No-shows y recuperación por lista de espera', 'Frecuencia media de visita', 'Clientes reactivados y bonos vendidos'],
    onboardingFields: [
      { id: 'barberos-horarios', label: 'Barberos y horario de cada uno', type: 'textarea', required: true },
      { id: 'servicios', label: 'Servicios con duración y precio', type: 'textarea', required: true },
      { id: 'politica-no-show', label: 'Política de no-show y walk-ins', type: 'textarea', required: true },
      { id: 'bonos-vigentes', label: 'Bonos y promociones vigentes', type: 'textarea', required: false },
      { id: 'frecuencia-reactivacion', label: 'Frecuencia objetivo para reactivar clientes', type: 'text', required: false },
      { id: 'tono', label: 'Tono de comunicación preferido', type: 'select', required: false, options: ['Cercano', 'Formal', 'Directo'] },
    ],
    handlesSensitiveData: false,
    safetyNotes: [],
  },
  {
    id: 'camping',
    name: 'Camping',
    sector: 'Alojamiento al aire libre',
    icon: '🏕️',
    summary: 'Parcelas y bungalows, temporada marcada, contratos de temporada anual y clientela familiar repetidora.',
    customerType: 'Camping con parcelas y bungalows',
    recommendedTemplateIds: ['gestor-de-empresa', 'administrativo-financiero', 'comercial-growth', 'atencion-cliente-cs', 'operaciones-proyectos'],
    optionalTemplateIds: ['datos-bi', 'personas-rrhh'],
    extensionIds: ['agenda-reservas', 'marketing-contenidos'],
    recommendedSkillIds: ['redaccion'],
    recommendedChannels: [
      { channel: 'whatsapp', purpose: 'Reservas y atención.' },
      { channel: 'chatbot', purpose: 'FAQ de precios, mascotas, horarios y servicios.' },
      { channel: 'voice', purpose: 'Reservas telefónicas en temporada alta.' },
    ],
    vocabulary: [
      { term: 'Parcela', meaning: 'Espacio para tienda, caravana o autocaravana, puede tener luz y agua.' },
      { term: 'Bungalow / mobil-home', meaning: 'Alojamiento fijo equipado.' },
      { term: 'Temporada (parcela anual)', meaning: 'Contrato de larga duración con cuota periódica.' },
      { term: 'Ocupantes', meaning: 'Personas por unidad, incluidos niños — cambia la tarifa.' },
      { term: 'Suplementos', meaning: 'Coche extra, mascota, visitas, electricidad.' },
      { term: 'Normas del camping', meaning: 'Horarios de silencio, visitas y mascotas.' },
    ],
    promptOverlays: [
      {
        templateId: 'atencion-cliente-cs',
        instructions: 'Para reservar necesitas fechas, tipo de alojamiento, adultos y niños (con edades) y si hay mascota o vehículo extra. Aplica tarifas por ocupante más suplementos. Comunica las normas relevantes al confirmar. Los titulares de parcela anual tienen prioridad si el workspace lo tiene configurado así.',
      },
      {
        templateId: 'gestor-de-empresa',
        instructions: 'Los contratos de parcela de temporada tienen condiciones propias (cuota, suministros, renovación, normas). Ofrece la renovación antes al titular actual. Cualquier cambio de condiciones o precio requiere aprobación.',
        responsibilities: ['Gestionar renovaciones de parcelas de temporada.'],
      },
    ],
    connections: [
      { connectionId: 'sistema-reservas-pms', purpose: 'Necesario para gestionar la disponibilidad de parcelas y bungalows.', requirement: 'required', unlocksCapabilityIds: [] },
      { connectionId: 'whatsapp', purpose: 'Necesario para reservas y atención.', requirement: 'required', unlocksCapabilityIds: [] },
      { connectionId: 'facturacion-erp', purpose: 'Recomendado para facturar estancias y cuotas.', requirement: 'recommended', unlocksCapabilityIds: [] },
      { connectionId: 'pasarela-pago', purpose: 'Recomendado para cobrar señales.', requirement: 'recommended', unlocksCapabilityIds: [] },
    ],
    approvalRules: ['Cobro de señales y cuotas de temporada.', 'Cambios de condiciones en contratos de temporada.', 'Compensaciones y descuentos.', 'Cancelaciones con devolución.'],
    kpis: ['Ocupación por tipo de alojamiento y temporada', 'Renovaciones de temporada', 'Repetidores', 'Ingreso medio por estancia', 'Incidencias y tiempo de resolución'],
    onboardingFields: [
      { id: 'inventario-alojamientos', label: 'Parcelas (tipos, servicios) y bungalows (capacidades)', type: 'textarea', required: true },
      { id: 'tarifas', label: 'Tarifas por temporada, ocupante y suplementos', type: 'textarea', required: true },
      { id: 'politica-senal', label: 'Política de señales y cancelación', type: 'textarea', required: true },
      { id: 'normas', label: 'Normas del camping', type: 'textarea', required: false },
      { id: 'contratos-temporada', label: 'Condiciones y cuotas de los contratos de temporada', type: 'textarea', required: false },
      { id: 'servicios', label: 'Servicios (piscina, restaurante, actividades, horarios)', type: 'textarea', required: false },
    ],
    handlesSensitiveData: false,
    safetyNotes: [],
  },
  {
    id: 'clinica-dental',
    name: 'Clínica Dental',
    sector: 'Odontología',
    icon: '🦷',
    summary: 'Agenda por doctor y gabinete, primeras visitas y presupuestos de tratamiento por fases.',
    customerType: 'Clínica dental con uno o varios doctores',
    recommendedTemplateIds: ['gestor-de-empresa', 'administrativo-financiero', 'comercial-growth', 'atencion-cliente-cs', 'datos-bi'],
    optionalTemplateIds: ['operaciones-proyectos', 'ciberseguridad-cumplimiento'],
    extensionIds: ['agenda-reservas', 'documentacion-conocimiento'],
    recommendedSkillIds: ['redaccion', 'analisis-documental'],
    recommendedChannels: [
      { channel: 'whatsapp', purpose: 'Citas, recordatorios y dudas — nunca información clínica sin verificación.' },
      { channel: 'chatbot', purpose: 'FAQ de horarios, seguros y primera visita.' },
      { channel: 'voice', purpose: 'Petición y cambio de citas.' },
    ],
    vocabulary: [
      { term: 'Primera visita', meaning: 'Evaluación inicial (a menudo gratuita) con plan de tratamiento.' },
      { term: 'Plan de tratamiento', meaning: 'Fases presupuestadas, por ejemplo higiene → endodoncia → corona.' },
      { term: 'Gabinete', meaning: 'Sala de tratamiento — la agenda cruza doctor y gabinete.' },
      { term: 'Recall / recitado', meaning: 'Aviso periódico de revisión (6 o 12 meses).' },
      { term: 'Consentimiento informado', meaning: 'Firma previa a cualquier tratamiento.' },
      { term: 'Odontograma', meaning: 'Registro dental — dato clínico, nunca se comunica por chat.' },
    ],
    promptOverlays: [
      {
        templateId: 'atencion-cliente-cs',
        instructions: 'Cruza doctor, gabinete y tratamiento al agendar (cada uno tiene duración distinta). Recordatorios a 48h y 24h, ofreciendo recolocar si no confirma. Nunca comuniques información clínica (diagnósticos, tratamientos realizados) por WhatsApp sin verificación de identidad configurada — cita en clínica o deriva al doctor. Dolor agudo es urgencia: ofrece el primer hueco de urgencias del día.',
        safetyNotes: ['Nunca comunica contenido clínico por un canal no verificado.'],
      },
      {
        templateId: 'gestor-de-empresa',
        instructions: 'Los presupuestos solo usan tarifas autorizadas y el plan indicado por el doctor — nunca se inventan ni se ajustan. Descuentos y financiaciones requieren aprobación. El presupuesto indica fases, sesiones estimadas y validez.',
      },
    ],
    connections: [
      { connectionId: 'sistema-reservas-pms', purpose: 'Necesario para la agenda por doctor y gabinete.', requirement: 'required', unlocksCapabilityIds: [] },
      { connectionId: 'whatsapp', purpose: 'Necesario para citas y recordatorios.', requirement: 'required', unlocksCapabilityIds: [] },
      { connectionId: 'facturacion-erp', purpose: 'Recomendado para facturación y financiación.', requirement: 'recommended', unlocksCapabilityIds: [] },
      { connectionId: 'drive', purpose: 'Recomendado para consentimientos informados.', requirement: 'recommended', unlocksCapabilityIds: [] },
    ],
    approvalRules: [
      'Presupuestos con descuento o financiación.',
      'Toda comunicación con contenido clínico.',
      'Campañas de captación.',
      'Devoluciones o compensaciones.',
      'Acceso al historial clínico (siempre restringido y registrado).',
    ],
    kpis: ['Ocupación de agenda por doctor y gabinete', 'Primeras visitas y tasa de aceptación de presupuestos', 'No-shows y recuperación', 'Recalls enviados y convertidos', 'Pacientes reactivados'],
    onboardingFields: [
      { id: 'doctores-gabinetes', label: 'Doctores, especialidades y gabinetes', type: 'textarea', required: true },
      { id: 'tratamientos-tarifas', label: 'Tratamientos y tarifas autorizadas con duración de cita', type: 'textarea', required: true },
      { id: 'primera-visita', label: 'Política de primera visita (gratuita o no)', type: 'boolean', required: true },
      { id: 'huecos-urgencia', label: 'Horarios o huecos de urgencia', type: 'text', required: false },
      { id: 'seguros', label: 'Seguros y mutuas aceptados', type: 'text', required: false },
      { id: 'verificacion-identidad', label: 'Método de verificación de identidad para datos clínicos', type: 'text', required: true, sensitive: true },
    ],
    handlesSensitiveData: true,
    safetyNotes: [
      'Vertical de datos de salud: aprobaciones reforzadas.',
      'Nunca se comparte información clínica por un canal no verificado.',
      'El acceso al historial clínico siempre queda restringido y registrado.',
    ],
  },
  {
    id: 'clinica-estetica',
    name: 'Clínica de Estética',
    sector: 'Medicina y tratamientos estéticos',
    icon: '💆',
    summary: 'Sesiones por bono, aparatología con protocolos y valoraciones iniciales.',
    customerType: 'Clínica de estética con uno o varios profesionales',
    recommendedTemplateIds: ['gestor-de-empresa', 'administrativo-financiero', 'comercial-growth', 'atencion-cliente-cs', 'datos-bi'],
    optionalTemplateIds: ['operaciones-proyectos', 'ciberseguridad-cumplimiento'],
    extensionIds: ['agenda-reservas', 'marketing-contenidos'],
    recommendedSkillIds: ['redaccion', 'diseno'],
    recommendedChannels: [
      { channel: 'whatsapp', purpose: 'Citas, recordatorios y promociones autorizadas.' },
      { channel: 'chatbot', purpose: 'FAQ de tratamientos, precios desde y horarios.' },
      { channel: 'voice', purpose: 'Petición de citas.' },
    ],
    vocabulary: [
      { term: 'Valoración inicial', meaning: 'Primera consulta con diagnóstico y plan.' },
      { term: 'Bono', meaning: 'Pack de N sesiones prepagadas.' },
      { term: 'Cabina', meaning: 'Sala de tratamiento — la agenda cruza profesional, cabina y aparato.' },
      { term: 'Aparatología', meaning: 'Máquinas (láser, radiofrecuencia) con protocolos y contraindicaciones.' },
      { term: 'Contraindicación', meaning: 'Condición que impide un tratamiento (embarazo, medicación).' },
      { term: 'Protocolo pre/post', meaning: 'Preparación y cuidados por tratamiento.' },
    ],
    promptOverlays: [
      {
        templateId: 'atencion-cliente-cs',
        instructions: 'Cruza profesional, cabina y aparato al agendar. Envía el protocolo pre-tratamiento al confirmar y los cuidados post tras la sesión. Las preguntas sobre contraindicaciones médicas se derivan siempre al profesional, nunca se responden directamente. No comuniques información de tratamientos realizados sin verificación de identidad.',
        safetyNotes: ['Nunca responde directamente sobre contraindicaciones médicas — siempre deriva al profesional.'],
      },
      {
        templateId: 'gestor-de-empresa',
        instructions: 'Presupuestos y bonos solo con tarifas autorizadas. El estado de un bono (sesiones restantes) se consulta en el sistema, nunca se estima. Descuentos o promociones fuera de campaña vigente requieren aprobación.',
      },
    ],
    connections: [
      { connectionId: 'sistema-reservas-pms', purpose: 'Necesario para la agenda por profesional y cabina.', requirement: 'required', unlocksCapabilityIds: [] },
      { connectionId: 'whatsapp', purpose: 'Necesario para citas y recordatorios.', requirement: 'required', unlocksCapabilityIds: [] },
      { connectionId: 'facturacion-erp', purpose: 'Recomendado para bonos, presupuestos y financiación.', requirement: 'recommended', unlocksCapabilityIds: [] },
      { connectionId: 'drive', purpose: 'Recomendado para consentimientos informados.', requirement: 'recommended', unlocksCapabilityIds: [] },
      { connectionId: 'redes-sociales', purpose: 'Recomendado para campañas aprobadas.', requirement: 'recommended', unlocksCapabilityIds: [] },
    ],
    approvalRules: [
      'Publicar cualquier campaña o promoción.',
      'Descuentos fuera de campaña vigente.',
      'Comunicaciones con contenido de tratamientos personales.',
      'Devoluciones de bonos.',
      'Financiación de tratamientos.',
    ],
    kpis: ['Ocupación de cabinas y profesionales', 'Valoraciones y conversión a tratamiento', 'Bonos activos, consumidos y renovados', 'Conversión de campañas', 'Clientas reactivadas y no-shows'],
    onboardingFields: [
      { id: 'tratamientos', label: 'Tratamientos, tarifas, duraciones y aparatología necesaria', type: 'textarea', required: true },
      { id: 'profesionales-cabinas', label: 'Profesionales, cabinas y capacidades', type: 'textarea', required: true },
      { id: 'bonos', label: 'Estructura de bonos, caducidad y política de devolución', type: 'textarea', required: false },
      { id: 'protocolos', label: 'Protocolos pre/post por tratamiento', type: 'textarea', required: false },
      { id: 'campanas', label: 'Calendario de campañas estacionales', type: 'textarea', required: false },
      { id: 'verificacion-identidad', label: 'Método de verificación de identidad para datos sensibles', type: 'text', required: true, sensitive: true },
    ],
    handlesSensitiveData: true,
    safetyNotes: [
      'Vertical de datos de salud: aprobaciones reforzadas.',
      'Nunca se comparte información de tratamientos personales por un canal no verificado.',
    ],
  },
  {
    id: 'compraventa-coches',
    name: 'Compraventa de Coches',
    sector: 'Vehículos de ocasión',
    icon: '🚗',
    summary: 'Concesionario con stock propio, tasación a particulares, garantía y financiación.',
    customerType: 'Concesionario de vehículos de ocasión',
    recommendedTemplateIds: ['gestor-de-empresa', 'administrativo-financiero', 'comercial-growth', 'atencion-cliente-cs', 'operaciones-proyectos'],
    optionalTemplateIds: ['datos-bi', 'ciberseguridad-cumplimiento'],
    extensionIds: ['agenda-reservas', 'legal-documental'],
    recommendedSkillIds: ['redaccion', 'extraccion-datos'],
    recommendedChannels: [
      { channel: 'whatsapp', purpose: 'Leads y seguimiento.' },
      { channel: 'chatbot', purpose: 'FAQ del stock publicado: precio, km, año y garantía.' },
      { channel: 'voice', purpose: 'Llamadas desde anuncios.' },
    ],
    vocabulary: [
      { term: 'Tasación', meaning: 'Valoración de un vehículo que un particular quiere vender o entregar.' },
      { term: 'Vehículo de ocasión / km 0 / seminuevo', meaning: 'Categorías del stock.' },
      { term: 'Transferencia', meaning: 'Cambio de titularidad en la DGT.' },
      { term: 'Garantía de ocasión', meaning: 'Mínimo legal en venta a particular.' },
      { term: 'Coche por coche (parte de pago)', meaning: 'Entrega de un vehículo usado como parte del precio.' },
      { term: 'Reserva', meaning: 'Señal que bloquea un vehículo.' },
    ],
    promptOverlays: [
      {
        templateId: 'comercial-growth',
        instructions: 'Cada lead pregunta por un vehículo concreto: confirma disponibilidad antes de responder. Recoge si tiene coche para parte de pago, si necesita financiación y su urgencia. El precio publicado es el válido; la negociación pasa siempre por un humano. No prometas reservas sin señal.',
      },
      {
        templateId: 'operaciones-proyectos',
        instructions: 'Un vehículo no es publicable hasta completar su ficha de preparación (revisión mecánica, ITV, limpieza, fotos). Una reserva con señal bloquea el vehículo: no se enseña ni se vende a otro cliente.',
      },
    ],
    connections: [
      { connectionId: 'crm', purpose: 'Necesario para el stock y el seguimiento de leads.', requirement: 'required', unlocksCapabilityIds: [] },
      { connectionId: 'whatsapp', purpose: 'Necesario para leads y seguimiento.', requirement: 'required', unlocksCapabilityIds: [] },
      { connectionId: 'calendario', purpose: 'Necesario para citas de ver/probar el vehículo.', requirement: 'required', unlocksCapabilityIds: [] },
      { connectionId: 'portales-anuncios', purpose: 'Recomendado para la publicación del stock.', requirement: 'recommended', unlocksCapabilityIds: [] },
      { connectionId: 'financiera-scoring', purpose: 'Recomendado para solicitudes de financiación.', requirement: 'recommended', unlocksCapabilityIds: [] },
    ],
    approvalRules: ['Precio de compra en tasaciones.', 'Descuentos sobre el precio publicado.', 'Pagos a particulares.', 'Reservas y devoluciones de señal.', 'Reparaciones en garantía con coste.'],
    kpis: ['Leads por vehículo y conversión a visita', 'Días de stock por vehículo', 'Margen por operación', 'Tasaciones realizadas vs. compradas', 'Incidencias de garantía'],
    onboardingFields: [
      { id: 'stock-portal', label: 'Stock inicial y portales de publicación', type: 'textarea', required: true },
      { id: 'politica-precios', label: 'Política de precios y margen de negociación', type: 'textarea', required: true },
      { id: 'senal', label: 'Importe de reserva/señal y condiciones', type: 'text', required: true },
      { id: 'garantia', label: 'Garantía ofrecida y taller asociado', type: 'text', required: false },
      { id: 'parte-pago', label: '¿Aceptan vehículo como parte de pago?', type: 'boolean', required: false },
      { id: 'financieras', label: 'Financieras con las que trabajan', type: 'text', required: false },
    ],
    handlesSensitiveData: false,
    safetyNotes: [],
  },
  {
    id: 'hoteles',
    name: 'Hoteles',
    sector: 'Hotelería y alojamiento',
    icon: '🏨',
    summary: 'Reservas directas y por OTAs, recepción, housekeeping y servicios internos.',
    customerType: 'Hotel independiente o pequeño grupo hotelero',
    recommendedTemplateIds: ['gestor-de-empresa', 'administrativo-financiero', 'comercial-growth', 'atencion-cliente-cs', 'operaciones-proyectos', 'datos-bi'],
    optionalTemplateIds: ['personas-rrhh', 'ciberseguridad-cumplimiento'],
    extensionIds: ['agenda-reservas', 'marketing-contenidos'],
    recommendedSkillIds: ['redaccion', 'traduccion'],
    recommendedChannels: [
      { channel: 'whatsapp', purpose: 'Reservas directas, peticiones y upselling.' },
      { channel: 'chatbot', purpose: 'FAQ de check-in, parking, desayuno y mascotas.' },
      { channel: 'voice', purpose: 'Reservas telefónicas y atención.' },
    ],
    vocabulary: [
      { term: 'PMS', meaning: 'Sistema de gestión hotelera: habitaciones, reservas y facturación.' },
      { term: 'Channel manager', meaning: 'Sincroniza disponibilidad y precios con las OTAs.' },
      { term: 'OTA', meaning: 'Agencia online (Booking, Expedia), cobra comisión.' },
      { term: 'ADR / RevPAR', meaning: 'Tarifa media diaria / ingreso por habitación disponible.' },
      { term: 'Overbooking', meaning: 'Más reservas confirmadas que habitaciones disponibles.' },
      { term: 'Régimen', meaning: 'Solo alojamiento, con desayuno o media pensión.' },
    ],
    promptOverlays: [
      {
        templateId: 'atencion-cliente-cs',
        instructions: 'Las peticiones habituales (early check-in, late check-out, cunas, parking, alergias, mascotas) se responden según la política del hotel y se registran en la reserva. Las incidencias de habitación pasan a Operaciones con el número de habitación. Las reseñas negativas se escalan a un humano antes de responder públicamente.',
      },
      {
        templateId: 'datos-bi',
        instructions: 'Informa siempre la ocupación, ADR y RevPAR por periodo y canal, citando el PMS como fuente y la fecha de extracción. Distingue siempre reserva directa de reserva por OTA, por el coste de comisión.',
      },
    ],
    connections: [
      { connectionId: 'sistema-reservas-pms', purpose: 'Necesario para consultar disponibilidad y gestionar reservas.', requirement: 'required', unlocksCapabilityIds: [] },
      { connectionId: 'whatsapp', purpose: 'Necesario para reservas directas y atención.', requirement: 'required', unlocksCapabilityIds: [] },
      { connectionId: 'channel-manager', purpose: 'Recomendado para sincronizar con las OTAs.', requirement: 'recommended', unlocksCapabilityIds: [] },
      { connectionId: 'herramienta-reputacion', purpose: 'Recomendado para gestionar reseñas.', requirement: 'recommended', unlocksCapabilityIds: [] },
    ],
    approvalRules: [
      'Tarifas especiales y descuentos de grupo.',
      'Compensaciones a huéspedes.',
      'Cargos por no-show o daños.',
      'Respuestas públicas a reseñas negativas.',
      'Overbooking y recolocación de huéspedes.',
    ],
    kpis: ['Ocupación, ADR y RevPAR', '% de reserva directa vs. OTA', 'Upselling conseguido', 'Incidencias por habitación y tiempo de resolución', 'Puntuación de reseñas'],
    onboardingFields: [
      { id: 'habitaciones', label: 'Habitaciones (tipos, capacidades, tarifas por temporada)', type: 'textarea', required: true },
      { id: 'regimenes-servicios', label: 'Regímenes y servicios (parking, desayuno, spa)', type: 'textarea', required: false },
      { id: 'politicas', label: 'Políticas (cancelación, no-show, mascotas, check-in/out)', type: 'textarea', required: true },
      { id: 'otas', label: 'OTAs activas y channel manager', type: 'text', required: false },
      { id: 'mejor-precio-directo', label: '¿Aplican política de mejor precio en reserva directa?', type: 'boolean', required: false },
      { id: 'capacidad-grupos', label: 'Capacidad para grupos y eventos', type: 'textarea', required: false },
    ],
    handlesSensitiveData: false,
    safetyNotes: [],
  },
  {
    id: 'inmobiliaria',
    name: 'Inmobiliaria',
    sector: 'Intermediación inmobiliaria',
    icon: '🏠',
    summary: 'Cartera de inmuebles con captación activa, visitas y cierre con arras y escritura.',
    customerType: 'Agencia inmobiliaria (venta y/o alquiler)',
    recommendedTemplateIds: ['gestor-de-empresa', 'administrativo-financiero', 'comercial-growth', 'atencion-cliente-cs', 'datos-bi'],
    optionalTemplateIds: ['operaciones-proyectos', 'ciberseguridad-cumplimiento'],
    extensionIds: ['agenda-reservas', 'legal-documental', 'marketing-contenidos'],
    recommendedSkillIds: ['redaccion', 'analisis-documental'],
    recommendedChannels: [
      { channel: 'whatsapp', purpose: 'Leads de portales y coordinación de visitas.' },
      { channel: 'chatbot', purpose: 'FAQ de inmuebles publicados: precio, metros y zona.' },
      { channel: 'voice', purpose: 'Primera atención de llamadas de cartelería.' },
    ],
    vocabulary: [
      { term: 'Captación', meaning: 'Conseguir el encargo de venta o alquiler de un propietario.' },
      { term: 'Encargo (nota de encargo)', meaning: 'Contrato con el propietario, puede ser en exclusiva.' },
      { term: 'Arras', meaning: 'Señal que compromete la compraventa.' },
      { term: 'Nota simple', meaning: 'Documento registral del inmueble.' },
      { term: 'Lead de portal', meaning: 'Interesado que llega de Idealista, Fotocasa, etc.' },
      { term: 'LAU', meaning: 'Ley de Arrendamientos Urbanos.' },
    ],
    promptOverlays: [
      {
        templateId: 'comercial-growth',
        instructions: 'Cualifica cada lead (compra o alquiler, zona, presupuesto, financiación, urgencia) y cruza con la cartera antes de responder. Un interesado sin encaje hoy entra en la cartera de demanda. Nunca des la dirección exacta de un inmueble sin visita concertada si así está configurado.',
      },
      {
        templateId: 'gestor-de-empresa',
        instructions: 'Cada inmueble tiene expediente (encargo, nota simple, certificado energético, fotos, precio autorizado). No se publica ni se ofrece sin encargo vigente. Los honorarios y condiciones son los del encargo firmado; cualquier variación requiere aprobación.',
      },
    ],
    connections: [
      { connectionId: 'crm', purpose: 'Necesario para gestionar la cartera y los leads.', requirement: 'required', unlocksCapabilityIds: [] },
      { connectionId: 'calendario', purpose: 'Necesario para agendar visitas.', requirement: 'required', unlocksCapabilityIds: [] },
      { connectionId: 'whatsapp', purpose: 'Necesario para leads y coordinación.', requirement: 'required', unlocksCapabilityIds: [] },
      { connectionId: 'portales-anuncios', purpose: 'Recomendado para publicar inmuebles.', requirement: 'recommended', unlocksCapabilityIds: [] },
    ],
    approvalRules: ['Publicar o retirar un inmueble.', 'Variar honorarios o condiciones del encargo.', 'Comunicar ofertas y contraofertas.', 'Enviar documentación contractual (arras, contratos).'],
    kpis: ['Encargos captados (y % de exclusivas)', 'Leads cualificados y visitas realizadas', 'Tiempo medio de venta por zona', 'Conversión visita → oferta', 'Rendimiento por portal'],
    onboardingFields: [
      { id: 'zonas-operacion', label: 'Zonas de trabajo y tipo de operación (venta/alquiler)', type: 'multiselect', required: true, options: ['Venta', 'Alquiler'] },
      { id: 'honorarios', label: 'Honorarios estándar y política de exclusivas', type: 'textarea', required: true },
      { id: 'portales', label: 'Portales donde publica', type: 'text', required: false },
      { id: 'politica-direccion', label: 'Política de comunicación de la dirección exacta', type: 'text', required: false },
      { id: 'politica-feedback', label: 'Política de feedback a propietarios', type: 'text', required: false },
      { id: 'documentos-expediente', label: 'Documentos que exige por expediente', type: 'textarea', required: false },
    ],
    handlesSensitiveData: false,
    safetyNotes: ['No revela la dirección exacta de un inmueble sin visita concertada, si así se configura.'],
  },
  {
    id: 'renting-coches',
    name: 'Renting y Alquiler de Coches',
    sector: 'Renting y alquiler de vehículos',
    icon: '🚙',
    summary: 'Renting a medio/largo plazo o alquiler por días, con cuotas mensuales y contratos con servicios incluidos.',
    customerType: 'Empresa de renting o alquiler de vehículos',
    recommendedTemplateIds: ['gestor-de-empresa', 'administrativo-financiero', 'comercial-growth', 'atencion-cliente-cs', 'operaciones-proyectos'],
    optionalTemplateIds: ['datos-bi', 'ciberseguridad-cumplimiento'],
    extensionIds: ['agenda-reservas', 'legal-documental'],
    recommendedSkillIds: ['redaccion', 'extraccion-datos'],
    recommendedChannels: [
      { channel: 'whatsapp', purpose: 'Atención a clientes activos e incidencias, y captación.' },
      { channel: 'chatbot', purpose: 'FAQ de qué incluye la cuota, requisitos y plazos.' },
      { channel: 'voice', purpose: 'Asistencia y consultas de contrato.' },
    ],
    vocabulary: [
      { term: 'Cuota', meaning: 'Pago mensual, suele incluir mantenimiento, seguro e ITV.' },
      { term: 'Permanencia', meaning: 'Duración mínima del contrato.' },
      { term: 'Franquicia', meaning: 'Parte del daño que asume el cliente en un siniestro.' },
      { term: 'Vehículo de sustitución', meaning: 'Coche temporal durante una reparación.' },
      { term: 'Scoring', meaning: 'Evaluación de solvencia previa a la firma.' },
      { term: 'Renove', meaning: 'Renovación con cambio de vehículo al final del contrato.' },
    ],
    promptOverlays: [
      {
        templateId: 'comercial-growth',
        instructions: 'Cada oferta indica vehículo, plazo, km anual, qué incluye y qué no, y los requisitos de scoring. Las cuotas publicadas son orientativas hasta aprobar el scoring — dilo siempre. Detecta contratos próximos a vencer y propón el renove con antelación.',
      },
      {
        templateId: 'atencion-cliente-cs',
        instructions: 'El cliente activo es prioridad (incidencias, mantenimientos, multas). Ante una avería, consulta la cobertura del contrato y coordina taller y sustitución según la póliza. Las multas se gestionan según el contrato, identificando al conductor dentro del plazo legal. Nunca confirmes coberturas sin consultar el contrato.',
      },
    ],
    connections: [
      { connectionId: 'crm', purpose: 'Necesario para gestionar la flota y los contratos.', requirement: 'required', unlocksCapabilityIds: [] },
      { connectionId: 'facturacion-erp', purpose: 'Necesario para la facturación recurrente.', requirement: 'required', unlocksCapabilityIds: [] },
      { connectionId: 'whatsapp', purpose: 'Necesario para atención a clientes activos.', requirement: 'required', unlocksCapabilityIds: [] },
      { connectionId: 'financiera-scoring', purpose: 'Recomendado para evaluar solvencia.', requirement: 'recommended', unlocksCapabilityIds: [] },
      { connectionId: 'aseguradora-asistencia', purpose: 'Recomendado para partes y vehículo de sustitución.', requirement: 'recommended', unlocksCapabilityIds: [] },
    ],
    approvalRules: [
      'Aprobación de scoring y firma de contrato.',
      'Cuotas fuera de tarifa.',
      'Costes fuera de cobertura comunicados al cliente.',
      'Liquidaciones de fin de contrato y fianzas.',
      'Gestión de impagos.',
    ],
    kpis: ['Contratos activos y cuota media', 'Ocupación de flota', 'Impagos y recobro', 'Tasa de renove', 'Incidencias por vehículo y tiempo de resolución'],
    onboardingFields: [
      { id: 'flota-tarifas', label: 'Flota y tarifas por vehículo, plazo y kilometraje', type: 'textarea', required: true },
      { id: 'incluye-cuota', label: 'Qué incluye la cuota (seguro, mantenimiento, neumáticos)', type: 'textarea', required: true },
      { id: 'requisitos-scoring', label: 'Requisitos de scoring y documentación', type: 'textarea', required: true },
      { id: 'politica-km', label: 'Política de multas y de excesos de kilometraje', type: 'textarea', required: false },
      { id: 'cobertura-sustitucion', label: 'Cobertura de vehículo de sustitución', type: 'text', required: false },
      { id: 'protocolo-impagos', label: 'Protocolo de impagos', type: 'textarea', required: false },
    ],
    handlesSensitiveData: false,
    safetyNotes: [],
  },
];

export function findOfficeVertical(id: VerticalId): OfficeVertical | undefined {
  return SPECIALIST_VERTICALS.find((vertical) => vertical.id === id);
}
