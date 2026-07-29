import { createClient as createSbClient } from "@supabase/supabase-js";
import { cancelJobsForContact } from "./job-scheduling";

function svc() {
  return createSbClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

// "Pausa por contacto" — distinct from cancelling one appointment's jobs
// (pauseJobsForAppointment) and from a full opt-out (contacts.opt_in=false):
// this stops the automated sequence for a specific contact across every
// appointment, but is explicitly reversible without needing opt_in touched.

export async function isContactPaused(
  workspaceId: string,
  contactId: string,
): Promise<boolean> {
  const db = svc();
  const { data } = await db
    .from("reminder_contact_pauses")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("contact_id", contactId)
    .maybeSingle();
  return Boolean(data);
}

/** Pauses the contact AND immediately cancels every pending job for them. */
export async function pauseContact(
  workspaceId: string,
  contactId: string,
  reason?: string,
): Promise<void> {
  const db = svc();
  const { error } = await db
    .from("reminder_contact_pauses")
    .upsert(
      { workspace_id: workspaceId, contact_id: contactId, reason: reason ?? null },
      { onConflict: "workspace_id,contact_id" },
    );
  if (error) {
    throw new Error(`No se pudo pausar el seguimiento del contacto: ${error.message}`);
  }
  await cancelJobsForContact(contactId, "contact_paused");
}

/** Lifts the pause. Does NOT recreate jobs — future appointments/reschedules will schedule normally again. */
export async function resumeContact(workspaceId: string, contactId: string): Promise<void> {
  const db = svc();
  const { error } = await db
    .from("reminder_contact_pauses")
    .delete()
    .eq("workspace_id", workspaceId)
    .eq("contact_id", contactId);
  if (error) {
    throw new Error(`No se pudo reanudar el seguimiento del contacto: ${error.message}`);
  }
}
