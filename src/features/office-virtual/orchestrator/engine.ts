import { AGENT_RUNNERS } from '../agents/registry';
import { routeForStage } from '../agents/coordinator';
import type { MemoryStore } from '../memory/types';
import type { AgentId, ApprovalRequest, Stage, WorkflowRun } from '../schemas';
import { ApprovalGate } from './approval';

export type EngineResult = {
  runId: string;
  stage: Stage;
  agentId: AgentId;
  output: unknown;
  approvalRequestId?: string;
};

/**
 * The orchestrator: runs the stage machine from estructura/docs/architecture.md,
 * invoking the placeholder specialists in /agents and persisting every step
 * through a MemoryStore. This is the bridge the office UI calls into
 * (handleAgentMessage) — one entry point per despacho.
 */
export class OfficeEngine {
  private memory: MemoryStore;
  private approvals: ApprovalGate;

  constructor(memory: MemoryStore) {
    this.memory = memory;
    this.approvals = new ApprovalGate(memory);
  }

  async getOrCreateRun(runId?: string): Promise<WorkflowRun> {
    if (runId) {
      const existing = await this.memory.getRun(runId);
      if (existing) return existing;
    }
    return this.memory.createRun('new_lead');
  }

  private async runAndLog<TOutput>(
    run: WorkflowRun,
    agentId: AgentId,
    text: string,
    context: Record<string, unknown> | undefined,
  ): Promise<TOutput> {
    const runner = AGENT_RUNNERS[agentId];
    const start = Date.now();
    try {
      const output = await runner.run({ text, context }, { runId: run.id, artifacts: run.artifacts });
      await this.memory.appendTrace(run.id, {
        agentId,
        promptVersion: runner.promptVersion,
        input: { text, context },
        output,
        elapsedMs: Date.now() - start,
        result: 'ok',
      });
      return output as TOutput;
    } catch (err) {
      await this.memory.appendTrace(run.id, {
        agentId,
        promptVersion: runner.promptVersion,
        input: { text, context },
        output: null,
        elapsedMs: Date.now() - start,
        result: 'error',
        reason: (err as Error).message,
      });
      throw err;
    }
  }

  async handleAgentMessage(agentId: AgentId, text: string, runId?: string): Promise<EngineResult> {
    const run = await this.getOrCreateRun(runId);

    switch (agentId) {
      case 'coordinator': {
        const decision = routeForStage(run.stage);
        return { runId: run.id, stage: run.stage, agentId, output: decision };
      }

      case 'lead-intake': {
        const lead = await this.runAndLog(run, 'lead-intake', text, undefined);
        const confidence = (lead as { confidence: number }).confidence;
        const nextStage: Stage = confidence >= 0.4 ? 'qualified' : 'new_lead';
        const updated = await this.memory.updateRun(run.id, { stage: nextStage, artifacts: { lead } });
        return { runId: run.id, stage: updated.stage, agentId, output: lead };
      }

      case 'strategy': {
        const strategy = await this.runAndLog(run, 'strategy', text, { lead: run.artifacts.lead });
        const updated = await this.memory.updateRun(run.id, { stage: 'strategy_drafted', artifacts: { strategy } });
        return { runId: run.id, stage: updated.stage, agentId, output: strategy };
      }

      case 'proposal': {
        const proposal = await this.runAndLog(run, 'proposal', text, { strategy: run.artifacts.strategy });
        const updated = await this.memory.updateRun(run.id, { stage: 'proposal_ready', artifacts: { proposal } });
        return { runId: run.id, stage: updated.stage, agentId, output: proposal };
      }

      case 'operations': {
        if (run.stage !== 'ops_ready' && run.stage !== 'in_execution' && run.stage !== 'completed') {
          return {
            runId: run.id,
            stage: run.stage,
            agentId,
            output: {
              blockedReason:
                run.stage === 'awaiting_approval'
                  ? 'La propuesta está pendiente de aprobación humana antes de pasar a Operaciones.'
                  : 'Todavía no hay una propuesta aprobada para este run: pasa antes por Estrategia y Propuestas.',
            },
          };
        }
        const operations = await this.runAndLog(run, 'operations', text, { proposal: run.artifacts.proposal });
        const updated = await this.memory.updateRun(run.id, { stage: 'in_execution', artifacts: { operations } });
        return { runId: run.id, stage: updated.stage, agentId, output: operations };
      }

      case 'content': {
        // Content is a side quest (estructura/docs/workflows/content-from-deliverables.md):
        // it never gates or advances the main pipeline stage.
        const content = await this.runAndLog(run, 'content', text, { lead: run.artifacts.lead });
        await this.memory.updateRun(run.id, { artifacts: { content } });
        return { runId: run.id, stage: run.stage, agentId, output: content };
      }

      case 'review-qa': {
        if (run.stage === 'proposal_ready') {
          const qa = await this.runAndLog(run, 'review-qa', text, { subject: 'la propuesta', artifact: run.artifacts.proposal });
          await this.memory.updateRun(run.id, { artifacts: { qa } });
          if ((qa as { pass: boolean }).pass) {
            const approval = await this.approvals.request(
              run.id,
              'advance_to_ops',
              'La propuesta pasó QA y está lista para pasar a Operaciones.',
            );
            await this.memory.updateRun(run.id, { stage: 'awaiting_approval' });
            return { runId: run.id, stage: 'awaiting_approval', agentId, output: qa, approvalRequestId: approval.id };
          }
          return { runId: run.id, stage: 'proposal_ready', agentId, output: qa };
        }

        if (run.stage === 'in_execution') {
          const qa = await this.runAndLog(run, 'review-qa', text, { subject: 'el plan de operaciones', artifact: run.artifacts.operations });
          const pass = (qa as { pass: boolean }).pass;
          const updated = await this.memory.updateRun(run.id, { stage: pass ? 'completed' : 'blocked', artifacts: { qa } });
          return { runId: run.id, stage: updated.stage, agentId, output: qa };
        }

        return {
          runId: run.id,
          stage: run.stage,
          agentId,
          output: { blockedReason: 'Todavía no hay nada listo para revisar en esta etapa del run.' },
        };
      }
    }
  }

  async decideApproval(runId: string, approved: boolean): Promise<ApprovalRequest> {
    const run = await this.memory.getRun(runId);
    if (!run) throw new Error(`Unknown run: ${runId}`);
    const decided = await this.approvals.decide(runId, approved);
    await this.memory.updateRun(runId, { stage: approved ? 'ops_ready' : 'blocked' });
    return decided;
  }
}
