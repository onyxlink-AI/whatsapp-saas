import { SPECIALIST_STANDARD_MINIMUM_INPUTS, type SpecialistOutputContract } from './specialist-output-contract';
import type { SpecialistTemplateId } from './specialist-templates';

// Ported from the Agencia IA prototype (src/lib/specialistSkills.ts) — the 8
// internal skills. Skills are never workers and never occupy a seat: a
// specialist calls one internally and gets a SpecialistOutputContract back —
// they don't receive work directly from a channel.
export const SPECIALIST_SKILL_IDS = [
  'investigacion',
  'redaccion',
  'traduccion',
  'analisis-documental',
  'extraccion-datos',
  'programacion',
  'diseno',
  'revision-calidad',
] as const;
export type SpecialistSkillId = (typeof SPECIALIST_SKILL_IDS)[number];

export type SpecialistSkill = {
  id: SpecialistSkillId;
  name: string;
  icon: string;
  summary: string;
  responsibilities: string[];
  minimumInputs: string[];
  /** A representative example of what this skill typically returns — not a live execution. */
  outputContract: SpecialistOutputContract;
  safetyNotes: string[];
  recommendedTemplateIds: SpecialistTemplateId[];
};

const STANDARD_INPUTS = [...SPECIALIST_STANDARD_MINIMUM_INPUTS];

// Every skill shares the same "Límites de capacidad": no business actions,
// no decisions reserved to the owning specialist, no reading data outside
// the task's scope.
const STANDARD_SKILL_SAFETY_NOTES = [
  'No ejecuta acciones de negocio.',
  'No toma decisiones reservadas al especialista propietario.',
  'No accede a datos fuera de lo incluido en la tarea.',
];

export const SPECIALIST_SKILLS: SpecialistSkill[] = [
  {
    id: 'investigacion',
    name: 'Investigación',
    icon: '🔎',
    summary: 'Busca y compara información en fuentes autorizadas, citando siempre la referencia.',
    responsibilities: ['Buscar información en fuentes autorizadas.', 'Comparar fuentes.', 'Preparar un resumen con referencias.', 'Señalar datos dudosos.'],
    minimumInputs: STANDARD_INPUTS,
    outputContract: {
      status: 'completed',
      summary: 'Resumen de la investigación solicitada con fuentes citadas.',
      result: { findings: [], sourcesConsulted: [] },
      userFacingResponse: 'Esto es lo que encontré, con las fuentes consultadas.',
      internalNotes: 'Fuentes descartadas por no ser autorizadas o fiables.',
      actionsCompleted: ['Búsqueda en fuentes autorizadas', 'Comparación de resultados'],
      actionsPending: [],
      evidence: [{ source: 'Fuente autorizada', reference: '', observedAt: '' }],
      handoff: null,
      confidence: 'medium',
    },
    safetyNotes: STANDARD_SKILL_SAFETY_NOTES,
    recommendedTemplateIds: ['comercial-growth', 'datos-bi'],
  },
  {
    id: 'redaccion',
    name: 'Redacción',
    icon: '✍️',
    summary: 'Redacta textos según objetivo, canal y tono, y prepara variantes de longitud.',
    responsibilities: ['Crear textos según objetivo, canal y tono.', 'Revisar ortografía y gramática.', 'Preparar variantes.', 'Adaptar la longitud al canal.'],
    minimumInputs: STANDARD_INPUTS,
    outputContract: {
      status: 'completed',
      summary: 'Borrador de texto listo para revisión.',
      result: { draft: '' },
      userFacingResponse: 'Aquí tienes el borrador para revisar.',
      internalNotes: 'Tono y canal usados para adaptar el texto.',
      actionsCompleted: ['Redacción del borrador'],
      actionsPending: ['Revisión humana antes de enviar'],
      evidence: [],
      handoff: null,
      confidence: 'high',
    },
    safetyNotes: STANDARD_SKILL_SAFETY_NOTES,
    recommendedTemplateIds: ['gestor-de-empresa', 'comercial-growth', 'atencion-cliente-cs', 'personas-rrhh'],
  },
  {
    id: 'traduccion',
    name: 'Traducción',
    icon: '🌐',
    summary: 'Traduce manteniendo el sentido, los nombres y las cifras, señalando dudas de terminología.',
    responsibilities: ['Traducir manteniendo el sentido.', 'Conservar nombres y cifras.', 'Indicar dudas de terminología.', 'Adaptar el registro.'],
    minimumInputs: STANDARD_INPUTS,
    outputContract: {
      status: 'completed',
      summary: 'Texto traducido con dudas de terminología señaladas si las hay.',
      result: { translatedText: '', sourceLanguage: '', targetLanguage: '' },
      userFacingResponse: 'Aquí tienes la traducción.',
      internalNotes: 'Términos con más de una traducción posible.',
      actionsCompleted: ['Traducción del texto'],
      actionsPending: [],
      evidence: [],
      handoff: null,
      confidence: 'medium',
    },
    safetyNotes: STANDARD_SKILL_SAFETY_NOTES,
    recommendedTemplateIds: ['atencion-cliente-cs', 'comercial-growth'],
  },
  {
    id: 'analisis-documental',
    name: 'Análisis documental',
    icon: '📑',
    summary: 'Lee documentos y extrae datos, obligaciones, fechas y riesgos.',
    responsibilities: ['Leer documentos.', 'Extraer datos relevantes.', 'Comparar versiones.', 'Detectar obligaciones, fechas y riesgos.'],
    minimumInputs: STANDARD_INPUTS,
    outputContract: {
      status: 'completed',
      summary: 'Extracto del documento con puntos relevantes señalados.',
      result: { keyPoints: [], obligations: [], risks: [] },
      userFacingResponse: 'Esto es lo relevante del documento.',
      internalNotes: 'Secciones ambiguas del documento original.',
      actionsCompleted: ['Lectura y extracción de datos'],
      actionsPending: [],
      evidence: [{ source: 'Documento analizado' }],
      handoff: null,
      confidence: 'medium',
    },
    safetyNotes: STANDARD_SKILL_SAFETY_NOTES,
    recommendedTemplateIds: ['gestor-de-empresa', 'administrativo-financiero', 'ciberseguridad-cumplimiento'],
  },
  {
    id: 'extraccion-datos',
    name: 'Extracción de datos',
    icon: '🧮',
    summary: 'Extrae y normaliza campos estructurados, señalando valores faltantes.',
    responsibilities: ['Extraer campos.', 'Normalizar formatos.', 'Detectar valores faltantes.', 'Preparar la salida estructurada.'],
    minimumInputs: STANDARD_INPUTS,
    outputContract: {
      status: 'completed',
      summary: 'Datos extraídos en formato estructurado.',
      result: { fields: {}, missingFields: [] },
      userFacingResponse: 'Estos son los datos extraídos.',
      internalNotes: 'Campos con formato ambiguo en el origen.',
      actionsCompleted: ['Extracción y normalización'],
      actionsPending: [],
      evidence: [],
      handoff: null,
      confidence: 'medium',
    },
    safetyNotes: STANDARD_SKILL_SAFETY_NOTES,
    recommendedTemplateIds: ['administrativo-financiero', 'datos-bi'],
  },
  {
    id: 'programacion',
    name: 'Programación',
    icon: '💻',
    summary: 'Prepara código, pruebas y documentación técnica de cambios.',
    responsibilities: ['Crear código.', 'Corregir fallos.', 'Preparar pruebas.', 'Documentar cambios.'],
    minimumInputs: STANDARD_INPUTS,
    outputContract: {
      status: 'completed',
      summary: 'Cambio preparado con pruebas y documentación.',
      result: { changeSummary: '', filesTouched: [] },
      userFacingResponse: 'El cambio está preparado para revisión.',
      internalNotes: 'Decisiones técnicas tomadas y alternativas descartadas.',
      actionsCompleted: ['Implementación', 'Pruebas'],
      actionsPending: ['Revisión y despliegue humano'],
      evidence: [],
      handoff: null,
      confidence: 'medium',
    },
    safetyNotes: STANDARD_SKILL_SAFETY_NOTES,
    recommendedTemplateIds: ['ciberseguridad-cumplimiento', 'operaciones-proyectos'],
  },
  {
    id: 'diseno',
    name: 'Diseño',
    icon: '🎨',
    summary: 'Prepara instrucciones visuales y variantes manteniendo la consistencia de marca.',
    responsibilities: ['Preparar instrucciones visuales.', 'Crear variantes.', 'Revisar consistencia de marca.', 'Entregar especificaciones.'],
    minimumInputs: STANDARD_INPUTS,
    outputContract: {
      status: 'completed',
      summary: 'Especificación visual lista para producción.',
      result: { spec: '', variants: [] },
      userFacingResponse: 'Aquí tienes la propuesta visual.',
      internalNotes: 'Elementos de marca aplicados.',
      actionsCompleted: ['Preparación de la especificación'],
      actionsPending: ['Aprobación de marca'],
      evidence: [],
      handoff: null,
      confidence: 'medium',
    },
    safetyNotes: STANDARD_SKILL_SAFETY_NOTES,
    recommendedTemplateIds: ['comercial-growth'],
  },
  {
    id: 'revision-calidad',
    name: 'Revisión de calidad',
    icon: '🔍',
    summary: 'Comprueba exactitud, formato, permisos y contradicciones antes de entregar.',
    responsibilities: ['Comprobar exactitud.', 'Comprobar formato.', 'Comprobar permisos.', 'Detectar contradicciones.'],
    minimumInputs: STANDARD_INPUTS,
    outputContract: {
      status: 'completed',
      summary: 'Revisión completada con hallazgos, si los hay.',
      result: { issuesFound: [] },
      userFacingResponse: 'Revisión completada.',
      internalNotes: 'Criterios de revisión aplicados.',
      actionsCompleted: ['Revisión de exactitud, formato y permisos'],
      actionsPending: [],
      evidence: [],
      handoff: null,
      confidence: 'high',
    },
    safetyNotes: STANDARD_SKILL_SAFETY_NOTES,
    recommendedTemplateIds: ['operaciones-proyectos', 'ciberseguridad-cumplimiento'],
  },
];

export function findSpecialistSkill(id: SpecialistSkillId): SpecialistSkill | undefined {
  return SPECIALIST_SKILLS.find((skill) => skill.id === id);
}
