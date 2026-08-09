// Fase 4C — scene-adapter.ts: el adaptador server-safe se contrasta campo
// a campo contra fixtures REALES generadas con convertToExcalidrawElements()
// en un navegador real (Playwright/Chromium, nunca jsdom — el paquete
// mide texto con canvas, que jsdom no implementa). Ver el comentario en
// __fixtures__/excalidraw-real-elements.json sobre cómo se generaron.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  createShapeElement,
  createTextElement,
  createArrowElement,
  buildStickyNote,
  buildConnectorArrow,
  findFreePlacement,
  boundingBoxOf,
  nextFractionalIndex,
  lastIndexOf,
  isSceneWithinLimits,
  isStructurallyValidElement,
  AddNoteInputSchema,
  AddShapeInputSchema,
  CoordinateSchema,
  DimensionSchema,
  MAX_ELEMENTS_PER_SCENE,
  MAX_SCENE_BYTES,
  ELEMENT_TEXT_MAX,
  COORDINATE_BOUND,
  findBoundTextRef,
  centerOf,
  moveArrowEndpoint,
  summarizeBoardElements,
  DELETION_GROUP_CUSTOM_DATA_KEY,
  type BoardElementUnknown,
} from "./scene-adapter";

const fixtures = JSON.parse(
  readFileSync(join(__dirname, "__fixtures__", "excalidraw-real-elements.json"), "utf8"),
) as {
  sticky: Record<string, unknown>[];
  connected: Record<string, unknown>[];
  standaloneText: Record<string, unknown>[];
  shapes: Record<string, unknown>[];
};

const BASE_FIELDS = [
  "id", "x", "y", "width", "height", "angle", "strokeColor", "backgroundColor",
  "fillStyle", "strokeWidth", "strokeStyle", "roughness", "opacity", "groupIds",
  "frameId", "index", "roundness", "seed", "version", "versionNonce", "isDeleted",
  "boundElements", "updated", "link", "locked",
];

describe("scene-adapter — contrato de campos contra fixtures reales", () => {
  it("createShapeElement(rectangle) tiene EXACTAMENTE los mismos campos base que el rectángulo real de la fixture", () => {
    const real = fixtures.sticky.find((e) => e.type === "rectangle")!;
    const mine = createShapeElement({ type: "rectangle", x: 0, y: 0, width: 220, height: 160, index: "a0" });

    for (const key of BASE_FIELDS) {
      expect(mine).toHaveProperty(key);
      expect(typeof mine[key as keyof typeof mine]).toBe(typeof real[key]);
    }
    // Valores deterministas (no aleatorios) deben coincidir exactamente con lo que produce el navegador real.
    expect(mine.fillStyle).toBe(real.fillStyle);
    expect(mine.strokeWidth).toBe(real.strokeWidth);
    expect(mine.strokeStyle).toBe(real.strokeStyle);
    expect(mine.roughness).toBe(real.roughness);
    expect(mine.opacity).toBe(real.opacity);
    expect(mine.roundness).toEqual(real.roundness);
    expect(mine.frameId).toBe(real.frameId);
    expect(mine.link).toBe(real.link);
    expect(mine.locked).toBe(real.locked);
  });

  it("createShapeElement(ellipse/diamond) sin roundness — coincide con la fixture real de formas", () => {
    const realEllipse = fixtures.shapes.find((e) => e.type === "ellipse")!;
    const mine = createShapeElement({ type: "ellipse", x: 0, y: 0, width: 150, height: 100, index: "a0" });
    expect(mine.roundness).toBe(realEllipse.roundness); // null en ambos
  });

  it("createTextElement produce los mismos campos de texto que la fixture real (fontFamily, lineHeight, autoResize)", () => {
    const real = fixtures.standaloneText[0];
    const mine = createTextElement({ text: "Texto suelto", x: 50, y: 400, index: "a0" });

    for (const key of [...BASE_FIELDS, "text", "fontSize", "fontFamily", "textAlign", "verticalAlign", "containerId", "originalText", "autoResize", "lineHeight"]) {
      expect(mine).toHaveProperty(key);
    }
    expect(mine.fontFamily).toBe(real.fontFamily); // valor por defecto confirmado empíricamente: 5
    expect(mine.lineHeight).toBe(real.lineHeight);
    expect(mine.autoResize).toBe(real.autoResize);
    expect(mine.fontSize).toBe(real.fontSize);
    expect(mine.originalText).toBe(mine.text);
  });

  it("createArrowElement: points/startBinding/endBinding con la MISMA forma que la fixture real (elementId/focus/gap, no type/id)", () => {
    const realArrow = fixtures.connected.find((e) => e.type === "arrow")!;
    const mine = createArrowElement({ fromX: 220, fromY: 80, toX: 320, toY: 80, index: "a2", startElementId: "src-1", endElementId: "dst-1" });

    expect(Array.isArray(mine.points)).toBe(true);
    expect(mine.points[0]).toEqual([0, 0]);
    expect(mine.startBinding).toEqual({ elementId: "src-1", focus: 0, gap: 4 });
    expect(mine.endBinding).toEqual({ elementId: "dst-1", focus: 0, gap: 4 });
    // La forma de un binding real (claves, no valores) debe coincidir.
    expect(Object.keys(mine.startBinding!).sort()).toEqual(Object.keys(realArrow.startBinding as object).sort());
    expect(mine.startArrowhead).toBe(realArrow.startArrowhead);
    expect(mine.endArrowhead).toBe(realArrow.endArrowhead);
    expect(mine.elbowed).toBe(realArrow.elbowed);
  });

  it("un elemento SIN bindings tiene startBinding/endBinding null, igual que un arrow suelto podría", () => {
    const mine = createArrowElement({ fromX: 0, fromY: 0, toX: 10, toY: 10, index: "a0" });
    expect(mine.startBinding).toBeNull();
    expect(mine.endBinding).toBeNull();
  });
});

describe("buildStickyNote — nota adhesiva = contenedor + texto ligados bidireccionalmente", () => {
  it("el contenedor referencia al texto en boundElements Y el texto referencia al contenedor en containerId", () => {
    const { container, label } = buildStickyNote({ text: "Hola", x: 100, y: 100, lastIndex: null });

    expect(container.boundElements).toEqual([{ id: label.id, type: "text" }]);
    expect(label.containerId).toBe(container.id);
  });

  it("usa los mismos colores de nota adhesiva que ya usa el editor (handleAddStickyNote)", () => {
    const { container } = buildStickyNote({ text: "Hola", x: 0, y: 0, lastIndex: null });
    expect(container.backgroundColor).toBe("#fff3a3");
    expect(container.strokeColor).toBe("#e0c341");
    expect(container.roundness).toEqual({ type: 3 });
  });

  it("los índices fraccionales del contenedor y la etiqueta son distintos y ordenados", () => {
    const { container, label } = buildStickyNote({ text: "Hola", x: 0, y: 0, lastIndex: "a5" });
    expect(container.index > "a5").toBe(true);
    expect(label.index > container.index).toBe(true);
  });
});

describe("buildConnectorArrow — conecta sin pisar boundElements existentes", () => {
  it("añade la flecha al boundElements de AMBOS extremos, conservando lo que ya tenían", () => {
    const source = { id: "s1", type: "rectangle", x: 0, y: 0, width: 100, height: 100, boundElements: [{ id: "existing-text", type: "text" }] };
    const target = { id: "t1", type: "rectangle", x: 300, y: 0, width: 100, height: 100, boundElements: null };

    const { arrow, patchedSource, patchedTarget } = buildConnectorArrow({ source, target, lastIndex: "a0" });

    expect(patchedSource.boundElements).toEqual([{ id: "existing-text", type: "text" }, { id: arrow.id, type: "arrow" }]);
    expect(patchedTarget.boundElements).toEqual([{ id: arrow.id, type: "arrow" }]);
    expect(arrow.startBinding).toEqual({ elementId: "s1", focus: 0, gap: 4 });
    expect(arrow.endBinding).toEqual({ elementId: "t1", focus: 0, gap: 4 });
  });

  it("nunca muta los objetos originales — devuelve copias parcheadas", () => {
    const source = { id: "s1", type: "rectangle", x: 0, y: 0, width: 100, height: 100, boundElements: null };
    const target = { id: "t1", type: "rectangle", x: 300, y: 0, width: 100, height: 100, boundElements: null };
    buildConnectorArrow({ source, target, lastIndex: null });
    expect(source.boundElements).toBeNull();
    expect(target.boundElements).toBeNull();
  });

  it("calcula la flecha usando las posiciones dadas (frescas) del origen y destino", () => {
    const source = { id: "s1", type: "rectangle", x: 0, y: 0, width: 100, height: 100, boundElements: null };
    const target = { id: "t1", type: "rectangle", x: 500, y: 500, width: 100, height: 100, boundElements: null };
    const { arrow } = buildConnectorArrow({ source, target, lastIndex: null });
    // Centro de origen (50,50) -> centro de destino (550,550)
    expect(arrow.x).toBe(50);
    expect(arrow.y).toBe(50);
    expect(arrow.points[1]).toEqual([500, 500]);
  });
});

describe("nextFractionalIndex / lastIndexOf", () => {
  it("empieza en 'a0' cuando no hay índice previo", () => {
    expect(nextFractionalIndex(null)).toBe("a0");
    expect(nextFractionalIndex(undefined)).toBe("a0");
  });

  it("genera una secuencia estrictamente creciente al anexar repetidamente", () => {
    let idx: string | null = null;
    const seen: string[] = [];
    for (let i = 0; i < 70; i++) {
      idx = nextFractionalIndex(idx);
      seen.push(idx);
    }
    for (let i = 1; i < seen.length; i++) {
      expect(seen[i] > seen[i - 1]).toBe(true);
    }
  });

  it("lastIndexOf lee el índice del último elemento del array, null si está vacío", () => {
    expect(lastIndexOf([])).toBeNull();
    expect(lastIndexOf([{ id: "a", type: "rectangle", index: "a3" } as never])).toBe("a3");
  });
});

describe("findFreePlacement — AABB con separación mínima, nunca una esquina lejana arbitraria", () => {
  it("coloca en el origen cuando la escena está vacía", () => {
    const pos = findFreePlacement([], { width: 220, height: 160 });
    expect(pos).toEqual({ x: 0, y: 0 });
  });

  it("nunca solapa con un elemento existente, respetando el gap mínimo", () => {
    const existing = [{ x: 0, y: 0, width: 220, height: 160 }];
    const pos = findFreePlacement(existing, { width: 220, height: 160 }, { gap: 24 });
    expect(pos).not.toBeNull();
    const candidate = { ...pos!, width: 220, height: 160 };
    const overlapsX = candidate.x < existing[0].x + existing[0].width + 24 && candidate.x + candidate.width + 24 > existing[0].x;
    const overlapsY = candidate.y < existing[0].y + existing[0].height + 24 && candidate.y + candidate.height + 24 > existing[0].y;
    expect(overlapsX && overlapsY).toBe(false);
  });

  it("devuelve null (nunca una coordenada lejana arbitraria) cuando no hay hueco dentro del intento acotado", () => {
    // Rellena una cuadrícula completa 3x3 de bloques idénticos a los que se buscan encajar,
    // con un maxAttemptsPerAxis muy pequeño para forzar agotamiento determinista.
    const size = { width: 100, height: 100 };
    const existing: { x: number; y: number; width: number; height: number }[] = [];
    for (let row = 0; row < 2; row++) {
      for (let col = 0; col < 2; col++) {
        existing.push({ x: col * (100 + 24), y: row * (100 + 24), width: 100, height: 100 });
      }
    }
    const pos = findFreePlacement(existing, size, { gap: 24, maxAttemptsPerAxis: 2 });
    expect(pos).toBeNull();
  });

  it("boundingBoxOf lee x/y/width/height de un elemento tolerando campos ausentes", () => {
    expect(boundingBoxOf({ id: "x", type: "rectangle", x: 5, y: 10, width: 20, height: 30 })).toEqual({ x: 5, y: 10, width: 20, height: 30 });
    expect(boundingBoxOf({ id: "x", type: "rectangle" })).toEqual({ x: 0, y: 0, width: 0, height: 0 });
  });
});

describe("isSceneWithinLimits", () => {
  it("acepta una escena dentro de los límites", () => {
    expect(isSceneWithinLimits(new Array(10).fill({}), 1000)).toEqual({ ok: true });
  });

  it("rechaza más de MAX_ELEMENTS_PER_SCENE elementos", () => {
    expect(isSceneWithinLimits(new Array(MAX_ELEMENTS_PER_SCENE + 1).fill({}), 1000)).toEqual({ ok: false, reason: "too_many_elements" });
  });

  it("rechaza más de MAX_SCENE_BYTES", () => {
    expect(isSceneWithinLimits([], MAX_SCENE_BYTES + 1)).toEqual({ ok: false, reason: "scene_too_large" });
  });
});

describe("isStructurallyValidElement", () => {
  it("acepta un elemento con id/type/x/y numéricos finitos", () => {
    expect(isStructurallyValidElement({ id: "a", type: "rectangle", x: 1, y: 2 })).toBe(true);
  });

  it("rechaza id vacío, x/y no numéricos o NaN/Infinity, o forma no-objeto", () => {
    expect(isStructurallyValidElement({ id: "", type: "rectangle", x: 1, y: 2 })).toBe(false);
    expect(isStructurallyValidElement({ id: "a", type: "rectangle", x: "1", y: 2 })).toBe(false);
    expect(isStructurallyValidElement({ id: "a", type: "rectangle", x: NaN, y: 2 })).toBe(false);
    expect(isStructurallyValidElement({ id: "a", type: "rectangle", x: Infinity, y: 2 })).toBe(false);
    expect(isStructurallyValidElement(null)).toBe(false);
    expect(isStructurallyValidElement("not an object")).toBe(false);
  });
});

describe("Validación de entrada — límites cerrados del usuario", () => {
  it("AddNoteInputSchema rechaza texto vacío y texto por encima de ELEMENT_TEXT_MAX", () => {
    expect(AddNoteInputSchema.safeParse({ text: "" }).success).toBe(false);
    expect(AddNoteInputSchema.safeParse({ text: "a".repeat(ELEMENT_TEXT_MAX) }).success).toBe(true);
    expect(AddNoteInputSchema.safeParse({ text: "a".repeat(ELEMENT_TEXT_MAX + 1) }).success).toBe(false);
  });

  it("AddShapeInputSchema solo acepta rectangle|ellipse|diamond", () => {
    expect(AddShapeInputSchema.safeParse({ shape: "rectangle" }).success).toBe(true);
    expect(AddShapeInputSchema.safeParse({ shape: "ellipse" }).success).toBe(true);
    expect(AddShapeInputSchema.safeParse({ shape: "diamond" }).success).toBe(true);
    expect(AddShapeInputSchema.safeParse({ shape: "arrow" }).success).toBe(false);
    expect(AddShapeInputSchema.safeParse({ shape: "image" }).success).toBe(false);
  });

  it("CoordinateSchema rechaza NaN/Infinity y coordenadas fuera de ±COORDINATE_BOUND", () => {
    expect(CoordinateSchema.safeParse(0).success).toBe(true);
    expect(CoordinateSchema.safeParse(COORDINATE_BOUND).success).toBe(true);
    expect(CoordinateSchema.safeParse(COORDINATE_BOUND + 1).success).toBe(false);
    expect(CoordinateSchema.safeParse(-COORDINATE_BOUND - 1).success).toBe(false);
    expect(CoordinateSchema.safeParse(NaN).success).toBe(false);
    expect(CoordinateSchema.safeParse(Infinity).success).toBe(false);
  });

  it("DimensionSchema exige dimensiones entre 1 y 10 000", () => {
    expect(DimensionSchema.safeParse(1).success).toBe(true);
    expect(DimensionSchema.safeParse(10_000).success).toBe(true);
    expect(DimensionSchema.safeParse(0).success).toBe(false);
    expect(DimensionSchema.safeParse(10_001).success).toBe(false);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Revisión correctiva Fase 4C — §1 (nota como unidad semántica) y
// §2 (movimiento coherente).
// ──────────────────────────────────────────────────────────────────────────────

describe("findBoundTextRef / centerOf", () => {
  it("findBoundTextRef encuentra la referencia de tipo 'text' en boundElements, ignorando las de tipo 'arrow'", () => {
    const container: BoardElementUnknown = {
      id: "c1",
      type: "rectangle",
      boundElements: [
        { id: "arrow-1", type: "arrow" },
        { id: "text-1", type: "text" },
      ],
    };
    expect(findBoundTextRef(container)).toEqual({ id: "text-1", type: "text" });
  });

  it("findBoundTextRef devuelve undefined cuando no hay texto ligado o boundElements es null", () => {
    expect(findBoundTextRef({ id: "c1", type: "rectangle", boundElements: null })).toBeUndefined();
    expect(findBoundTextRef({ id: "c1", type: "rectangle", boundElements: [{ id: "a1", type: "arrow" }] })).toBeUndefined();
  });

  it("centerOf calcula el centro real del elemento, tolerando campos ausentes como 0", () => {
    expect(centerOf({ id: "e1", type: "rectangle", x: 100, y: 200, width: 40, height: 20 })).toEqual([120, 210]);
    expect(centerOf({ id: "e1", type: "rectangle" })).toEqual([0, 0]);
  });
});

describe("moveArrowEndpoint — recoloca UN extremo, el otro conserva su posición absoluta exacta", () => {
  it("mueve el extremo 'end' y el 'start' permanece en su punto absoluto original", () => {
    const arrow: BoardElementUnknown = {
      id: "arr1",
      type: "arrow",
      x: 10,
      y: 10,
      points: [
        [0, 0],
        [90, 90],
      ],
    };
    // start absoluto = (10,10), end absoluto = (100,100) — se mueve end a (300,300).
    const moved = moveArrowEndpoint(arrow, "end", [300, 300]);

    // El extremo NO movido conserva su posición absoluta: x/y (=start absoluto) no cambian.
    expect(moved.x).toBe(10);
    expect(moved.y).toBe(10);
    const points = moved.points as [number, number][];
    expect(points[0]).toEqual([0, 0]);
    // El extremo movido, en absoluto, es exactamente el punto pedido.
    const newEndAbs: [number, number] = [Number(moved.x) + points[points.length - 1][0], Number(moved.y) + points[points.length - 1][1]];
    expect(newEndAbs).toEqual([300, 300]);
  });

  it("mueve el extremo 'start' y el 'end' conserva su posición absoluta original", () => {
    const arrow: BoardElementUnknown = {
      id: "arr1",
      type: "arrow",
      x: 10,
      y: 10,
      points: [
        [0, 0],
        [90, 90],
      ],
    };
    const originalEndAbs: [number, number] = [100, 100];
    const moved = moveArrowEndpoint(arrow, "start", [-50, -50]);

    const points = moved.points as [number, number][];
    // El nuevo x/y (=start absoluto tras el movimiento) es el punto pedido.
    expect(moved.x).toBe(-50);
    expect(moved.y).toBe(-50);
    // El extremo end, recalculado a absoluto con el nuevo origen, sigue siendo el mismo punto absoluto de antes.
    const newEndAbs: [number, number] = [Number(moved.x) + points[points.length - 1][0], Number(moved.y) + points[points.length - 1][1]];
    expect(newEndAbs).toEqual(originalEndAbs);
  });

  it("recalcula width/height como la caja que envuelve los puntos absolutos tras el movimiento", () => {
    const arrow: BoardElementUnknown = {
      id: "arr1",
      type: "arrow",
      x: 0,
      y: 0,
      points: [
        [0, 0],
        [50, 0],
      ],
    };
    const moved = moveArrowEndpoint(arrow, "end", [50, 200]);
    expect(moved.width).toBe(50);
    expect(moved.height).toBe(200);
  });

  it("tolera points ausentes con un fallback de dos puntos en el origen", () => {
    const arrow: BoardElementUnknown = { id: "arr1", type: "arrow" };
    const moved = moveArrowEndpoint(arrow, "end", [10, 10]);
    expect(moved.x).toBe(0);
    expect(moved.y).toBe(0);
  });
});

describe("summarizeBoardElements — una nota es UNA fila, nunca dos", () => {
  it("fusiona el texto ligado en la fila de su contenedor: nunca aparece como fila propia", () => {
    const { container, label } = buildStickyNote({ text: "Comprar leche", x: 0, y: 0, lastIndex: null });
    const summaries = summarizeBoardElements([container, label] as unknown as BoardElementUnknown[]);

    expect(summaries).toHaveLength(1);
    expect(summaries[0].element_id).toBe(container.id);
    expect(summaries[0].type).toBe("rectangle");
    expect(summaries[0].text_excerpt).toBe("Comprar leche");
    expect(summaries[0].text_element_id).toBe(label.id);
    // El id interno del texto no debe filtrarse como su propia entrada.
    expect(summaries.find((s) => s.element_id === label.id)).toBeUndefined();
  });

  it("una forma sin texto ligado no lleva text_excerpt ni text_element_id", () => {
    const shape = createShapeElement({ type: "ellipse", x: 0, y: 0, width: 100, height: 100, index: "a0" });
    const [summary] = summarizeBoardElements([shape] as unknown as BoardElementUnknown[]);
    expect(summary.text_excerpt).toBeUndefined();
    expect(summary.text_element_id).toBeUndefined();
  });

  it("un texto SUELTO (sin containerId) sí aparece como su propia fila, con su propio texto", () => {
    const standalone = createTextElement({ text: "Texto suelto", x: 0, y: 0, index: "a0" });
    const [summary] = summarizeBoardElements([standalone] as unknown as BoardElementUnknown[]);
    expect(summary.element_id).toBe(standalone.id);
    expect(summary.type).toBe("text");
    expect(summary.text_excerpt).toBe("Texto suelto");
    expect(summary.text_element_id).toBeUndefined();
  });

  it("recorta textos largos a TEXT_EXCERPT_MAX con elipsis", () => {
    const longText = "a".repeat(200);
    const standalone = createTextElement({ text: longText, x: 0, y: 0, index: "a0" });
    const [summary] = summarizeBoardElements([standalone] as unknown as BoardElementUnknown[]);
    expect(summary.text_excerpt!.endsWith("…")).toBe(true);
    expect(summary.text_excerpt!.length).toBe(61);
  });

  it("expone element_version e is_deleted tal cual del elemento subyacente", () => {
    const shape = { ...createShapeElement({ type: "rectangle", x: 0, y: 0, width: 10, height: 10, index: "a0" }), version: 7, isDeleted: true };
    const [summary] = summarizeBoardElements([shape] as unknown as BoardElementUnknown[]);
    expect(summary.element_version).toBe(7);
    expect(summary.is_deleted).toBe(true);
  });
});

describe("DELETION_GROUP_CUSTOM_DATA_KEY", () => {
  it("es la clave estable 'onyxlinkDeletionGroup' usada por resolve_assistant_pending_action() y restore_board_element", () => {
    expect(DELETION_GROUP_CUSTOM_DATA_KEY).toBe("onyxlinkDeletionGroup");
  });
});
