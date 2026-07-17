import type { ApprovalRequest, GatedAction } from '../schemas';
import type { MemoryStore } from '../memory/types';

// estructura/CLAUDE.md > "Approval policy" + our own advance_to_ops gate
// (estructura/docs/workflows/lead-to-proposal.md, step 6). Every value in
// GatedActionSchema is, by definition, an action that always requires
// approval — this function exists so the rule is documented in one place
// instead of scattered through the orchestrator.
export function requiresApproval(_action: GatedAction): boolean {
  return true;
}

export class ApprovalGate {
  private memory: MemoryStore;

  constructor(memory: MemoryStore) {
    this.memory = memory;
  }

  async request(runId: string, action: GatedAction, description: string): Promise<ApprovalRequest> {
    return this.memory.requestApproval(runId, action, description);
  }

  async decide(runId: string, approved: boolean): Promise<ApprovalRequest> {
    return this.memory.decideApproval(runId, approved);
  }
}
