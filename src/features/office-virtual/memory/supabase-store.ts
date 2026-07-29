import type { SupabaseClient } from '@supabase/supabase-js';
import type { ApprovalRequest, GatedAction, Stage, TraceEvent, WorkflowRun } from '../schemas';
import type { MemoryStore } from './types';

type WorkflowRunRow = {
  id: string;
  stage: Stage;
  artifacts: WorkflowRun['artifacts'];
  pending_approval: ApprovalRequest | null;
  created_at: string;
  updated_at: string;
};

type TraceEventRow = {
  id: string;
  run_id: string;
  agent_id: TraceEvent['agentId'];
  prompt_version: string;
  input: unknown;
  output: unknown;
  elapsed_ms: number;
  result: TraceEvent['result'];
  reason: string | null;
  created_at: string;
};

function toRun(row: WorkflowRunRow, history: TraceEvent[]): WorkflowRun {
  return {
    id: row.id,
    stage: row.stage,
    artifacts: row.artifacts ?? {},
    pendingApproval: row.pending_approval ?? undefined,
    createdAt: new Date(row.created_at).getTime(),
    updatedAt: new Date(row.updated_at).getTime(),
    history,
  };
}

function toTrace(row: TraceEventRow): TraceEvent {
  return {
    id: row.id,
    runId: row.run_id,
    agentId: row.agent_id,
    promptVersion: row.prompt_version,
    input: row.input,
    output: row.output,
    elapsedMs: row.elapsed_ms,
    result: row.result,
    reason: row.reason ?? undefined,
    timestamp: new Date(row.created_at).getTime(),
  };
}

/**
 * Supabase-backed MemoryStore (Fase 0 — ver supabase/schema.sql). Same
 * contract as InMemoryMemoryStore, so orchestrator/engine.ts doesn't change
 * at all when this is swapped in from src/hooks/useAgentChat.ts.
 */
export class SupabaseMemoryStore implements MemoryStore {
  private client: SupabaseClient;

  constructor(client: SupabaseClient) {
    this.client = client;
  }

  async createRun(initialStage: Stage = 'new_lead'): Promise<WorkflowRun> {
    const { data, error } = await this.client
      .from('workflow_runs')
      .insert({ stage: initialStage, artifacts: {} })
      .select()
      .single();
    if (error) throw new Error(`createRun: ${error.message}`);
    return toRun(data as WorkflowRunRow, []);
  }

  async getRun(id: string): Promise<WorkflowRun | undefined> {
    const { data: runRow, error } = await this.client.from('workflow_runs').select('*').eq('id', id).maybeSingle();
    if (error) throw new Error(`getRun: ${error.message}`);
    if (!runRow) return undefined;

    const { data: traceRows, error: traceError } = await this.client
      .from('trace_events')
      .select('*')
      .eq('run_id', id)
      .order('created_at', { ascending: true });
    if (traceError) throw new Error(`getRun traces: ${traceError.message}`);

    return toRun(runRow as WorkflowRunRow, (traceRows as TraceEventRow[]).map(toTrace));
  }

  async updateRun(
    id: string,
    patch: Partial<Pick<WorkflowRun, 'stage' | 'artifacts' | 'pendingApproval'>>,
  ): Promise<WorkflowRun> {
    const current = await this.getRun(id);
    if (!current) throw new Error(`Unknown workflow run: ${id}`);

    const { data, error } = await this.client
      .from('workflow_runs')
      .update({
        stage: patch.stage ?? current.stage,
        artifacts: { ...current.artifacts, ...(patch.artifacts ?? {}) },
        pending_approval: patch.pendingApproval ?? current.pendingApproval ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();
    if (error) throw new Error(`updateRun: ${error.message}`);

    return toRun(data as WorkflowRunRow, current.history);
  }

  async appendTrace(id: string, event: Omit<TraceEvent, 'id' | 'runId' | 'timestamp'>): Promise<TraceEvent> {
    const { data, error } = await this.client
      .from('trace_events')
      .insert({
        run_id: id,
        agent_id: event.agentId,
        prompt_version: event.promptVersion,
        input: event.input,
        output: event.output,
        elapsed_ms: event.elapsedMs,
        result: event.result,
        reason: event.reason ?? null,
      })
      .select()
      .single();
    if (error) throw new Error(`appendTrace: ${error.message}`);

    await this.client.from('workflow_runs').update({ updated_at: new Date().toISOString() }).eq('id', id);

    return toTrace(data as TraceEventRow);
  }

  async requestApproval(id: string, action: GatedAction, description: string): Promise<ApprovalRequest> {
    const request: ApprovalRequest = {
      id: crypto.randomUUID(),
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
    const current = await this.getRun(id);
    if (!current?.pendingApproval) throw new Error(`Run ${id} has no pending approval`);
    const decided: ApprovalRequest = {
      ...current.pendingApproval,
      status: approved ? 'approved' : 'rejected',
      decidedAt: Date.now(),
    };
    await this.updateRun(id, { pendingApproval: decided });
    return decided;
  }

  async listRuns(): Promise<WorkflowRun[]> {
    const { data, error } = await this.client.from('workflow_runs').select('*').order('created_at', { ascending: false });
    if (error) throw new Error(`listRuns: ${error.message}`);
    return (data as WorkflowRunRow[]).map((row) => toRun(row, []));
  }
}
