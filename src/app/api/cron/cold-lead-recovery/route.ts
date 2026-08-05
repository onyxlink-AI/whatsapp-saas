import { NextResponse } from "next/server";
import { createClient as createSbClient } from "@supabase/supabase-js";
import {
  isColdLeadRecoveryEnabled,
  runColdLeadRecoveryForWorkspace,
} from "@/features/inbox/services/cold-lead-recovery";

// ──────────────────────────────────────────────────────────────────────────────
// Cron: Recuperación de Leads Fríos con IA — runs once a day (registered via
// pg_cron + pg_net, same mechanism as buffer-flush, see
// supabase/cron/schedule-cold-lead-recovery.sql). Proactive, not tied to any
// inbound message. Scans every workspace with cold_lead_recovery_enabled and
// evaluates its cold contacts; each workspace is capped independently inside
// runColdLeadRecoveryForWorkspace, and this route additionally caps how many
// workspaces it processes per tick.
// ──────────────────────────────────────────────────────────────────────────────


const MAX_WORKSPACES_PER_RUN = 20;

function svc() {
  return createSbClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export async function GET(request: Request): Promise<NextResponse> {
  const authHeader = request.headers.get("Authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = svc();
  const { data: workspaces } = await supabase
    .from("workspaces")
    .select("id")
    .eq("cold_lead_recovery_enabled", true)
    .limit(MAX_WORKSPACES_PER_RUN);

  const results: Array<{
    workspaceId: string;
    evaluated: number;
    contacted: number;
    skipped: string | null;
  }> = [];

  for (const ws of workspaces ?? []) {
    const enabled = await isColdLeadRecoveryEnabled(ws.id);
    if (!enabled) continue; // re-check in case it was toggled off mid-run

    try {
      const result = await runColdLeadRecoveryForWorkspace(ws.id);
      results.push({ workspaceId: ws.id, ...result });
    } catch (err) {
      console.error(
        "[cron/cold-lead-recovery] workspace failed:",
        ws.id,
        err instanceof Error ? err.message : err,
      );
      results.push({
        workspaceId: ws.id,
        evaluated: 0,
        contacted: 0,
        skipped: "error",
      });
    }
  }

  return NextResponse.json({
    ok: true,
    workspacesProcessed: results.length,
    totalContacted: results.reduce((sum, r) => sum + r.contacted, 0),
    results,
  });
}
