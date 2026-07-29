import { createClient as createSbClient } from "@supabase/supabase-js";
import { cancelJobsForContactCategory } from "./job-scheduling";

function svc() {
  return createSbClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export type ConsentCategory = "appointment_reminders" | "aftercare_followup" | "review_request";
export const CONSENT_CATEGORIES: ConsentCategory[] = [
  "appointment_reminders",
  "aftercare_followup",
  "review_request",
];

export interface ConsentRow {
  id: string;
  workspace_id: string;
  contact_id: string;
  category: ConsentCategory;
  status: "granted" | "withdrawn";
  granted_at: string | null;
  withdrawn_at: string | null;
  method: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * contacts.opt_in is a blanket "will receive WhatsApp at all" flag — it is
 * NEVER sufficient on its own to authorize a reminders send. Each category
 * needs its own explicit `granted` row here; nothing is ever inferred from
 * opt_in, from a different category, or from the mere existence of an
 * appointment.
 */
export async function hasGrantedConsent(
  workspaceId: string,
  contactId: string,
  category: ConsentCategory,
): Promise<boolean> {
  const db = svc();
  const { data } = await db
    .from("reminder_consents")
    .select("status")
    .eq("workspace_id", workspaceId)
    .eq("contact_id", contactId)
    .eq("category", category)
    .maybeSingle();
  return (data as { status: string } | null)?.status === "granted";
}

export async function getConsents(
  workspaceId: string,
  contactId: string,
): Promise<ConsentRow[]> {
  const db = svc();
  const { data } = await db
    .from("reminder_consents")
    .select("*")
    .eq("workspace_id", workspaceId)
    .eq("contact_id", contactId);
  return (data as ConsentRow[] | null) ?? [];
}

/** Upserts a `granted` row. Never overwrites history — granted_at is refreshed, withdrawn_at cleared, the row itself persists forever (never deleted). */
export async function grantConsent(
  workspaceId: string,
  contactId: string,
  category: ConsentCategory,
  method: string,
): Promise<ConsentRow> {
  const db = svc();
  const now = new Date().toISOString();
  const { data, error } = await db
    .from("reminder_consents")
    .upsert(
      {
        workspace_id: workspaceId,
        contact_id: contactId,
        category,
        status: "granted",
        granted_at: now,
        withdrawn_at: null,
        method,
      },
      { onConflict: "workspace_id,contact_id,category" },
    )
    .select("*")
    .single();

  if (error || !data) {
    throw new Error(`No se pudo registrar el consentimiento: ${error?.message}`);
  }
  return data as ConsentRow;
}

/**
 * Withdraws consent for exactly one category — the row is kept (status
 * flips to 'withdrawn', withdrawn_at stamped), never deleted. Cancels only
 * the pending jobs of that same category (see job-scheduling.ts), never the
 * whole contact — a full stop is the separate, existing opt_in=false path.
 */
export async function withdrawConsent(
  workspaceId: string,
  contactId: string,
  category: ConsentCategory,
): Promise<ConsentRow> {
  const db = svc();
  const { data, error } = await db
    .from("reminder_consents")
    .upsert(
      {
        workspace_id: workspaceId,
        contact_id: contactId,
        category,
        status: "withdrawn",
        withdrawn_at: new Date().toISOString(),
      },
      { onConflict: "workspace_id,contact_id,category" },
    )
    .select("*")
    .single();

  if (error || !data) {
    throw new Error(`No se pudo retirar el consentimiento: ${error?.message}`);
  }

  await cancelJobsForContactCategory(contactId, category, "consent_withdrawn");

  return data as ConsentRow;
}
