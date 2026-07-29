import { createClient as createSbClient } from "@supabase/supabase-js";
import { detectsSensitiveSignal } from "../../inbox/services/state-machine";

// Safety-net for the follow-up sequence: the AI is never trusted to decide
// on its own whether a reply describes a medical concern — this is a plain
// keyword check (business-configured) applied additively in decide()
// (decision-engine.ts), same spirit as the existing detectsHandoffTrigger
// but for a workspace-configurable keyword list instead of a fixed phrase
// set. A match always wins over whatever the AI would have said.

function svc() {
  return createSbClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export interface SensitiveSignalCheck {
  matched: boolean;
  keyword?: string;
  cautiousMessage?: string;
}

/**
 * Read-only check: does this workspace have the reminders engine enabled,
 * AND does `mergedText` contain one of its configured sensitive keywords?
 * Callers decide what to do with a match (decide() forces handoff + pauses
 * the sequence) — this function never mutates anything.
 */
export async function checkSensitiveSignal(
  workspaceId: string,
  mergedText: string,
): Promise<SensitiveSignalCheck> {
  const db = svc();
  const { data: config } = await db
    .from("reminder_configs")
    .select("enabled, sensitive_keywords, sensitive_response_message")
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  if (!config || !(config as { enabled: boolean }).enabled) {
    return { matched: false };
  }

  const keywords = (config as { sensitive_keywords: string[] }).sensitive_keywords ?? [];
  const keyword = detectsSensitiveSignal(mergedText, keywords);
  if (!keyword) return { matched: false };

  return {
    matched: true,
    keyword,
    cautiousMessage:
      (config as { sensitive_response_message: string | null }).sensitive_response_message ??
      undefined,
  };
}

/**
 * Stops the automated sequence for this contact when a sensitive signal was
 * detected: cancels every not-yet-sent job (so nothing further goes out
 * automatically) and marks their most recent already-sent step as
 * `needs_attention` so it surfaces in the reminders history with a reason,
 * without erasing it (never delete history — only annotate).
 */
export async function flagNeedsAttentionForContact(
  contactId: string,
  keyword: string,
): Promise<void> {
  const db = svc();

  await db
    .from("reminder_jobs")
    .update({ status: "cancelled", cancel_reason: `needs_attention:${keyword}` })
    .eq("contact_id", contactId)
    .in("status", ["scheduled", "processing", "error"]);

  const { data: lastSent } = await db
    .from("reminder_jobs")
    .select("id")
    .eq("contact_id", contactId)
    .in("status", ["sent", "responded"])
    .order("sent_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (lastSent) {
    await db
      .from("reminder_jobs")
      .update({ status: "needs_attention", error_detail: `Señal sensible detectada: ${keyword}` })
      .eq("id", (lastSent as { id: string }).id);
  }
}
