import { createClient as createSbClient } from "@supabase/supabase-js";
import { resolveHelpAssistantTier } from "./tier";
import { checkHelpAssistantQuota, recordHelpAssistantQuestion } from "./quota";
import { buildHelpAssistantSystemPrompt } from "./system-prompt";
import { generateHelpAssistantReply } from "./openrouter-client";
import { buildActionTools } from "./action-tools";
import type {
  ChatTurn,
  HelpActionContext,
  HelpAssistantPlanContext,
  WorkspacePlanFlags,
} from "../types";

function svc() {
  return createSbClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export type AskHelpAssistantResult =
  | { ok: true; text: string; used: number; limit: number }
  | { ok: false; code: "quota_exceeded"; used: number; limit: number }
  | { ok: false; code: "internal_error" };

export async function askHelpAssistant(opts: {
  workspaceId: string;
  userId: string;
  message: string;
  history: ChatTurn[];
}): Promise<AskHelpAssistantResult> {
  const { data: workspace } = await svc()
    .from("workspaces")
    .select(
      "gestion_enabled, whatsapp_agent_enabled, office_virtual_enabled, vapi_assistant_id, help_assistant_actions_enabled",
    )
    .eq("id", opts.workspaceId)
    .maybeSingle();

  const flags = (workspace as
    | (WorkspacePlanFlags & {
        vapi_assistant_id: string | null;
        help_assistant_actions_enabled: boolean | null;
      })
    | null) ?? {
    gestion_enabled: false,
    whatsapp_agent_enabled: true,
    office_virtual_enabled: false,
    vapi_assistant_id: null,
    help_assistant_actions_enabled: false,
  };

  // Off by default for every workspace — only Onyxlink (superadmin, from
  // Ajustes → Negocio) turns this on per client. Until then the assistant
  // stays text-only, matching the original behavior exactly.
  const actionsEnabled = flags.help_assistant_actions_enabled === true;

  const tierInfo = resolveHelpAssistantTier(flags);

  const quota = await checkHelpAssistantQuota(opts.workspaceId, tierInfo.weeklyLimit);
  if (!quota.allowed) {
    return { ok: false, code: "quota_exceeded", used: quota.used, limit: quota.limit };
  }

  const planContext: HelpAssistantPlanContext = {
    gestionEnabled: flags.gestion_enabled === true,
    whatsappAgentEnabled: flags.whatsapp_agent_enabled !== false,
    officeVirtualEnabled: flags.office_virtual_enabled === true,
    hasVoiceAgent: Boolean(flags.vapi_assistant_id),
  };

  const actionCtx: HelpActionContext = { workspaceId: opts.workspaceId, actorUserId: opts.userId };

  let reply;
  try {
    reply = await generateHelpAssistantReply({
      systemPrompt: buildHelpAssistantSystemPrompt(planContext, actionsEnabled),
      messages: [...opts.history, { role: "user", content: opts.message }],
      tools: actionsEnabled ? buildActionTools(actionCtx, planContext) : undefined,
    });
  } catch (error) {
    console.error("[help-assistant] generateHelpAssistantReply error:", error);
    return { ok: false, code: "internal_error" };
  }

  // Best-effort: a failed usage-counter write must never turn a successful
  // answer into an error response for the user.
  await recordHelpAssistantQuestion({
    workspaceId: opts.workspaceId,
    userId: opts.userId,
    model: "openai/gpt-4o-mini",
    promptTokens: reply.promptTokens,
    completionTokens: reply.completionTokens,
  });

  return { ok: true, text: reply.text, used: quota.used + 1, limit: quota.limit };
}
