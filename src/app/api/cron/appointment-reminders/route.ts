import { NextResponse } from "next/server";
import { sendDueReminders } from "@/features/inbox/services/appointment-reminders";

// ──────────────────────────────────────────────────────────────────────────────
// Cron: appointment reminders — runs every 15 minutes (registered via
// pg_cron + pg_net, same mechanism as buffer-flush/cold-lead-recovery, see
// supabase/cron/schedule-appointment-reminders.sql). Scans every workspace's
// appointments due in the next 2h across the whole DB in one pass — no
// per-workspace loop needed, sendDueReminders() already scopes correctly via
// each appointment's own workspace_id.
// ──────────────────────────────────────────────────────────────────────────────

export const schedule = "*/15 * * * *"; // reference only — actual schedule lives in pg_cron

export async function GET(request: Request): Promise<NextResponse> {
  const authHeader = request.headers.get("Authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await sendDueReminders();
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error(
      "[cron/appointment-reminders] failed:",
      err instanceof Error ? err.message : err,
    );
    return NextResponse.json({ ok: false, error: "internal error" }, { status: 500 });
  }
}
