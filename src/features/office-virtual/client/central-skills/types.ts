import type { AgentId } from '../../schemas';

export type SkillEligibleAgentId = 'coordinator' | 'proposal' | 'operations' | 'content' | 'review-qa';
export type SkillSpecialistAgentId = Exclude<SkillEligibleAgentId, 'coordinator'>;
export type SkillStatus = 'candidate' | 'draft' | 'approved' | 'active' | 'paused' | 'rejected' | 'archived';
export type SkillOrigin = 'manual' | 'learned';
export type SkillRisk = 'low' | 'medium' | 'high';
export type SkillTriggerType = 'keyword' | 'event' | 'schedule' | 'manual';
export type SkillApprovalPolicy = 'always' | 'sensitive_only' | 'never';
export type SkillActorRole = 'super_admin' | 'workspace_admin' | 'workspace_member' | 'agent' | 'system';

export type SkillActor = {
  actorId: string;
  role: SkillActorRole;
  workspaceId: string | null;
  agentId?: AgentId;
};

export type SkillTrigger = { id: string; type: SkillTriggerType; description: string };
export type SkillInput = { id: string; name: string; description: string; required: boolean };
export type SkillTool = { id: string; name: string; description: string; allowed: boolean };
export type SkillStep = { id: string; order: number; title: string; description: string; toolId: string | null };
export type SkillOutput = { id: string; name: string; description: string };
export type SkillApproval = { policy: SkillApprovalPolicy; note: string };

export type SkillDefinition = {
  objective: string;
  triggers: SkillTrigger[];
  inputs: SkillInput[];
  steps: SkillStep[];
  tools: SkillTool[];
  outputs: SkillOutput[];
  approval: SkillApproval;
};

export type SkillMetrics = {
  detectedOccurrences: number;
  successfulRuns: number;
  failedRuns: number;
  averageDurationMs: number | null;
  estimatedMinutesSaved: number;
  averageCostUsd: number | null;
};

export type SkillRecord = {
  id: string;
  workspaceId: string;
  name: string;
  description: string;
  status: SkillStatus;
  origin: SkillOrigin;
  risk: SkillRisk;
  ownerAgentId: SkillEligibleAgentId;
  assignedAgentIds: SkillEligibleAgentId[];
  definition: SkillDefinition;
  evidenceTaskIds: string[];
  metrics: SkillMetrics;
  revision: number;
  currentVersion: number;
  approvedVersion: number | null;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
};

export type SkillVersion = {
  id: string;
  skillId: string;
  workspaceId: string;
  version: number;
  name: string;
  description: string;
  risk: SkillRisk;
  ownerAgentId: SkillEligibleAgentId;
  assignedAgentIds: SkillEligibleAgentId[];
  definition: SkillDefinition;
  createdAt: string;
  createdBy: string;
  restoredFromVersion: number | null;
};

export type SkillTestStep = {
  stepId: string;
  label: string;
  status: 'passed' | 'failed' | 'skipped';
  detail: string;
};

export type SkillTestRun = {
  id: string;
  skillId: string;
  workspaceId: string;
  skillVersion: number;
  status: 'passed' | 'failed';
  trace: SkillTestStep[];
  durationMs: number;
  estimatedCostUsd: number;
  occurredAt: string;
  runBy: string;
};

export type SkillAuditAction =
  | 'candidate_created' | 'created' | 'updated' | 'tested' | 'approved'
  | 'published' | 'paused' | 'rejected' | 'archived' | 'assignments_updated'
  | 'version_restored' | 'metrics_recorded';

export type SkillAuditEntry = {
  commandId: string;
  skillId: string;
  workspaceId: string;
  action: SkillAuditAction;
  actor: SkillActor;
  occurredAt: string;
  fromStatus: SkillStatus | null;
  toStatus: SkillStatus;
  revision: number;
  note: string | null;
};

export type CentralSkillState = {
  workspaceId: string;
  skills: Record<string, SkillRecord>;
  versions: Record<string, SkillVersion>;
  testRuns: Record<string, SkillTestRun>;
  audit: SkillAuditEntry[];
  processedCommandIds: string[];
};

type SkillCommandBase = {
  commandId: string;
  workspaceId: string;
  actor: SkillActor;
  occurredAt: string;
};

type ExistingSkillCommandBase = SkillCommandBase & {
  skillId: string;
  expectedRevision: number;
};

export type SkillEditablePatch = Partial<Pick<SkillRecord, 'name' | 'description' | 'risk' | 'ownerAgentId' | 'definition'>>;

export type SkillCommand =
  | (SkillCommandBase & {
      type: 'skill.candidate_created'; skillId: string; name: string; description?: string;
      ownerAgentId: SkillSpecialistAgentId; definition: SkillDefinition; evidenceTaskIds: string[];
      detectedOccurrences: number;
    })
  | (SkillCommandBase & {
      type: 'skill.created'; skillId: string; name: string; description?: string; risk: SkillRisk;
      ownerAgentId: SkillEligibleAgentId; assignedAgentIds?: SkillEligibleAgentId[]; definition: SkillDefinition;
    })
  | (ExistingSkillCommandBase & { type: 'skill.updated'; patch: SkillEditablePatch })
  | (ExistingSkillCommandBase & { type: 'skill.test_recorded'; testRunId: string; status: 'passed' | 'failed'; trace: SkillTestStep[]; durationMs: number; estimatedCostUsd: number })
  | (ExistingSkillCommandBase & { type: 'skill.approved' })
  | (ExistingSkillCommandBase & { type: 'skill.published' })
  | (ExistingSkillCommandBase & { type: 'skill.paused'; reason?: string })
  | (ExistingSkillCommandBase & { type: 'skill.rejected'; reason: string })
  | (ExistingSkillCommandBase & { type: 'skill.archived'; reason?: string })
  | (ExistingSkillCommandBase & { type: 'skill.assignments_updated'; assignedAgentIds: SkillEligibleAgentId[] })
  | (ExistingSkillCommandBase & { type: 'skill.version_restored'; sourceVersion: number })
  | (ExistingSkillCommandBase & { type: 'skill.metrics_recorded'; successful: boolean; durationMs: number; estimatedMinutesSaved: number; costUsd: number });

export type SkillMutationErrorCode =
  | 'workspace_mismatch' | 'skill_not_found' | 'skill_exists' | 'stale_revision'
  | 'invalid_transition' | 'unauthorized' | 'ineligible_agent' | 'test_required'
  | 'version_not_found' | 'invalid_definition';

export type SkillMutationResult =
  | { success: true; state: CentralSkillState; skill: SkillRecord; duplicate: boolean }
  | { success: false; code: SkillMutationErrorCode };

export type SkillCandidateInsight = {
  fingerprint: string;
  ownerAgentId: SkillSpecialistAgentId;
  suggestedName: string;
  suggestedObjective: string;
  evidenceTaskIds: string[];
  occurrences: number;
};
