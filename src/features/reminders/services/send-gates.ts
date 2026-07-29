import { createClient as createSbClient } from "@supabase/supabase-js";
import { getApprovedTemplates } from "../../inbox/services/template-actions";
import type { TemplateRow } from "../../inbox/services/templates";
import { getOrCreateReminderConfig } from "./reminder-config";
import { getReminderReadiness } from "./readiness";
import { isLiveSendingEnabled, isPhoneAllowlisted } from "./live-sending-guard";
import { hasGrantedConsent, type ConsentCategory } from "./consent";
import { adjustToAllowedWindow, startOfLocalDay } from "../lib/scheduling";
import type { SendBlockReason, SendGateResult } from "../lib/send-guard-types";

// Single source of truth for "can/would this message actually go out right
// now" — called by BOTH the real sender (reminder-sender.ts, before it ever
// reaches dispatchTemplate) and the safe simulator (/reminders/simulate, to
// show "por qué estaría bloqueado" without sending anything). They can never
// silently disagree because there is only one implementation.

function svc() {
  return createSbClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export interface SendGateInput {
  workspaceId: string;
  contactId: string | null;
  /** E.164, only known once a real contact exists — allowlist check is skipped (not "passed") when absent. */
  phone: string | null;
  category: ConsentCategory;
  stepKey: string;
}

/** Approved template for this step: exact name match first, then any approved 'utility' template — same convention appointment-reminders.ts already uses. Reads the live `templates` table, never a fixture/in-memory value. */
export async function findApprovedTemplateForStep(
  workspaceId: string,
  stepKey: string,
): Promise<TemplateRow | null> {
  const templates = await getApprovedTemplates(workspaceId);
  return (
    templates.find((t) => t.name === stepKey) ??
    templates.find((t) => t.category === "utility") ??
    null
  );
}

export async function evaluateSendGates(input: SendGateInput): Promise<SendGateResult> {
  const { workspaceId, contactId, phone, category, stepKey } = input;
  const reasons: SendBlockReason[] = [];
  const db = svc();

  // 1. Global kill switch — checked first, always, no DB needed.
  if (!isLiveSendingEnabled()) {
    reasons.push("live_sending_disabled");
  }

  // 2. Allowlist — only meaningful once a real phone is known.
  if (phone && !isPhoneAllowlisted(phone)) {
    reasons.push("recipient_not_allowlisted");
  }

  const config = await getOrCreateReminderConfig(workspaceId);
  if (config.paused_at) {
    reasons.push("workspace_paused");
  }

  // 3. Infra readiness (agent/WhatsApp/OpenRouter) — same checks the UI's
  // requirement checklist already uses, folded in here so the simulator and
  // sender see one unified list instead of two separate ones to merge.
  const readiness = await getReminderReadiness(workspaceId);
  if (!readiness.agentConfigured) reasons.push("agent_not_configured");
  if (!readiness.whatsappConnected) reasons.push("whatsapp_not_connected");
  if (!readiness.openRouterAvailable) reasons.push("openrouter_not_available");

  if (contactId) {
    const { data: contact } = await db
      .from("contacts")
      .select("opt_in")
      .eq("id", contactId)
      .maybeSingle();
    if (contact && (contact as { opt_in: boolean }).opt_in === false) {
      reasons.push("opted_out");
    }

    const { data: pause } = await db
      .from("reminder_contact_pauses")
      .select("id")
      .eq("workspace_id", workspaceId)
      .eq("contact_id", contactId)
      .maybeSingle();
    if (pause) reasons.push("contact_paused");

    const granted = await hasGrantedConsent(workspaceId, contactId, category);
    if (!granted) reasons.push("consent_missing");

    // Daily limit — count of real sends today (workspace-local calendar day).
    const dayStart = startOfLocalDay(new Date(), config.timezone).toISOString();
    const { count: sentToday } = await db
      .from("reminder_jobs")
      .select("id", { count: "exact", head: true })
      .eq("contact_id", contactId)
      .eq("status", "sent")
      .gte("sent_at", dayStart);
    if ((sentToday ?? 0) >= config.max_messages_per_contact_per_day) {
      reasons.push("daily_limit_reached");
    }

    // Minimum separation since the last real send to this contact.
    const { data: lastSent } = await db
      .from("reminder_jobs")
      .select("sent_at")
      .eq("contact_id", contactId)
      .eq("status", "sent")
      .order("sent_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const lastSentAt = (lastSent as { sent_at: string } | null)?.sent_at;
    if (lastSentAt) {
      const elapsedMinutes = (Date.now() - new Date(lastSentAt).getTime()) / 60_000;
      if (elapsedMinutes < config.min_minutes_between_messages) {
        reasons.push("too_soon_after_last_message");
      }
    }
  }

  const template = await findApprovedTemplateForStep(workspaceId, stepKey);
  if (!template) reasons.push("template_not_approved");

  // "Right now" window check — relevant for the simulator's "if I sent this
  // literally right now" preview. Real scheduled jobs are pre-adjusted into
  // the window at schedule time (see scheduling.ts), so this rarely fires
  // for them, but it's a real, honest check either way.
  const now = new Date();
  const adjusted = adjustToAllowedWindow(now, {
    timezone: config.timezone,
    startMinute: config.send_window_start_minute,
    endMinute: config.send_window_end_minute,
  });
  if (adjusted.adjusted) reasons.push("outside_allowed_hours");

  return { allowed: reasons.length === 0, blockedReasons: reasons };
}
