import type { CentralSkillState, SkillStatus } from './types';

export function selectSkills(state: CentralSkillState, status?: SkillStatus) {
  return Object.values(state.skills)
    .filter((skill) => !status || skill.status === status)
    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
}

export function selectSkillVersions(state: CentralSkillState, skillId: string) {
  return Object.values(state.versions)
    .filter((version) => version.skillId === skillId)
    .sort((a, b) => b.version - a.version);
}

export function selectSkillTestRuns(state: CentralSkillState, skillId: string) {
  return Object.values(state.testRuns)
    .filter((run) => run.skillId === skillId)
    .sort((a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt));
}

export function selectSkillAudit(state: CentralSkillState, skillId: string) {
  return state.audit.filter((entry) => entry.skillId === skillId).sort((a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt));
}
