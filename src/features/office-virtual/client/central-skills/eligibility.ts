import type { AgentId } from '../../schemas';
import { OFFICE_SEAT_BINDINGS } from '../central-events';
import type { SkillEligibleAgentId, SkillSpecialistAgentId } from './types';

export const SKILL_ELIGIBLE_AGENT_IDS = (Object.values(OFFICE_SEAT_BINDINGS)
  .filter((binding) => binding.role === 'orchestrator' || binding.role === 'specialist')
  .map((binding) => binding.agentId)) as SkillEligibleAgentId[];

export const SKILL_SPECIALIST_AGENT_IDS = (Object.values(OFFICE_SEAT_BINDINGS)
  .filter((binding) => binding.role === 'specialist')
  .map((binding) => binding.agentId)) as SkillSpecialistAgentId[];

export function isSkillEligibleAgent(agentId: AgentId): agentId is SkillEligibleAgentId {
  const role = OFFICE_SEAT_BINDINGS[agentId]?.role;
  return role === 'orchestrator' || role === 'specialist';
}

export function isSkillSpecialistAgent(agentId: AgentId): agentId is SkillSpecialistAgentId {
  return OFFICE_SEAT_BINDINGS[agentId]?.role === 'specialist';
}
