import { createClient as createSbClient } from "@supabase/supabase-js";

/**
 * Weekly question quota for the in-app help assistant, tracked the same way
 * src/features/inbox/services/cost-tracker.ts tracks LLM usage: no dedicated
 * counter table, just `events` rows of a fixed `type`, counted within a
 * rolling time window (rolling 7 days here, not a calendar week — avoids a
 * "burst everything right after Monday 00:00 reset" edge case and needs no
 * new date-math helper).
 */
const EVENT_TYPE = "help_assistant_question";

function svc() {
  return createSbClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export interface QuotaStatus {
  allowed: boolean;
  used: number;
  limit: number;
}

/** Read-only check — does NOT consume quota. Call recordHelpAssistantQuestion after a successful reply. */
export async function checkHelpAssistantQuota(
  workspaceId: string,
  weeklyLimit: number,
): Promise<QuotaStatus> {
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const { count, error } = await svc()
    .from("events")
    .select("id", { count: "exact", head: true })
    .eq("type", EVENT_TYPE)
    .eq("workspace_id", workspaceId)
    .gte("created_at", weekAgo);

  if (error) {
    console.error("[help-assistant/quota] check error:", error);
    // Fail open — same stance as cost-tracker.ts's checkRateLimits.
    return { allowed: true, used: 0, limit: weeklyLimit };
  }

  const used = count ?? 0;
  return { allowed: used < weeklyLimit, used, limit: weeklyLimit };
}

interface RecordOpts {
  workspaceId: string;
  userId: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
}

/** Only call after a successful reply — a failed LLM call must never consume quota. */
export async function recordHelpAssistantQuestion(opts: RecordOpts): Promise<void> {
  const { error } = await svc()
    .from("events")
    .insert({
      type: EVENT_TYPE,
      level: "info",
      workspace_id: opts.workspaceId,
      conversation_id: null,
      payload: {
        user_id: opts.userId,
        model: opts.model,
        prompt_tokens: opts.promptTokens,
        completion_tokens: opts.completionTokens,
      },
    });

  if (error) {
    console.error("[help-assistant/quota] record error:", error);
  }
}
