"use server";

/**
 * voice-calls.ts — Server actions reading voice_calls (populated by the
 * /api/webhooks/vapi handler, never written from the client). Uses the
 * RLS-respecting cookie-session client — access control is the
 * "ws members read voice_calls" policy, same pattern as task-actions.ts.
 */

import { createClient } from "@/lib/supabase/server";

export interface VoiceCallRow {
  id: string;
  vapiCallId: string;
  startedAt: string | null;
  endedAt: string | null;
  durationSeconds: number | null;
  cost: number | null;
  customerNumber: string | null;
  transcript: string | null;
  summary: string | null;
  leadStatus: string | null;
  endedReason: string | null;
  createdAt: string;
}

export interface VoiceCallMetrics {
  totalCost: number;
  totalCalls: number;
  callsWithLead: number;
  avgDurationSeconds: number;
  callsByDay: { date: string; count: number }[];
  outcomeBreakdown: { status: string; count: number }[];
}

const NON_LEAD_STATUSES = new Set(["incomplete", "not_relevant"]);

/** Metrics over the last 90 days, aggregated in JS — call volume here is low
 * enough that a SQL aggregate function would be premature. */
export async function getVoiceCallMetrics(
  workspaceId: string,
): Promise<VoiceCallMetrics> {
  const empty: VoiceCallMetrics = {
    totalCost: 0,
    totalCalls: 0,
    callsWithLead: 0,
    avgDurationSeconds: 0,
    callsByDay: [],
    outcomeBreakdown: [],
  };

  const since = new Date();
  since.setDate(since.getDate() - 90);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("voice_calls")
    .select("cost, duration_seconds, lead_status, created_at")
    .eq("workspace_id", workspaceId)
    .gte("created_at", since.toISOString());

  if (error || !data) {
    if (error) console.error("[voice-calls] getVoiceCallMetrics error:", error);
    return empty;
  }

  const totalCalls = data.length;
  const totalCost = data.reduce((sum, r) => sum + (Number(r.cost) || 0), 0);
  const durations = data
    .map((r) => r.duration_seconds as number | null)
    .filter((d): d is number => typeof d === "number");
  const avgDurationSeconds =
    durations.length > 0
      ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
      : 0;
  const callsWithLead = data.filter((r) => {
    const status = r.lead_status as string | null;
    return status !== null && !NON_LEAD_STATUSES.has(status);
  }).length;

  const dayBuckets = new Map<string, number>();
  const days: string[] = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    days.push(key);
    dayBuckets.set(key, 0);
  }
  for (const r of data) {
    const key = (r.created_at as string).slice(0, 10);
    if (dayBuckets.has(key)) dayBuckets.set(key, (dayBuckets.get(key) ?? 0) + 1);
  }
  const callsByDay = days.map((date) => ({ date, count: dayBuckets.get(date) ?? 0 }));

  const outcomeCounts = new Map<string, number>();
  for (const r of data) {
    const status = (r.lead_status as string | null) ?? "sin_estado";
    outcomeCounts.set(status, (outcomeCounts.get(status) ?? 0) + 1);
  }
  const outcomeBreakdown = Array.from(outcomeCounts.entries())
    .map(([status, count]) => ({ status, count }))
    .sort((a, b) => b.count - a.count);

  return { totalCost, totalCalls, callsWithLead, avgDurationSeconds, callsByDay, outcomeBreakdown };
}

export async function listVoiceCalls(
  workspaceId: string,
  opts: { limit?: number; offset?: number; leadStatus?: string } = {},
): Promise<{ rows: VoiceCallRow[]; total: number }> {
  const limit = opts.limit ?? 20;
  const offset = opts.offset ?? 0;

  const supabase = await createClient();
  let query = supabase
    .from("voice_calls")
    .select(
      "id, vapi_call_id, started_at, ended_at, duration_seconds, cost, customer_number, transcript, summary, lead_status, ended_reason, created_at",
      { count: "exact" },
    )
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (opts.leadStatus) {
    query = query.eq("lead_status", opts.leadStatus);
  }

  const { data, error, count } = await query;

  if (error || !data) {
    if (error) console.error("[voice-calls] listVoiceCalls error:", error);
    return { rows: [], total: 0 };
  }

  return {
    rows: data.map((r) => ({
      id: r.id as string,
      vapiCallId: r.vapi_call_id as string,
      startedAt: r.started_at as string | null,
      endedAt: r.ended_at as string | null,
      durationSeconds: r.duration_seconds as number | null,
      cost: r.cost !== null ? Number(r.cost) : null,
      customerNumber: r.customer_number as string | null,
      transcript: r.transcript as string | null,
      summary: r.summary as string | null,
      leadStatus: r.lead_status as string | null,
      endedReason: r.ended_reason as string | null,
      createdAt: r.created_at as string,
    })),
    total: count ?? 0,
  };
}
