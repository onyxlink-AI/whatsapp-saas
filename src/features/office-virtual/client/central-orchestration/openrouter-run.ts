import { z } from 'zod';
import { AgentIdSchema, type AgentId } from '../../schemas';
import {
  selectOpenRouterExecutionForAgent,
  type OpenRouterExecutionBlockerCode,
  type OpenRouterCostProfile,
  type WorkspaceOrchestratorBinding,
} from '../central-orchestrator';

export type OpenRouterRunBlockerCode = OpenRouterExecutionBlockerCode;

const IdentifierSchema = z.string().trim().min(1).max(200);
const TextSchema = z.string().trim().min(1).max(12_000);

export const OpenRouterRunRequestSchema = z
  .object({
    runId: IdentifierSchema,
    workspaceId: IdentifierSchema,
    agentId: AgentIdSchema,
    input: TextSchema,
    context: z.record(z.string(), z.unknown()).default({}),
    requestedBy: IdentifierSchema,
    occurredAt: z.string().datetime({ offset: true }),
  })
  .strict();

export type OpenRouterRunRequest = z.infer<typeof OpenRouterRunRequestSchema>;

export type PreparedOpenRouterRun = {
  runId: string;
  workspaceId: string;
  agentId: AgentId;
  input: string;
  context: Record<string, unknown>;
  model: string;
  fallbackModel: string | null;
  costProfile: OpenRouterCostProfile;
  dailyRequestLimit: number | null;
  monthlyRequestLimit: number | null;
  modelSource: 'workspace_default' | 'agent_override';
  requestedBy: string;
  occurredAt: string;
};

export type PrepareOpenRouterRunResult =
  | {
      status: 'prepared';
      request: OpenRouterRunRequest;
      run: PreparedOpenRouterRun;
    }
  | {
      status: 'rejected';
      runId: string | null;
      code:
        | 'invalid_run_request'
        | 'workspace_mismatch'
        | 'orchestrator_not_openrouter'
        | 'openrouter_not_connected'
        | OpenRouterRunBlockerCode;
      blockers?: OpenRouterRunBlockerCode[];
      issues?: { path: string; message: string }[];
    };

function validationIssues(error: z.ZodError): { path: string; message: string }[] {
  return error.issues.map((issue) => ({
    path: issue.path.length > 0 ? issue.path.join('.') : '$',
    message: issue.message,
  }));
}

function runIdFrom(input: unknown): string | null {
  return typeof input === 'object' && input !== null && 'runId' in input && typeof input.runId === 'string'
    ? input.runId
    : null;
}

function firstBlocker(blockers: OpenRouterRunBlockerCode[]): OpenRouterRunBlockerCode {
  return blockers[0] ?? 'model_missing';
}

export function prepareOpenRouterAgentRun(
  orchestrator: WorkspaceOrchestratorBinding,
  input: unknown,
): PrepareOpenRouterRunResult {
  const parsed = OpenRouterRunRequestSchema.safeParse(input);
  if (!parsed.success) {
    return {
      status: 'rejected',
      runId: runIdFrom(input),
      code: 'invalid_run_request',
      issues: validationIssues(parsed.error),
    };
  }

  const request = parsed.data;
  if (request.workspaceId !== orchestrator.workspaceId) {
    return { status: 'rejected', runId: request.runId, code: 'workspace_mismatch' };
  }
  const execution = selectOpenRouterExecutionForAgent(orchestrator, request.agentId);
  if (!execution.ready) {
    const blockers = execution.blockers;
    return {
      status: 'rejected',
      runId: request.runId,
      code: firstBlocker(blockers),
      blockers,
    };
  }

  const resolved = execution.model;

  if (!resolved.model) {
    return { status: 'rejected', runId: request.runId, code: 'model_missing', blockers: ['model_missing'] };
  }

  return {
    status: 'prepared',
    request,
    run: {
      runId: request.runId,
      workspaceId: request.workspaceId,
      agentId: request.agentId,
      input: request.input,
      context: request.context,
      model: resolved.model,
      fallbackModel: resolved.fallbackModel,
      costProfile: resolved.costProfile,
      dailyRequestLimit: resolved.dailyRequestLimit,
      monthlyRequestLimit: resolved.monthlyRequestLimit,
      modelSource: resolved.source,
      requestedBy: request.requestedBy,
      occurredAt: request.occurredAt,
    },
  };
}
