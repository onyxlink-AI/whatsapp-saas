export type ContentStatus = "idea" | "in_production" | "ready_to_publish" | "published";
export type ContentOrientation = "vertical" | "horizontal";

export const CONTENT_STATUSES: ContentStatus[] = [
  "idea",
  "in_production",
  "ready_to_publish",
  "published",
];

export const CONTENT_STATUS_LABELS: Record<ContentStatus, string> = {
  idea: "Idea",
  in_production: "En producción",
  ready_to_publish: "Listo para subir",
  published: "Publicado",
};

export const CONTENT_ORIENTATION_LABELS: Record<ContentOrientation, string> = {
  vertical: "Vertical",
  horizontal: "Horizontal",
};

export interface ReferenceLink {
  label: string;
  url: string;
}

export interface ContentItemRow {
  id: string;
  workspace_id: string;
  project_id: string | null;
  responsible_id: string | null;

  title: string;
  main_idea: string | null;
  description: string | null;
  content_type: string | null;
  platform: string | null;
  orientation: ContentOrientation | null;

  script_hook: string | null;
  script_body: string | null;
  script_closing: string | null;
  script_cta: string | null;
  bullet_points: string[];
  reference_links: ReferenceLink[];
  notes: string | null;
  lighting_notes: string | null;
  music_notes: string | null;
  duration_estimate: string | null;

  status: ContentStatus;
  position: number;
  scheduled_date: string | null;
  published_at: string | null;

  metric_views: number | null;
  metric_reach: number | null;
  metric_likes: number | null;
  metric_comments: number | null;
  metric_shares: number | null;
  metric_saves: number | null;
  metric_clicks: number | null;
  metric_leads: number | null;
  metric_notes: string | null;

  created_by: string | null;
  created_at: string;
  updated_at: string;
  /** Fase 4 — token de concurrencia (CAS). Sube en CUALQUIER UPDATE, humano o del asistente, por igual. */
  version: number;
}

/** Las 8 estructuras de guion de referencia — solo inspiran, de solo lectura. */
export interface ScriptStructure {
  title: string;
  steps: string[];
}

export const SCRIPT_STRUCTURES: ScriptStructure[] = [
  { title: "Problema → tensión → solución → CTA", steps: ["Problema", "Tensión", "Solución", "CTA"] },
  { title: "Hook → tres ideas → conclusión", steps: ["Hook", "Idea 1", "Idea 2", "Idea 3", "Conclusión"] },
  { title: "Error común → explicación → alternativa", steps: ["Error común", "Explicación", "Alternativa"] },
  { title: "Historia breve → aprendizaje → CTA", steps: ["Historia breve", "Aprendizaje", "CTA"] },
  { title: "Antes → transformación → después", steps: ["Antes", "Transformación", "Después"] },
  { title: "Pregunta → respuesta → ejemplo", steps: ["Pregunta", "Respuesta", "Ejemplo"] },
  { title: "Lista rápida de consejos", steps: ["Consejo 1", "Consejo 2", "Consejo 3"] },
  { title: "Mito → realidad → recomendación", steps: ["Mito", "Realidad", "Recomendación"] },
];

export function contentHasScript(item: ContentItemRow): boolean {
  return Boolean(
    item.script_hook?.trim() ||
      item.script_body?.trim() ||
      item.script_closing?.trim() ||
      item.script_cta?.trim() ||
      item.bullet_points?.some((point) => point.trim()),
  );
}

export function buildContentScriptText(item: ContentItemRow): string {
  const sections = [item.script_hook, item.script_body, item.script_closing, item.script_cta]
    .map((section) => section?.trim() ?? "")
    .filter(Boolean);
  const bullets = item.bullet_points
    .map((point) => point.trim())
    .filter(Boolean)
    .map((point) => `• ${point}`)
    .join("\n");

  return [...sections, bullets].filter(Boolean).join("\n\n");
}
