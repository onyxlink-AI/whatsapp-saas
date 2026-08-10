import { describe, expect, it } from "vitest";
import {
  SCRIPT_STRUCTURES,
  buildContentScriptText,
  contentHasScript,
  type ContentItemRow,
} from "./types";

function content(overrides: Partial<ContentItemRow> = {}): ContentItemRow {
  return {
    id: "content-1",
    workspace_id: "workspace-1",
    project_id: null,
    responsible_id: null,
    title: "Guion",
    main_idea: null,
    description: null,
    content_type: null,
    platform: null,
    orientation: null,
    script_hook: null,
    script_body: null,
    script_closing: null,
    script_cta: null,
    bullet_points: [],
    reference_links: [],
    notes: null,
    lighting_notes: null,
    music_notes: null,
    duration_estimate: null,
    status: "idea",
    position: 0,
    scheduled_date: null,
    published_at: null,
    metric_views: null,
    metric_reach: null,
    metric_likes: null,
    metric_comments: null,
    metric_shares: null,
    metric_saves: null,
    metric_clicks: null,
    metric_leads: null,
    metric_notes: null,
    created_by: null,
    created_at: "2026-08-05T00:00:00.000Z",
    updated_at: "2026-08-05T00:00:00.000Z",
    version: 1,
    ...overrides,
  };
}

describe("contenido", () => {
  it("mantiene las ocho estructuras de ayuda como referencias de solo lectura", () => {
    expect(SCRIPT_STRUCTURES).toHaveLength(8);
    expect(SCRIPT_STRUCTURES.every((structure) => structure.steps.length >= 3)).toBe(true);
  });

  it("compone el texto del teleprompter en el orden del guion", () => {
    const item = content({
      script_hook: "  Hook potente ",
      script_body: "Desarrollo",
      script_closing: "Cierre",
      script_cta: "CTA",
      bullet_points: ["Uno", " ", "Dos"],
    });

    expect(contentHasScript(item)).toBe(true);
    expect(buildContentScriptText(item)).toBe(
      "Hook potente\n\nDesarrollo\n\nCierre\n\nCTA\n\n• Uno\n• Dos",
    );
  });

  it("trata el contenido vacío como un guion aún no preparado", () => {
    const item = content({ script_body: "   ", bullet_points: [" "] });
    expect(contentHasScript(item)).toBe(false);
    expect(buildContentScriptText(item)).toBe("");
  });
});
