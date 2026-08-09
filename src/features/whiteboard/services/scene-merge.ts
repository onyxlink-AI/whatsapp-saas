/**
 * scene-merge.ts — Fase 4C: lógica PURA de fusión de cambios locales/remotos
 * para el autoguardado del editor. Deliberadamente separada de
 * whiteboard-editor.tsx (que necesita el navegador/Excalidraw) para poder
 * probarla sin montar nada — es el algoritmo que decide "sin pérdida
 * silenciosa": nunca recarga destruyendo cambios locales, nunca pisa el
 * mismo elemento sin que un humano decida.
 *
 * Se apoya en el propio `version` de cada elemento Excalidraw (ya lo
 * incrementa el propio Excalidraw en cada edición) como firma de "esto
 * cambió desde la base" — no hace falta un hash ni una copia profunda.
 */

import type { BoardElementUnknown } from "./scene-adapter";

export type ElementVersionMap = Record<string, number>;

export function elementVersionsById(elements: readonly BoardElementUnknown[]): ElementVersionMap {
  const map: ElementVersionMap = {};
  for (const el of elements) {
    if (typeof el.id === "string") map[el.id] = Number(el.version ?? 0);
  }
  return map;
}

/** IDs cuya versión difiere entre `base` (el último punto sincronizado) y `current` — incluye altas y bajas. */
export function changedIds(base: ElementVersionMap, current: ElementVersionMap): Set<string> {
  const changed = new Set<string>();
  for (const id of new Set([...Object.keys(base), ...Object.keys(current)])) {
    if (base[id] !== current[id]) changed.add(id);
  }
  return changed;
}

export type MergeResult =
  | { kind: "merged"; elements: BoardElementUnknown[] }
  | { kind: "same_element_conflict"; conflictingIds: string[] };

/**
 * Compara los cambios locales (desde la última base sincronizada) contra
 * los cambios remotos (misma base). Si tocan elementos DISTINTOS, los
 * fusiona (gana lo local en los ids que cambiaron localmente, gana lo
 * remoto en el resto — que incluye tanto lo que cambió solo en remoto como
 * lo que no cambió en ningún lado). Si algún id cambió en AMBOS lados,
 * nunca decide por su cuenta — devuelve el conflicto para que la UI lo
 * muestre, salvo que ese id esté en `preferLocalForIds` (decisión humana
 * explícita vía "Conservar mis cambios", limitada a esos elementos).
 */
export function mergeDisjointChanges(params: {
  baseVersions: ElementVersionMap;
  localElements: readonly BoardElementUnknown[];
  remoteElements: readonly BoardElementUnknown[];
  preferLocalForIds?: ReadonlySet<string>;
}): MergeResult {
  const localVersions = elementVersionsById(params.localElements);
  const remoteVersions = elementVersionsById(params.remoteElements);
  const localChanged = changedIds(params.baseVersions, localVersions);
  const remoteChanged = changedIds(params.baseVersions, remoteVersions);
  const preferLocal = params.preferLocalForIds ?? new Set<string>();

  const unresolvedOverlap = [...localChanged].filter((id) => remoteChanged.has(id) && !preferLocal.has(id));
  if (unresolvedOverlap.length > 0) {
    return { kind: "same_element_conflict", conflictingIds: unresolvedOverlap };
  }

  const localById = new Map(params.localElements.map((e) => [e.id, e] as const));
  const remoteById = new Map(params.remoteElements.map((e) => [e.id, e] as const));
  const allIds = new Set([...localById.keys(), ...remoteById.keys()]);

  const merged: BoardElementUnknown[] = [];
  for (const id of allIds) {
    const takeLocal = localChanged.has(id) || preferLocal.has(id);
    const chosen = takeLocal ? (localById.get(id) ?? remoteById.get(id)) : (remoteById.get(id) ?? localById.get(id));
    if (chosen) merged.push(chosen);
  }

  // Orden estable: el orden remoto es el más "canónico" (ya pasó por al
  // menos una vuelta de servidor) — los elementos solo-locales (nuevos,
  // aún no vistos por el remoto) se añaden al final en su propio orden.
  const remoteOrder = new Map(params.remoteElements.map((e, i) => [e.id, i] as const));
  const localOrder = new Map(params.localElements.map((e, i) => [e.id, i] as const));
  merged.sort((a, b) => {
    const ra = remoteOrder.get(a.id);
    const rb = remoteOrder.get(b.id);
    if (ra !== undefined && rb !== undefined) return ra - rb;
    if (ra !== undefined) return -1;
    if (rb !== undefined) return 1;
    return (localOrder.get(a.id) ?? 0) - (localOrder.get(b.id) ?? 0);
  });

  return { kind: "merged", elements: merged };
}

/** true si ningún elemento cambió de versión desde la base — es decir, el único cambio posible fue de appState (zoom/scroll/color activo), nunca de contenido. */
export function onlyAppStateChanged(base: ElementVersionMap, current: readonly BoardElementUnknown[]): boolean {
  return changedIds(base, elementVersionsById(current)).size === 0;
}
