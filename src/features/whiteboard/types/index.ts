export interface WhiteboardSceneData {
  elements: unknown[];
  appState: Record<string, unknown>;
}

export interface WhiteboardRow {
  id: string;
  workspace_id: string;
  name: string;
  scene_data: WhiteboardSceneData;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}
