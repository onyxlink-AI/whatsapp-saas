import { NextResponse } from "next/server";
import { processDueReminderJobs } from "@/features/reminders/services/reminder-sender";

// ──────────────────────────────────────────────────────────────────────────────
// Cron: reminders & follow-up engine — runs every 10 minutes (registered via
// pg_cron + pg_net, same mechanism as appointment-reminders/buffer-flush, see
// supabase/cron/schedule-reminders-process.sql). Claims due jobs across every
// workspace in one pass via claim_due_reminder_jobs() (FOR UPDATE SKIP LOCKED,
// same concurrency-safe pattern as buffer-flush's claim_next_batch()).
// ──────────────────────────────────────────────────────────────────────────────

export const schedule = "*/10 * * * *"; // reference only — actual schedule lives in pg_cron

export async function GET(request: Request): Promise<NextResponse> {
  const authHeader = request.headers.get("Authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await processDueReminderJobs();
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error(
      "[cron/reminders/process] failed:",
      err instanceof Error ? err.message : err,
    );
    return NextResponse.json({ ok: false, error: "internal error" }, { status: 500 });
  }
}
