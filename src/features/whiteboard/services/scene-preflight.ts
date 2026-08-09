/**
 * scene-preflight.ts — Fase 4C: inventario de solo lectura de todos los
 * tableros existentes, para ejecutar ANTES de habilitar la edición del
 * asistente en producción. Nunca modifica ninguna escena — solo lee y
 * reporta. Si algún tablero supera los límites nuevos (1000 elementos,
 * 5 MiB) o tiene una escena mal formada, la migración operativa
 * (habilitar el kill switch / las tools de Board) debe detenerse hasta
 * revisar ese inventario a mano.
 */

import { createClient as createSbClient } from "@supabase/supabase-js";
import {
  isStructurallyValidElement,
  isSceneWithinLimits,
  MAX_ELEMENTS_PER_SCENE,
  MAX_SCENE_BYTES,
} from "./scene-adapter";

function svc() {
  return createSbClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export interface WhiteboardPreflightRow {
  whiteboardId: string;
  workspaceId: string;
  name: string;
  elementCount: number;
  sizeBytes: number;
  types: string[];
  withinLimits: boolean;
  invalidElementIds: string[];
}

export interface WhiteboardPreflightReport {
  rows: WhiteboardPreflightRow[];
  totalBoards: number;
  boardsOverLimits: number;
  boardsWithInvalidElements: number;
}

/**
 * Solo lectura — nunca hace ningún UPDATE. Recorre todos los tableros
 * (opcionalmente de un solo workspace, si se pasa) y calcula el inventario
 * pedido: cantidad de elementos, tamaño serializado, tipos presentes y si
 * la escena tiene elementos estructuralmente inválidos.
 */
export async function runWhiteboardScenePreflight(workspaceId?: string): Promise<WhiteboardPreflightReport> {
  let query = svc().from("whiteboards").select("id, workspace_id, name, scene_data");
  if (workspaceId) query = query.eq("workspace_id", workspaceId);

  const { data, error } = await query;
  if (error) {
    throw new Error(`[scene-preflight] error leyendo whiteboards: ${error.message}`);
  }

  const rows: WhiteboardPreflightRow[] = (data ?? []).map((row) => {
    const sceneData = row.scene_data as { elements?: unknown } | null;
    const elements = Array.isArray(sceneData?.elements) ? (sceneData!.elements as unknown[]) : [];
    const sizeBytes = new TextEncoder().encode(JSON.stringify(sceneData ?? {})).length;
    const types = Array.from(
      new Set(elements.filter((e): e is Record<string, unknown> => typeof e === "object" && e !== null && "type" in e).map((e) => String(e.type))),
    ).sort();
    const invalidElementIds = elements
      .filter((e) => !isStructurallyValidElement(e))
      .map((e, i) => (typeof e === "object" && e !== null && "id" in e ? String((e as Record<string, unknown>).id) : `#${i}`));
    const limits = isSceneWithinLimits(elements, sizeBytes);

    return {
      whiteboardId: row.id as string,
      workspaceId: row.workspace_id as string,
      name: row.name as string,
      elementCount: elements.length,
      sizeBytes,
      types,
      withinLimits: limits.ok,
      invalidElementIds,
    };
  });

  return {
    rows,
    totalBoards: rows.length,
    boardsOverLimits: rows.filter((r) => !r.withinLimits).length,
    boardsWithInvalidElements: rows.filter((r) => r.invalidElementIds.length > 0).length,
  };
}

/** Formato de tabla legible para consola/inventario — usado por scripts/whiteboard-scene-preflight.ts. */
export function formatPreflightReport(report: WhiteboardPreflightReport): string {
  const lines: string[] = [];
  lines.push(`Tableros analizados: ${report.totalBoards}`);
  lines.push(`Tableros que superan límites (>${MAX_ELEMENTS_PER_SCENE} elementos o >${MAX_SCENE_BYTES} bytes): ${report.boardsOverLimits}`);
  lines.push(`Tableros con elementos estructuralmente inválidos: ${report.boardsWithInvalidElements}`);
  lines.push("");
  for (const row of report.rows) {
    if (row.withinLimits && row.invalidElementIds.length === 0) continue;
    lines.push(
      `- ${row.whiteboardId} (workspace ${row.workspaceId}, "${row.name}"): ${row.elementCount} elementos, ${row.sizeBytes} bytes, tipos=[${row.types.join(",")}]` +
        (row.withinLimits ? "" : " ⚠️ SUPERA LÍMITES") +
        (row.invalidElementIds.length ? ` ⚠️ ELEMENTOS INVÁLIDOS: ${row.invalidElementIds.join(", ")}` : ""),
    );
  }
  return lines.join("\n");
}
