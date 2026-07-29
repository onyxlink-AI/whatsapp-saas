// Ported from the Agencia IA prototype (src/lib/specialistOutputContract.ts).
// Shared output shape every specialist and skill would return once wired to
// a real orchestrator run. This is a TypeScript type only — no live
// execution produces one of these yet; it exists so the UI has a real
// contract to type against instead of `any`.
export type SpecialistOutputContract = {
  status: 'completed' | 'blocked' | 'needs_clarification' | 'awaiting_permission' | 'failed';
  summary: string;
  result: Record<string, unknown>;
  userFacingResponse: string;
  /** Never shown to the end user — internal reasoning/notes only. */
  internalNotes: string;
  actionsCompleted: string[];
  actionsPending: string[];
  evidence: Array<{ source: string; reference?: string; observedAt?: string }>;
  /** `targetTemplateId` is a `SpecialistTemplateId` when known — kept as `string` here so this generic contract has no dependency on the template catalog. */
  handoff: { required: boolean; targetTemplateId: string | null; reason: string | null } | null;
  confidence: 'high' | 'medium' | 'low';
};

/** The 6 fixed test-case categories repeated for every specialist/extension/skill. */
export const SPECIALIST_TEST_CASES = [
  'Caso normal con datos completos',
  'Datos incompletos',
  'Permiso denegado',
  'Conexión ausente (capacidad bloqueada, alternativa degradada)',
  'Fallo de un sistema externo',
  'Petición fuera de la función del especialista',
] as const;

/** Same generic "Entradas mínimas" list repeated across every template/skill. */
export const SPECIALIST_STANDARD_MINIMUM_INPUTS = [
  'Objetivo',
  'Contexto',
  'Cliente',
  'Prioridad',
  'Plazo',
  'Permisos',
  'Fuentes de datos',
  'Formato de salida',
] as const;
