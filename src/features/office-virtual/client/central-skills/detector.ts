import type { CentralTask } from '../central-tasks';
import { isSkillSpecialistAgent } from './eligibility';
import type { SkillCandidateInsight } from './types';

function fingerprintTitle(title: string): string {
  return title
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('es')
    .replace(/\b(?:el|la|los|las|un|una|de|del|para|a)\b/g, ' ')
    .replace(/\d+/g, '#')
    .replace(/[^a-z#]+/g, ' ')
    .trim().replace(/\s+/g, '-');
}

export function detectSkillCandidates(tasks: CentralTask[], minimumOccurrences = 3): SkillCandidateInsight[] {
  const groups = new Map<string, CentralTask[]>();
  for (const task of tasks) {
    if (task.status !== 'completed' || !task.assignedAgentId || !isSkillSpecialistAgent(task.assignedAgentId)) continue;
    const fingerprint = fingerprintTitle(task.title);
    if (!fingerprint) continue;
    const key = `${task.assignedAgentId}:${fingerprint}`;
    groups.set(key, [...(groups.get(key) ?? []), task]);
  }

  return [...groups.entries()]
    .filter(([, matches]) => matches.length >= minimumOccurrences)
    .map(([key, matches]) => ({
      fingerprint: key,
      ownerAgentId: matches[0].assignedAgentId as SkillCandidateInsight['ownerAgentId'],
      suggestedName: matches[0].title.replace(/\s+\d+\s*$/u, '').trim(),
      suggestedObjective: `Ejecutar de forma consistente: ${matches[0].title}.`,
      evidenceTaskIds: matches.map((task) => task.id),
      occurrences: matches.length,
    }))
    .sort((a, b) => b.occurrences - a.occurrences || a.suggestedName.localeCompare(b.suggestedName, 'es'));
}
