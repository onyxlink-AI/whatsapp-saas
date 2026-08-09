// Fase 4C — scene-merge.ts: fusión de cambios locales/remotos del
// autoguardado del editor. Pruebas obligatorias: cambios disjuntos
// fusionados; conflicto del mismo elemento rechazado; conflicto
// local/remoto visible sin pérdida (via "Conservar mis cambios" scoped).

import { describe, it, expect } from "vitest";
import { elementVersionsById, changedIds, mergeDisjointChanges, onlyAppStateChanged } from "./scene-merge";
import type { BoardElementUnknown } from "./scene-adapter";

function el(id: string, version: number, extra: Record<string, unknown> = {}): BoardElementUnknown {
  return { id, type: "rectangle", x: 0, y: 0, version, ...extra };
}

describe("elementVersionsById / changedIds", () => {
  it("mapea id -> version, ignora elementos sin id string", () => {
    expect(elementVersionsById([el("a", 1), el("b", 2)])).toEqual({ a: 1, b: 2 });
  });

  it("detecta altas, bajas y cambios de versión", () => {
    const base = { a: 1, b: 2 };
    const current = { a: 1, b: 3, c: 1 }; // b cambió, c es nuevo, a igual
    expect(changedIds(base, current)).toEqual(new Set(["b", "c"]));
  });
});

describe("mergeDisjointChanges — cambios en elementos DISTINTOS se fusionan sin conflicto", () => {
  it("gana lo local en el id que cambió local, gana lo remoto en el id que cambió remoto", () => {
    const base = { a: 1, b: 1 };
    const local = [el("a", 2, { text: "editado localmente" }), el("b", 1)];
    const remote = [el("a", 1), el("b", 2, { text: "editado remotamente" })];

    const result = mergeDisjointChanges({ baseVersions: base, localElements: local, remoteElements: remote });

    expect(result.kind).toBe("merged");
    if (result.kind !== "merged") throw new Error("expected merged");
    const byId = Object.fromEntries(result.elements.map((e) => [e.id, e]));
    expect(byId.a.text).toBe("editado localmente");
    expect(byId.b.text).toBe("editado remotamente");
  });

  it("un elemento nuevo solo local (creado por el asistente en otra sesión no, aquí local) se conserva en la fusión", () => {
    const base = { a: 1 };
    const local = [el("a", 1), el("new-local", 1, { text: "nuevo local" })];
    const remote = [el("a", 1)];

    const result = mergeDisjointChanges({ baseVersions: base, localElements: local, remoteElements: remote });
    expect(result.kind).toBe("merged");
    if (result.kind !== "merged") throw new Error("expected merged");
    expect(result.elements.some((e) => e.id === "new-local")).toBe(true);
  });

  it("un elemento nuevo solo remoto (creado por el asistente) se conserva en la fusión, nunca se pierde", () => {
    const base = { a: 1 };
    const local = [el("a", 1)];
    const remote = [el("a", 1), el("new-remote", 1, { text: "nuevo del asistente" })];

    const result = mergeDisjointChanges({ baseVersions: base, localElements: local, remoteElements: remote });
    expect(result.kind).toBe("merged");
    if (result.kind !== "merged") throw new Error("expected merged");
    expect(result.elements.some((e) => e.id === "new-remote")).toBe(true);
  });

  it("elementos sin cambiar en ningún lado se conservan tal cual (versión remota, da igual cuál ya que son iguales)", () => {
    const base = { a: 1, c: 1 };
    const local = [el("a", 2), el("c", 1)];
    const remote = [el("a", 1), el("c", 1)];
    const result = mergeDisjointChanges({ baseVersions: base, localElements: local, remoteElements: remote });
    expect(result.kind).toBe("merged");
    if (result.kind !== "merged") throw new Error("expected merged");
    expect(result.elements.find((e) => e.id === "c")!.version).toBe(1);
  });
});

describe("mergeDisjointChanges — el MISMO elemento cambiado en ambos lados se rechaza, nunca se pisa a ciegas", () => {
  it("devuelve same_element_conflict con el id conflictivo, sin elegir un ganador por su cuenta", () => {
    const base = { a: 1 };
    const local = [el("a", 2, { text: "versión local" })];
    const remote = [el("a", 2, { text: "versión remota" })]; // misma base-version pero contenido distinto -> ambos lo cambiaron

    const result = mergeDisjointChanges({ baseVersions: base, localElements: local, remoteElements: remote });
    expect(result.kind).toBe("same_element_conflict");
    if (result.kind !== "same_element_conflict") throw new Error("expected conflict");
    expect(result.conflictingIds).toEqual(["a"]);
  });

  it("un conflicto de un elemento no bloquea la fusión de otros elementos disjuntos — solo ese id queda pendiente", () => {
    const base = { a: 1, b: 1 };
    const local = [el("a", 2, { text: "local a" }), el("b", 2, { text: "local b" })];
    const remote = [el("a", 2, { text: "remote a" }), el("b", 1)]; // a: conflicto; b: solo local cambió
    const result = mergeDisjointChanges({ baseVersions: base, localElements: local, remoteElements: remote });
    expect(result.kind).toBe("same_element_conflict");
    if (result.kind !== "same_element_conflict") throw new Error("expected conflict");
    expect(result.conflictingIds).toEqual(["a"]);
  });

  it("'Conservar mis cambios' (preferLocalForIds) resuelve el conflicto a favor de lo local, SOLO para esos ids", () => {
    const base = { a: 1, b: 1 };
    const local = [el("a", 2, { text: "local a" }), el("b", 2, { text: "local b" })];
    const remote = [el("a", 2, { text: "remote a" }), el("b", 1)];

    const result = mergeDisjointChanges({
      baseVersions: base,
      localElements: local,
      remoteElements: remote,
      preferLocalForIds: new Set(["a"]),
    });

    expect(result.kind).toBe("merged");
    if (result.kind !== "merged") throw new Error("expected merged");
    const byId = Object.fromEntries(result.elements.map((e) => [e.id, e]));
    expect(byId.a.text).toBe("local a"); // decisión explícita del usuario
    expect(byId.b.text).toBe("local b"); // b nunca tuvo conflicto, se fusiona normal
  });
});

describe("onlyAppStateChanged", () => {
  it("true cuando ningún elemento cambió de versión (solo pudo cambiar zoom/scroll)", () => {
    const base = { a: 1, b: 2 };
    expect(onlyAppStateChanged(base, [el("a", 1), el("b", 2)])).toBe(true);
  });

  it("false en cuanto un elemento cambió de versión", () => {
    const base = { a: 1 };
    expect(onlyAppStateChanged(base, [el("a", 2)])).toBe(false);
  });
});
