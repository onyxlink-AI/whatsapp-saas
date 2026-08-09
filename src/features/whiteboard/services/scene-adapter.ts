/**
 * scene-adapter.ts — Fase 4C: adaptador server-safe sobre `scene_data`
 * (Excalidraw). NUNCA importa `@excalidraw/excalidraw` (browser-only,
 * toca canvas/window en tiempo de import) — construye a mano el
 * subconjunto de campos que Excalidraw necesita para renderizar, arrastrar
 * y re-guardar un elemento correctamente.
 *
 * Contrato verificado contra fixtures REALES generadas con
 * `convertToExcalidrawElements()` en un navegador real (no jsdom — el
 * paquete usa medición de texto por canvas que jsdom no implementa),
 * capturadas en `__fixtures__/excalidraw-real-elements.json`. Cada campo
 * de _BoardElementBase_ y de cada tipo concreto de abajo tiene su
 * contraparte exacta en esas fixtures — ver `scene-adapter.test.ts` para
 * la comparación campo a campo.
 *
 * `restoreElements()`/`repairBindings` del propio paquete (documentados en
 * sus tipos) son una red de compatibilidad para cuando el cliente carga
 * una escena — nunca el mecanismo principal aquí: los factories de abajo
 * producen todos los campos requeridos ellos mismos (seed, version,
 * versionNonce, index, updated, boundElements, points/bindings) — nunca
 * dejan huecos a propósito para que el cliente los rellene.
 */

import { randomUUID } from "node:crypto";
import { z } from "zod";

// ──────────────────────────────────────────────────────────────────────────────
// Límites — decisiones cerradas del usuario.
// ──────────────────────────────────────────────────────────────────────────────
export const ELEMENT_TEXT_MAX = 500;
export const COORDINATE_BOUND = 100_000;
export const DIMENSION_MIN = 1;
export const DIMENSION_MAX = 10_000;
export const MAX_ELEMENTS_PER_SCENE = 1000;
export const MAX_SCENE_BYTES = 5 * 1024 * 1024;
export const MIN_ELEMENT_GAP = 24;
export const MAX_APP_STATE_BYTES = 10 * 1024;

/**
 * Única lista de claves de appState persistibles — usada tanto por
 * pickPersistableAppState() en whiteboard-editor.tsx (qué se envía) como
 * por update_whiteboard_app_state() en Postgres (qué se acepta). El resto
 * de appState (colaboradores, qué panel está abierto, etc.) es transitorio
 * o no serializable.
 */
export const PERSISTABLE_APP_STATE_KEYS = [
  "viewBackgroundColor",
  "currentItemStrokeColor",
  "currentItemBackgroundColor",
  "zoom",
  "scrollX",
  "scrollY",
  "gridSize",
] as const;

// ──────────────────────────────────────────────────────────────────────────────
// Tipos — subconjunto de ExcalidrawElement que este adaptador entiende y
// gestiona activamente. Cualquier otro campo que un elemento real traiga
// (roundness custom, customData, frameId real, etc.) se conserva sin
// tocar — ver BoardElementUnknown y las funciones de parcheo más abajo.
// ──────────────────────────────────────────────────────────────────────────────

export type FillStyle = "hachure" | "cross-hatch" | "solid" | "zigzag";
export type StrokeStyle = "solid" | "dashed" | "dotted";
export type ShapeType = "rectangle" | "ellipse" | "diamond";
export type BoundElementRef = { id: string; type: "arrow" | "text" };
export type PointBinding = { elementId: string; focus: number; gap: number } | null;

interface BoardElementBase {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  angle: number;
  strokeColor: string;
  backgroundColor: string;
  fillStyle: FillStyle;
  strokeWidth: number;
  strokeStyle: StrokeStyle;
  roughness: number;
  opacity: number;
  groupIds: string[];
  frameId: null;
  index: string;
  roundness: { type: number; value?: number } | null;
  seed: number;
  version: number;
  versionNonce: number;
  isDeleted: boolean;
  boundElements: BoundElementRef[] | null;
  updated: number;
  link: null;
  locked: boolean;
}

export type ShapeElement = BoardElementBase & { type: ShapeType };

export type TextElement = BoardElementBase & {
  type: "text";
  text: string;
  fontSize: number;
  fontFamily: number;
  textAlign: "left" | "center" | "right";
  verticalAlign: "top" | "middle" | "bottom";
  containerId: string | null;
  originalText: string;
  autoResize: boolean;
  lineHeight: number;
};

export type ArrowElement = BoardElementBase & {
  type: "arrow";
  points: [number, number][];
  lastCommittedPoint: null;
  startBinding: PointBinding;
  endBinding: PointBinding;
  startArrowhead: null;
  endArrowhead: "arrow";
  elbowed: false;
};

export type BoardElement = ShapeElement | TextElement | ArrowElement;

/** Un elemento leído de una escena real, de forma no necesariamente reconocida por este adaptador — passthrough opaco. */
export type BoardElementUnknown = Record<string, unknown> & { id: string; type: string };

// ──────────────────────────────────────────────────────────────────────────────
// Aleatoriedad — Excalidraw usa seed/versionNonce solo para determinismo
// visual (rough.js) y reconciliación de colaboración, nunca como secreto
// de seguridad — Math.random() es exactamente lo que el propio paquete usa
// internamente, no hace falta node:crypto aquí.
// ──────────────────────────────────────────────────────────────────────────────
function randomInt32(): number {
  return Math.floor(Math.random() * 2_000_000_000);
}

export function newElementId(): string {
  return randomUUID();
}

// ──────────────────────────────────────────────────────────────────────────────
// Índice fraccional — Excalidraw ordena los elementos por `index` (string
// base62 tipo "a0", "a1", ... — confirmado en las fixtures reales). Esta
// implementación SOLO soporta anexar al final del array (que es todo lo
// que este adaptador hace nunca inserta entre dos elementos existentes) —
// no reimplementa el algoritmo completo de fractional-indexing para
// inserción arbitraria entre dos claves.
// ──────────────────────────────────────────────────────────────────────────────
const FRACTIONAL_INDEX_ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

export function nextFractionalIndex(lastIndex: string | null | undefined): string {
  if (!lastIndex) return "a0";
  const lastChar = lastIndex[lastIndex.length - 1];
  const pos = FRACTIONAL_INDEX_ALPHABET.indexOf(lastChar);
  if (pos === -1 || pos === FRACTIONAL_INDEX_ALPHABET.length - 1) {
    return `${lastIndex}0`;
  }
  return lastIndex.slice(0, -1) + FRACTIONAL_INDEX_ALPHABET[pos + 1];
}

export function lastIndexOf(elements: readonly BoardElementUnknown[]): string | null {
  if (elements.length === 0) return null;
  const last = elements[elements.length - 1];
  return typeof last.index === "string" ? last.index : null;
}

function baseFields(params: { id?: string; x: number; y: number; width: number; height: number; index: string; strokeColor: string; backgroundColor: string; roundness: { type: number; value?: number } | null }): BoardElementBase {
  const now = Date.now();
  return {
    id: params.id ?? newElementId(),
    x: params.x,
    y: params.y,
    width: params.width,
    height: params.height,
    angle: 0,
    strokeColor: params.strokeColor,
    backgroundColor: params.backgroundColor,
    fillStyle: "solid",
    strokeWidth: 2,
    strokeStyle: "solid",
    roughness: 1,
    opacity: 100,
    groupIds: [],
    frameId: null,
    index: params.index,
    roundness: params.roundness,
    seed: randomInt32(),
    version: 1,
    versionNonce: randomInt32(),
    isDeleted: false,
    boundElements: null,
    updated: now,
    link: null,
    locked: false,
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// Factories — cada una produce TODOS los campos requeridos (seed, version,
// versionNonce, index, updated, boundElements, campos comunes) — nunca
// deja huecos para que restoreElements() los rellene.
// ──────────────────────────────────────────────────────────────────────────────

export function createShapeElement(params: {
  type: ShapeType;
  x: number;
  y: number;
  width: number;
  height: number;
  index: string;
  strokeColor?: string;
  backgroundColor?: string;
  id?: string;
}): ShapeElement {
  return {
    ...baseFields({
      id: params.id,
      x: params.x,
      y: params.y,
      width: params.width,
      height: params.height,
      index: params.index,
      strokeColor: params.strokeColor ?? "#1e1e1e",
      backgroundColor: params.backgroundColor ?? "transparent",
      // Solo el rectángulo (usado como nota adhesiva) lleva esquinas
      // redondeadas adaptativas por defecto — así lo hace ya el editor
      // (handleAddStickyNote) y así lo confirma la fixture real.
      roundness: params.type === "rectangle" ? { type: 3 } : null,
    }),
    type: params.type,
  };
}

/** Aproximación de ancho/alto de un texto sin medir con canvas real — heurística deliberada, ver comentario del módulo. Verificada contra el render real en scene-adapter-render.spec.ts. */
function estimateTextSize(text: string, fontSize: number): { width: number; height: number } {
  const lines = text.split("\n");
  const longestLine = lines.reduce((max, l) => Math.max(max, l.length), 1);
  // ~0.6 * fontSize por carácter es una aproximación razonable para las
  // fuentes por defecto de Excalidraw (Excalifont) — nunca pixel-perfect.
  const width = Math.max(20, Math.round(longestLine * fontSize * 0.6));
  const height = Math.round(lines.length * fontSize * 1.25);
  return { width, height };
}

export function createTextElement(params: {
  text: string;
  x: number;
  y: number;
  index: string;
  fontSize?: number;
  strokeColor?: string;
  textAlign?: "left" | "center" | "right";
  verticalAlign?: "top" | "middle" | "bottom";
  containerId?: string | null;
  id?: string;
}): TextElement {
  const fontSize = params.fontSize ?? 20;
  const { width, height } = estimateTextSize(params.text, fontSize);
  return {
    ...baseFields({
      id: params.id,
      x: params.x,
      y: params.y,
      width,
      height,
      index: params.index,
      strokeColor: params.strokeColor ?? "#1e1e1e",
      backgroundColor: "transparent",
      roundness: null,
    }),
    type: "text",
    text: params.text,
    fontSize,
    // Valor por defecto confirmado empíricamente en un navegador real
    // (fixture "standaloneText") — no un nombre de fuente inventado.
    fontFamily: 5,
    textAlign: params.textAlign ?? (params.containerId ? "center" : "left"),
    verticalAlign: params.verticalAlign ?? (params.containerId ? "middle" : "top"),
    containerId: params.containerId ?? null,
    originalText: params.text,
    autoResize: true,
    lineHeight: 1.25,
  };
}

export function createArrowElement(params: {
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  index: string;
  startElementId?: string | null;
  endElementId?: string | null;
  id?: string;
}): ArrowElement {
  const dx = params.toX - params.fromX;
  const dy = params.toY - params.fromY;
  return {
    ...baseFields({
      id: params.id,
      x: params.fromX,
      y: params.fromY,
      width: Math.abs(dx),
      height: Math.abs(dy),
      index: params.index,
      strokeColor: "#1e1e1e",
      backgroundColor: "transparent",
      roundness: null,
    }),
    type: "arrow",
    points: [
      [0, 0],
      [dx, dy],
    ],
    lastCommittedPoint: null,
    startBinding: params.startElementId ? { elementId: params.startElementId, focus: 0, gap: 4 } : null,
    endBinding: params.endElementId ? { elementId: params.endElementId, focus: 0, gap: 4 } : null,
    startArrowhead: null,
    endArrowhead: "arrow",
    elbowed: false,
  };
}

/**
 * Nota adhesiva = rectángulo + texto ligado (containerId), enlazados
 * bidireccionalmente desde el momento de creación — nunca un texto suelto
 * "flotando cerca" del rectángulo. Mismos colores que ya usa el editor
 * (handleAddStickyNote), para que una nota creada por el asistente no se
 * distinga visualmente de una creada a mano.
 */
export function buildStickyNote(params: {
  text: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
  lastIndex: string | null;
}): { container: ShapeElement; label: TextElement } {
  const width = params.width ?? 220;
  const height = params.height ?? 160;
  const containerIndex = nextFractionalIndex(params.lastIndex);
  const labelIndex = nextFractionalIndex(containerIndex);

  const container = createShapeElement({
    type: "rectangle",
    x: params.x,
    y: params.y,
    width,
    height,
    index: containerIndex,
    backgroundColor: "#fff3a3",
    strokeColor: "#e0c341",
  });

  const label = createTextElement({
    text: params.text,
    x: params.x + width / 2,
    y: params.y + height / 2,
    index: labelIndex,
    containerId: container.id,
  });

  return {
    container: { ...container, boundElements: [{ id: label.id, type: "text" }] },
    label,
  };
}

/**
 * Conecta dos elementos EXISTENTES con una flecha nueva. Devuelve la
 * flecha y copias PARCHEADAS (nunca reconstruidas) de origen/destino, con
 * el nuevo `boundElements` añadido a lo que cada uno YA tenía — nunca
 * pisa referencias previas.
 */
export function buildConnectorArrow(params: {
  source: BoardElementUnknown;
  target: BoardElementUnknown;
  lastIndex: string | null;
}): { arrow: ArrowElement; patchedSource: BoardElementUnknown; patchedTarget: BoardElementUnknown } {
  const sx = Number(params.source.x) + Number(params.source.width) / 2;
  const sy = Number(params.source.y) + Number(params.source.height) / 2;
  const tx = Number(params.target.x) + Number(params.target.width) / 2;
  const ty = Number(params.target.y) + Number(params.target.height) / 2;

  const arrow = createArrowElement({
    fromX: sx,
    fromY: sy,
    toX: tx,
    toY: ty,
    index: nextFractionalIndex(params.lastIndex),
    startElementId: params.source.id,
    endElementId: params.target.id,
  });

  return {
    arrow,
    patchedSource: appendBoundElement(params.source, { id: arrow.id, type: "arrow" }),
    patchedTarget: appendBoundElement(params.target, { id: arrow.id, type: "arrow" }),
  };
}

function appendBoundElement(element: BoardElementUnknown, ref: BoundElementRef): BoardElementUnknown {
  const existing = Array.isArray(element.boundElements) ? (element.boundElements as BoundElementRef[]) : [];
  return { ...element, boundElements: [...existing, ref] };
}

/** El `boundElements` de tipo "text" de un contenedor, si tiene una etiqueta ligada. */
export function findBoundTextRef(container: BoardElementUnknown): BoundElementRef | undefined {
  const bound = Array.isArray(container.boundElements) ? (container.boundElements as BoundElementRef[]) : [];
  return bound.find((b) => b.type === "text");
}

export type Point = [number, number];

export function centerOf(el: BoardElementUnknown): Point {
  return [Number(el.x ?? 0) + Number(el.width ?? 0) / 2, Number(el.y ?? 0) + Number(el.height ?? 0) / 2];
}

/**
 * Recoloca UN extremo de una flecha a un punto absoluto nuevo — el otro
 * extremo conserva exactamente su posición absoluta anterior. Convierte a
 * absoluto, mueve el extremo pedido, y vuelve a relativo (x/y/points son
 * siempre relativos al propio origen de la flecha en Excalidraw) —
 * recalculando width/height como la caja que envuelve los puntos, igual
 * que hace el propio Excalidraw.
 */
export function moveArrowEndpoint(arrow: BoardElementUnknown, which: "start" | "end", newAbsPoint: Point): BoardElementUnknown {
  const rawPoints = Array.isArray(arrow.points) ? (arrow.points as Point[]) : [[0, 0], [0, 0]];
  const ax = Number(arrow.x ?? 0);
  const ay = Number(arrow.y ?? 0);
  const absPoints: Point[] = rawPoints.map(([px, py]) => [ax + px, ay + py]);

  if (which === "start") absPoints[0] = newAbsPoint;
  else absPoints[absPoints.length - 1] = newAbsPoint;

  const newX = absPoints[0][0];
  const newY = absPoints[0][1];
  const newPoints: Point[] = absPoints.map(([px, py]) => [px - newX, py - newY]);
  const xs = absPoints.map((p) => p[0]);
  const ys = absPoints.map((p) => p[1]);

  return {
    ...arrow,
    x: newX,
    y: newY,
    points: newPoints,
    width: Math.max(...xs) - Math.min(...xs),
    height: Math.max(...ys) - Math.min(...ys),
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// Resumen para list_board_elements — Fase 4C, revisión correctiva: una
// nota adhesiva (contenedor + texto ligado) es UNA unidad para el modelo,
// nunca dos filas independientes. El texto ligado se fusiona en la
// entrada de su contenedor (texto visible + text_element_id opcional);
// nunca aparece como fila propia. Solo IDs/resúmenes — nunca el elemento
// Excalidraw completo.
// ──────────────────────────────────────────────────────────────────────────────
export interface BoardElementSummary {
  element_id: string;
  type: string;
  element_version: number;
  x: number;
  y: number;
  text_excerpt?: string;
  /** Solo presente cuando element_id es un contenedor con texto ligado — el modelo no lo necesita para nada salvo pasarlo tal cual si quisiera, nunca para "entender" la estructura interna. */
  text_element_id?: string;
  is_deleted: boolean;
}

const TEXT_EXCERPT_MAX = 60;

function excerpt(text: string): string {
  return text.length > TEXT_EXCERPT_MAX ? `${text.slice(0, TEXT_EXCERPT_MAX)}…` : text;
}

export function summarizeBoardElements(elements: readonly BoardElementUnknown[]): BoardElementSummary[] {
  const boundTextByContainer = new Map<string, BoardElementUnknown>();
  for (const el of elements) {
    if (el.type === "text" && typeof el.containerId === "string") {
      boundTextByContainer.set(el.containerId, el);
    }
  }

  const summaries: BoardElementSummary[] = [];
  for (const el of elements) {
    // Un texto ligado a un contenedor NUNCA es su propia fila — se fusiona en la del contenedor, arriba.
    if (el.type === "text" && typeof el.containerId === "string") continue;

    const boundText = boundTextByContainer.get(el.id);
    const ownText = el.type === "text" && typeof el.text === "string" ? el.text : undefined;
    const visibleText = boundText && typeof boundText.text === "string" ? boundText.text : ownText;

    summaries.push({
      element_id: el.id,
      type: el.type,
      element_version: Number(el.version ?? 0),
      x: Number(el.x ?? 0),
      y: Number(el.y ?? 0),
      ...(visibleText !== undefined ? { text_excerpt: excerpt(visibleText) } : {}),
      ...(boundText ? { text_element_id: boundText.id } : {}),
      is_deleted: Boolean(el.isDeleted),
    });
  }
  return summaries;
}

/** Clave de customData que marca qué elementos borró UNA operación de delete_board_element concreta — ver resolve_assistant_pending_action() y restore_board_element. */
export const DELETION_GROUP_CUSTOM_DATA_KEY = "onyxlinkDeletionGroup";

// ──────────────────────────────────────────────────────────────────────────────
// Colocación automática — AABB con separación mínima, cuadrícula/cascada
// con máximo de intentos. Nunca coloca en una coordenada lejana arbitraria
// si no encuentra hueco — devuelve null y el llamador debe informar al
// usuario, no inventar una posición.
// ──────────────────────────────────────────────────────────────────────────────
export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

function boxesOverlap(a: BoundingBox, b: BoundingBox, gap: number): boolean {
  return !(
    a.x + a.width + gap <= b.x ||
    b.x + b.width + gap <= a.x ||
    a.y + a.height + gap <= b.y ||
    b.y + b.height + gap <= a.y
  );
}

export function findFreePlacement(
  existing: readonly BoundingBox[],
  size: { width: number; height: number },
  opts?: { gap?: number; maxAttemptsPerAxis?: number; origin?: { x: number; y: number } },
): { x: number; y: number } | null {
  const gap = opts?.gap ?? MIN_ELEMENT_GAP;
  const maxPerAxis = opts?.maxAttemptsPerAxis ?? 25;
  const origin = opts?.origin ?? { x: 0, y: 0 };
  const stepX = size.width + gap;
  const stepY = size.height + gap;

  for (let row = 0; row < maxPerAxis; row++) {
    for (let col = 0; col < maxPerAxis; col++) {
      const candidate: BoundingBox = {
        x: origin.x + col * stepX,
        y: origin.y + row * stepY,
        width: size.width,
        height: size.height,
      };
      if (candidate.x + candidate.width > COORDINATE_BOUND || candidate.y + candidate.height > COORDINATE_BOUND) continue;
      const collides = existing.some((box) => boxesOverlap(candidate, box, gap));
      if (!collides) return { x: candidate.x, y: candidate.y };
    }
  }
  return null;
}

export function boundingBoxOf(element: BoardElementUnknown): BoundingBox {
  return { x: Number(element.x) || 0, y: Number(element.y) || 0, width: Number(element.width) || 0, height: Number(element.height) || 0 };
}

// ──────────────────────────────────────────────────────────────────────────────
// Validación — para lo que este adaptador CREA. Elementos existentes que
// no toca pasan por él sin re-validar cada campo (ver whiteboard-actions.ts).
// ──────────────────────────────────────────────────────────────────────────────
export const CREATABLE_SHAPE_TYPES = ["rectangle", "ellipse", "diamond"] as const;

const FiniteCoordinate = z.number().finite().min(-COORDINATE_BOUND).max(COORDINATE_BOUND);
const FiniteDimension = z.number().finite().min(DIMENSION_MIN).max(DIMENSION_MAX);

export const NoteTextSchema = z.string().trim().min(1).max(ELEMENT_TEXT_MAX);

export const AddNoteInputSchema = z.object({
  text: NoteTextSchema,
});

export const AddShapeInputSchema = z.object({
  shape: z.enum(CREATABLE_SHAPE_TYPES),
  text: NoteTextSchema.optional(),
});

export const CoordinateSchema = FiniteCoordinate;
export const DimensionSchema = FiniteDimension;

export function isSceneWithinLimits(elements: readonly unknown[], sceneJsonByteLength: number): { ok: true } | { ok: false; reason: "too_many_elements" | "scene_too_large" } {
  if (elements.length > MAX_ELEMENTS_PER_SCENE) return { ok: false, reason: "too_many_elements" };
  if (sceneJsonByteLength > MAX_SCENE_BYTES) return { ok: false, reason: "scene_too_large" };
  return { ok: true };
}

/** Comprobación estructural laxa — usada por el preflight (§ escenas inválidas), nunca para rechazar una operación normal sobre elementos que el adaptador no toca. */
export function isStructurallyValidElement(value: unknown): value is BoardElementUnknown {
  if (typeof value !== "object" || value === null) return false;
  const el = value as Record<string, unknown>;
  return (
    typeof el.id === "string" &&
    el.id.length > 0 &&
    typeof el.type === "string" &&
    typeof el.x === "number" &&
    Number.isFinite(el.x) &&
    typeof el.y === "number" &&
    Number.isFinite(el.y)
  );
}
