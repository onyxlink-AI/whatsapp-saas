import type { ApprovalRequest, GatedAction, Stage, TraceEvent, WorkflowRun } from '../schemas';

export interface MemoryStore {
  createRun(initialStage?: Stage): Promise<WorkflowRun>;
  getRun(id: string): Promise<WorkflowRun | undefined>;
  updateRun(id: string, patch: Partial<Pick<WorkflowRun, 'stage' | 'artifacts' | 'pendingApproval'>>): Promise<WorkflowRun>;
  appendTrace(id: string, event: Omit<TraceEvent, 'id' | 'runId' | 'timestamp'>): Promise<TraceEvent>;
  requestApproval(id: string, action: GatedAction, description: string): Promise<ApprovalRequest>;
  decideApproval(id: string, approved: boolean): Promise<ApprovalRequest>;
  listRuns(): Promise<WorkflowRun[]>;
}
