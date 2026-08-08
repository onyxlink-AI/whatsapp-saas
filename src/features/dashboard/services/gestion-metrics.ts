// gestion-metrics.ts — consultas ligeras para el bloque "Gestión" del
// dashboard adaptativo (Fase 2, §4.2). Deliberadamente distintas de las
// funciones "traer todo" ya existentes (listTasks/getDealsForBoard/
// listContentItems): el dashboard solo necesita contadores y una lista
// corta, no las filas completas que ya cargan Proyectos/Contenido/Pipeline.
// Usa el cliente de sesión (RLS), igual que el resto de acciones de este
// repo — nunca service role para datos que ya están acotados por workspace.

import { createClient } from "@/lib/supabase/server";

export interface GestionMetrics {
  tasksOverdue: number;
  tasksToday: number;
  tasksPending: number;
  agendaUpcoming: number;
  dealsOpenCount: number;
  dealsOpenValue: number;
  dealsStalledCount: number;
  projectsActiveCount: number;
  projectsAvgProgress: number;
  contentPendingCount: number;
}

export interface UpcomingAgendaItem {
  id: string;
  title: string;
  due_at: string;
}

export interface StalledDeal {
  id: string;
  title: string;
  stage: string;
  updated_at: string;
}

const OPEN_DEAL_STAGES = ["exploracion", "interes", "listo_para_comprar"];
const STALLED_DAYS = 7;
const AGENDA_WINDOW_DAYS = 3;

export async function getGestionMetrics(workspaceId: string): Promise<GestionMetrics> {
  const supabase = await createClient();
  const nowIso = new Date().toISOString();
  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);
  const agendaEnd = new Date(Date.now() + AGENDA_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const stalledBefore = new Date(Date.now() - STALLED_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const [
    tasksOverdue,
    tasksToday,
    tasksPending,
    agendaUpcoming,
    dealsOpen,
    dealsStalled,
    projectsActive,
    contentPending,
  ] = await Promise.all([
    supabase
      .from("tasks")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", workspaceId)
      .in("status", ["pending", "in_progress"])
      .lt("due_at", nowIso),
    supabase
      .from("tasks")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", workspaceId)
      .in("status", ["pending", "in_progress"])
      .gte("due_at", nowIso)
      .lte("due_at", todayEnd.toISOString()),
    supabase
      .from("tasks")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", workspaceId)
      .in("status", ["pending", "in_progress"]),
    supabase
      .from("tasks")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", workspaceId)
      .in("status", ["pending", "in_progress"])
      .gte("due_at", nowIso)
      .lte("due_at", agendaEnd),
    supabase
      .from("deals")
      .select("id, value", { count: "exact" })
      .eq("workspace_id", workspaceId)
      .in("stage", OPEN_DEAL_STAGES),
    supabase
      .from("deals")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", workspaceId)
      .in("stage", OPEN_DEAL_STAGES)
      .lt("updated_at", stalledBefore),
    supabase
      .from("projects")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", workspaceId)
      .eq("is_active", true),
    supabase
      .from("content_items")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", workspaceId)
      .in("status", ["idea", "in_production", "ready_to_publish"]),
  ]);

  const dealsOpenValue = ((dealsOpen.data ?? []) as { value: number | null }[]).reduce(
    (sum, row) => sum + (row.value ?? 0),
    0,
  );

  const { data: progressRows } = await supabase
    .from("project_progress")
    .select("progress_pct")
    .eq("workspace_id", workspaceId);
  const progressValues = ((progressRows ?? []) as { progress_pct: number | null }[]).map((r) => r.progress_pct ?? 0);
  const projectsAvgProgress = progressValues.length > 0 ? Math.round(progressValues.reduce((a, b) => a + b, 0) / progressValues.length) : 0;

  return {
    tasksOverdue: tasksOverdue.count ?? 0,
    tasksToday: tasksToday.count ?? 0,
    tasksPending: tasksPending.count ?? 0,
    agendaUpcoming: agendaUpcoming.count ?? 0,
    dealsOpenCount: dealsOpen.count ?? 0,
    dealsOpenValue,
    dealsStalledCount: dealsStalled.count ?? 0,
    projectsActiveCount: projectsActive.count ?? 0,
    projectsAvgProgress,
    contentPendingCount: contentPending.count ?? 0,
  };
}

export async function getUpcomingAgendaItems(workspaceId: string, limit = 3): Promise<UpcomingAgendaItem[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("tasks")
    .select("id, title, due_at")
    .eq("workspace_id", workspaceId)
    .in("status", ["pending", "in_progress"])
    .not("due_at", "is", null)
    .gte("due_at", new Date().toISOString())
    .order("due_at", { ascending: true })
    .limit(limit);
  return (data ?? []) as UpcomingAgendaItem[];
}

export async function getStalledDeals(workspaceId: string, limit = 3): Promise<StalledDeal[]> {
  const supabase = await createClient();
  const stalledBefore = new Date(Date.now() - STALLED_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const { data } = await supabase
    .from("deals")
    .select("id, title, stage, updated_at")
    .eq("workspace_id", workspaceId)
    .in("stage", OPEN_DEAL_STAGES)
    .lt("updated_at", stalledBefore)
    .order("updated_at", { ascending: true })
    .limit(limit);
  return (data ?? []) as StalledDeal[];
}
