/**
 * audit-log.ts — records and lists who changed what (prompts, agents, tools,
 * integrations) and when. Written only from trusted server code, right after
 * a mutation the caller already authorized via requireWorkspaceMember.
 *
 * Never pass credential/secret VALUES into `metadata` — only provider names,
 * ids, and which fields changed. The audit log is meant to be safely
 * readable by any workspace member.
 */
import { createClient as createSbClient } from "@supabase/supabase-js";

function svc() {
  return createSbClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export interface LogAuditParams {
  workspaceId: string;
  actorUserId: string;
  action: string;
  targetType: string;
  targetId?: string;
  summary: string;
  metadata?: Record<string, unknown>;
}

/**
 * Best-effort: a logging failure is caught and logged to console, never
 * thrown, so an audit-log hiccup can't block the mutation it's describing.
 */
export async function logAudit(params: LogAuditParams): Promise<void> {
  const supabase = svc();
  try {
    const { data: actor } = await supabase
      .from("users")
      .select("full_name, email")
      .eq("id", params.actorUserId)
      .maybeSingle();

    const { error } = await supabase.from("audit_log").insert({
      workspace_id: params.workspaceId,
      actor_user_id: params.actorUserId,
      actor_name: (actor?.full_name as string | null) ?? "Desconocido",
      actor_email: (actor?.email as string | null) ?? "desconocido",
      action: params.action,
      target_type: params.targetType,
      target_id: params.targetId ?? null,
      summary: params.summary,
      metadata: params.metadata ?? {},
    });

    if (error) throw error;
  } catch (err) {
    console.error("[audit-log] failed to record entry:", err);
  }
}

export interface AuditLogEntry {
  id: string;
  actorName: string;
  actorEmail: string;
  action: string;
  targetType: string;
  targetId: string | null;
  summary: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export async function listAuditLog(
  workspaceId: string,
  limit = 50,
): Promise<AuditLogEntry[]> {
  const supabase = svc();
  const { data, error } = await supabase
    .from("audit_log")
    .select(
      "id, actor_name, actor_email, action, target_type, target_id, summary, metadata, created_at",
    )
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("[audit-log] listAuditLog error:", error);
    return [];
  }

  return (data ?? []).map((row) => ({
    id: row.id as string,
    actorName: row.actor_name as string,
    actorEmail: row.actor_email as string,
    action: row.action as string,
    targetType: row.target_type as string,
    targetId: row.target_id as string | null,
    summary: row.summary as string,
    metadata: (row.metadata as Record<string, unknown>) ?? {},
    createdAt: row.created_at as string,
  }));
}
