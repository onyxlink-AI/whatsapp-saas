import { createClient as svcClient } from "@supabase/supabase-js";
import { getWorkspaceModel } from "@/features/inbox/services/openrouter";
import { resolveSystemPrompt } from "@/features/inbox/services/prompt-resolver";
import type { PromptGuardrails } from "@/features/inbox/services/prompt-builder";
import type { AgentConfig, AgentType } from "@/features/agents/types";

// Shared by the test-chat playground and its "Evaluar conversación" companion
// route — both need the same agent lookup (with the same cross-workspace IDOR
// guard) and the same draft-or-published prompt resolution.

function svc() {
  return svcClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export interface TestAgentRow {
  id: string;
  workspace_id: string;
  type: AgentType;
  name: string;
  model: string | null;
  config: AgentConfig;
}

export async function loadTestAgent(
  workspaceId: string,
  agentId: string,
): Promise<TestAgentRow | null> {
  const db = svc();
  const { data: agent } = await db
    .from("agents")
    .select("id, workspace_id, type, name, model, config")
    .eq("id", agentId)
    .maybeSingle();
  if (!agent || agent.workspace_id !== workspaceId) return null;
  return agent as TestAgentRow;
}

export async function resolveTestModel(
  workspaceId: string,
  agent: TestAgentRow,
  modelOverride?: string,
): Promise<string> {
  return (
    modelOverride ?? agent.model ?? (await getWorkspaceModel(workspaceId))
  );
}

export interface ResolvedTestPrompt {
  promptBody: string;
  guardrails: PromptGuardrails | null;
}

export async function resolveTestPrompt(
  workspaceId: string,
  agentType: AgentType,
  draftPromptBody?: string,
): Promise<ResolvedTestPrompt> {
  if (draftPromptBody) return { promptBody: draftPromptBody, guardrails: null };

  const resolved = await resolveSystemPrompt(workspaceId, { mode: agentType });
  return {
    promptBody:
      resolved?.body ??
      "Eres un asistente de WhatsApp. Responde de forma concisa y útil en español.",
    guardrails: resolved?.guardrails ?? null,
  };
}
