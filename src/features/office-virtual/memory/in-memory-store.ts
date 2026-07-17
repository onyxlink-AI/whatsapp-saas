import type { ApprovalRequest, GatedAction, Stage, TraceEvent, WorkflowRun } from '../schemas';
import type { MemoryStore } from './types';

let counter = 0;
function nextId(prefix: string): string {
  counter += 1;
  return `${prefix}_${Date.now().toString(36)}_${counter}`;
}

/**
 * Process-local memory store (estructura/docs/implementation-roadmap.md Phase 1:
 * "memory interfaces"). Real persistence lives in memory/supabase-store.ts —
 * this one stays around as the offline/test-friendly implementation behind
 * the same async MemoryStore interface.
 */
export class InMemoryMemoryStore implements MemoryStore {
  private runs = new Map<string, WorkflowRun>();

  async createRun(initialStage: Stage = 'new_lead'): Promise<WorkflowRun> {
    const now = Date.now();
    const run: WorkflowRun = {
      id: nextId('run'),
      stage: initialStage,
      createdAt: now,
      updatedAt: now,
      artifacts: {},
      history: [],
    };
    this.runs.set(run.id, run);
    return run;
  }

  async getRun(id: string): Promise<WorkflowRun | undefined> {
    return this.runs.get(id);
  }

  async updateRun(id: string, patch: Partial<Pick<WorkflowRun, 'stage' | 'artifacts' | 'pendingApproval'>>): Promise<WorkflowRun> {
    const run = this.mustGet(id);
    const updated: WorkflowRun = {
      ...run,
      ...patch,
      artifacts: { ...run.artifacts, ...(patch.artifacts ?? {}) },
      updatedAt: Date.now(),
    };
    this.runs.set(id, updated);
    return updated;
  }

  async appendTrace(id: string, event: Omit<TraceEvent, 'id' | 'runId' | 'timestamp'>): Promise<TraceEvent> {
    const run = this.mustGet(id);
    const trace: TraceEvent = { ...event, id: nextId('trace'), runId: id, timestamp: Date.now() };
    run.history.push(trace);
    run.updatedAt = Date.now();
    return trace;
  }

  async requestApproval(id: string, action: GatedAction, description: string): Promise<ApprovalRequest> {
    const request: ApprovalRequest = {
      id: nextId('appr'),
      runId: id,
      action,
      description,
      status: 'pending',
      requestedAt: Date.now(),
    };
    await this.updateRun(id, { pendingApproval: request });
    return request;
  }

  async decideApproval(id: string, approved: boolean): Promise<ApprovalRequest> {
    const run = this.mustGet(id);
    if (!run.pendingApproval) throw new Error(`Run ${id} has no pending approval`);
    const decided: ApprovalRequest = {
      ...run.pendingApproval,
      status: approved ? 'approved' : 'rejected',
      decidedAt: Date.now(),
    };
    await this.updateRun(id, { pendingApproval: decided });
    return decided;
  }

  async listRuns(): Promise<WorkflowRun[]> {
    return [...this.runs.values()];
  }

  private mustGet(id: string): WorkflowRun {
    const run = this.runs.get(id);
    if (!run) throw new Error(`Unknown workflow run: ${id}`);
    return run;
  }
}
