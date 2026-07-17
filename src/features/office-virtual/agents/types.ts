import type { AgentId } from '../schemas';

export type RunnerContext = {
  runId: string;
  artifacts: Record<string, unknown>;
};

/**
 * Every specialist is a pure function: input + context in, schema-valid
 * output out. Placeholder runners implement this with deterministic
 * heuristics (see docs/implementation-roadmap.md Phase 1: "6 agent specs
 * wired as placeholders"). A future phase can swap the body for a real LLM
 * call — driven by the matching file in /prompts — without touching this
 * interface or the orchestrator.
 */
export type AgentRunner<TInput, TOutput> = {
  id: AgentId;
  promptVersion: string;
  run(input: TInput, ctx: RunnerContext): Promise<TOutput>;
};
