// F3-T4: Decision engine — orchestrates respond / handoff / abstain.
// Uses service-role client for DB state transitions.

import { createClient as createSbClient } from "@supabase/supabase-js";
import {
  aiShouldRespond,
  canTransition,
  detectsHandoffTrigger,
  type ConversationState,
} from "./state-machine";
import { checkRateLimits } from "./cost-tracker";
import { getEnabledTools } from "@/features/tools/services/tool-configs";
import type { Tool } from "@/features/tools/core/tool";
import { checkSensitiveSignal, flagNeedsAttentionForContact } from "@/features/reminders/services/sensitive-guard";

function svc() {
  return createSbClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export type Decision = "respond" | "handoff" | "abstain" | "rate_limited";

export interface DecisionResult {
  decision: Decision;
  reason: string;
  availableTools?: Tool[];
}

/** Shared by both handoff paths (keyword phrase, sensitive signal) — flips the conversation to handoff_pending and logs it. */
async function applyHandoffTransition(
  supabase: ReturnType<typeof svc>,
  conversationId: string,
  workspaceId: string,
  currentState: ConversationState,
  trigger: string,
): Promise<void> {
  const { error: updateError } = await supabase
    .from("conversations")
    .update({
      state: "handoff_pending",
      ai_enabled: false,
      updated_at: new Date().toISOString(),
    })
    .eq("id", conversationId);

  if (updateError) {
    console.error(
      "[decision-engine] failed to transition to handoff_pending:",
      updateError,
    );
    return;
  }

  await supabase.from("events").insert({
    type: "state_change",
    level: "info",
    workspace_id: workspaceId,
    conversation_id: conversationId,
    payload: {
      from: currentState,
      to: "handoff_pending",
      trigger,
      actor: "system",
    },
  });
}

/**
 * Decides whether the AI should respond, trigger a handoff, or abstain.
 *
 * Flow:
 *   1. Load conversation state from DB
 *   2. If state !== 'ai_active' → abstain
 *   3. detectsHandoffTrigger → if true, transition to handoff_pending and log
 *   4. checkRateLimits → if exceeded, return rate_limited
 *   5. → respond
 */
export async function decide(opts: {
  workspaceId: string;
  conversationId: string;
  mergedText: string;
  contactId: string;
}): Promise<DecisionResult> {
  const { workspaceId, conversationId, mergedText, contactId } = opts;
  const supabase = svc();

  // 1. Load conversation state
  const { data: conv, error: convError } = await supabase
    .from("conversations")
    .select("state")
    .eq("id", conversationId)
    .single();

  if (convError || !conv) {
    console.error("[decision-engine] failed to load conversation:", convError);
    return { decision: "abstain", reason: "conversation_not_found" };
  }

  const currentState = conv.state as ConversationState;

  // 2. Check if AI should respond in current state
  if (!aiShouldRespond(currentState)) {
    return { decision: "abstain", reason: `state:${currentState}` };
  }

  // 3a. Reminders/follow-up safety net: a business-configured sensitive
  // keyword (pain, fever, pus, worrying inflammation...) always forces a
  // human handoff and pauses that contact's automated sequence — the AI is
  // never trusted to judge this itself. Additive: a no-op for workspaces
  // that don't have the reminders engine enabled.
  const sensitiveCheck = await checkSensitiveSignal(workspaceId, mergedText);
  if (sensitiveCheck.matched) {
    if (canTransition(currentState, "handoff_pending")) {
      await applyHandoffTransition(supabase, conversationId, workspaceId, currentState, "sensitive_signal");
    }
    void flagNeedsAttentionForContact(contactId, sensitiveCheck.keyword ?? "").catch((err) =>
      console.error("[decision-engine] flagNeedsAttentionForContact failed:", err),
    );
    return { decision: "handoff", reason: "sensitive_signal" };
  }

  // 3b. Detect handoff trigger in message text
  if (detectsHandoffTrigger(mergedText)) {
    // Validate the transition is legal before applying
    if (canTransition(currentState, "handoff_pending")) {
      await applyHandoffTransition(supabase, conversationId, workspaceId, currentState, "keyword");
    }

    return { decision: "handoff", reason: "handoff_trigger" };
  }

  // 4. Rate limit check
  const { allowed, reason: rateLimitReason } = await checkRateLimits(
    workspaceId,
    contactId,
  );

  if (!allowed) {
    return {
      decision: "rate_limited",
      reason: rateLimitReason ?? "rate_limited",
    };
  }

  // 5. All checks passed — load enabled tools and respond
  const availableTools = await getEnabledTools(workspaceId);
  return { decision: "respond", reason: "normal", availableTools };
}

/**
 * Applies a validated state transition to a conversation.
 * Logs the transition to the events table.
 * If transitioning to human_active and userId is provided, sets assigned_to.
 */
export async function applyTransition(
  conversationId: string,
  to: ConversationState,
  userId?: string,
): Promise<void> {
  const supabase = svc();

  // 1. Load current state
  const { data: conv, error: convError } = await supabase
    .from("conversations")
    .select("state, workspace_id")
    .eq("id", conversationId)
    .single();

  if (convError || !conv) {
    throw new Error(
      `[decision-engine] conversation not found: ${convError?.message}`,
    );
  }

  const currentState = conv.state as ConversationState;

  // 2. Validate transition (throws TransitionError if invalid)
  if (!canTransition(currentState, to)) {
    const { TransitionError } = await import("./state-machine");
    throw new TransitionError(currentState, to);
  }

  // 3. Build the update payload
  const updatePayload: Record<string, unknown> = {
    state: to,
    ai_enabled: to === "ai_active",
    updated_at: new Date().toISOString(),
  };

  if (to === "human_active" && userId) {
    updatePayload.assigned_to = userId;
  }

  const { error: updateError } = await supabase
    .from("conversations")
    .update(updatePayload)
    .eq("id", conversationId);

  if (updateError) {
    throw new Error(
      `[decision-engine] failed to apply transition: ${updateError.message}`,
    );
  }

  // 4. Log the state change to events
  await supabase.from("events").insert({
    type: "state_change",
    level: "info",
    workspace_id: conv.workspace_id,
    conversation_id: conversationId,
    payload: {
      from: currentState,
      to,
      actor: userId ?? "system",
    },
  });
}
