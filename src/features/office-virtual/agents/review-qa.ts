import { type AgentInput, QAResultSchema, type QAResult } from '../schemas';
import type { AgentRunner, RunnerContext } from './types';

type Severity = 'low' | 'medium' | 'high';

// An empty list is a legitimate answer for these fields (e.g. "no
// blockers"), so it must not be treated as a missing/incomplete field.
const ALLOWED_EMPTY_FIELDS = new Set(['blockers', 'dependencies', 'missingInfo', 'risks', 'exclusions']);

function findEmptyFields(artifact: Record<string, unknown>): string[] {
  const empty: string[] = [];
  for (const [key, value] of Object.entries(artifact)) {
    if (ALLOWED_EMPTY_FIELDS.has(key)) continue;
    if (value == null) empty.push(key);
    else if (typeof value === 'string' && value.trim() === '') empty.push(key);
    else if (Array.isArray(value) && value.length === 0) empty.push(key);
  }
  return empty;
}

export const reviewQaAgent: AgentRunner<AgentInput, QAResult> = {
  id: 'review-qa',
  promptVersion: 'v1',
  async run({ context }, _ctx: RunnerContext) {
    const subject = (context?.subject as string) ?? 'artifact';
    const artifact = (context?.artifact as Record<string, unknown>) ?? {};

    const emptyFields = findEmptyFields(artifact);
    const issues = emptyFields.map((field) => ({
      description: `El campo "${field}" de ${subject} está vacío o incompleto.`,
      severity: (emptyFields.length > 2 ? 'high' : 'medium') as Severity,
    }));

    const result: QAResult = {
      pass: issues.length === 0,
      issues,
      recommendedFixes: issues.map((i) => `Completar ${i.description.split('"')[1]} antes de continuar.`),
      releaseRecommendation:
        issues.length === 0
          ? `${subject} cumple el contrato de salida, listo para avanzar.`
          : `${subject} necesita revisión antes de avanzar de etapa.`,
    };

    return QAResultSchema.parse(result);
  },
};
