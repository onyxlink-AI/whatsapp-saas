export interface WhiteboardSceneData {
  elements: unknown[];
  appState: Record<string, unknown>;
}

export interface WhiteboardRow {
  id: string;
  workspace_id: string;
  name: string;
  scene_data: WhiteboardSceneData;
  /** Fase 4C: control de concurrencia optimista — ver update_whiteboard_scene_cas(). */
  version: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

/** Resultado estructurado de update_whiteboard_scene_cas() — ver la migración 20260810000000. */
export type WhiteboardCasResult =
  | { result: "updated"; version: number }
  | { result: "conflict" }
  | { result: "not_found_or_forbidden" }
  | { result: "scene_too_large"; element_count: number; size_bytes: number };

/** Resultado estructurado de update_whiteboard_app_state() — nunca toca version. */
export type WhiteboardAppStateResult =
  | { result: "updated" }
  | { result: "not_found_or_forbidden" }
  | { result: "scene_too_large" };
