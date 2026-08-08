import { createClient as createSbClient } from "@supabase/supabase-js";
import { resolveHelpAssistantTier } from "./tier";
import { checkHelpAssistantQuota, recordHelpAssistantQuestion } from "./quota";
import { buildHelpAssistantSystemPrompt } from "./system-prompt";
import { generateHelpAssistantReply } from "./openrouter-client";
import { buildActionTools } from "./action-tools";
import { resolveEntitlements } from "@/features/entitlements/resolve";
import type { ChatTurn, HelpActionContext, HelpAssistantPlanContext } from "../types";

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
    .select("product_package, vapi_assistant_id, help_assistant_actions_enabled")
    .eq("id", opts.workspaceId)
    .maybeSingle();

  const entitlements = resolveEntitlements(workspace);

  // Off by default for every workspace — only Onyxlink (superadmin, from
  // Ajustes → Negocio) turns this on per client. Until then the assistant
  // stays text-only, matching the original behavior exactly.
  const actionsEnabled = workspace?.help_assistant_actions_enabled === true;

  const tierInfo = resolveHelpAssistantTier(entitlements);

  const quota = await checkHelpAssistantQuota(opts.workspaceId, tierInfo.weeklyLimit);
  if (!quota.allowed) {
    return { ok: false, code: "quota_exceeded", used: quota.used, limit: quota.limit };
  }

  const planContext: HelpAssistantPlanContext = {
    gestionEnabled: entitlements.hasGestion,
    whatsappAgentEnabled: entitlements.hasWhatsappAgent,
    officeVirtualEnabled: entitlements.hasOfficeVirtual,
    hasVoiceAgent: Boolean(workspace?.vapi_assistant_id),
    whiteboardEnabled: entitlements.hasWhiteboard,
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
