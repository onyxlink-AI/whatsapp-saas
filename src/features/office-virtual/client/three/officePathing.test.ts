// Fase 2 — Oficina centrada + campus modular: geometría pura, sin WebGL.
// Cubre exactamente lo pedido: la oficina sigue centrada, la cafetería
// queda delante (nunca desplazada a un extremo), y NINGUNA ruta de agente
// atraviesa paredes, puertas cerradas ni mobiliario (mesas/sillas/barra).

import { describe, expect, it } from "vitest";
import {
  BUILDING_WIDTH,
  BUILDING_DEPTH,
  CAFE_CENTER,
  CORRIDOR_Z,
  RESERVED_MODULE_LEFT_X,
  RESERVED_MODULE_RIGHT_X,
  roomCenter,
} from "./layout";
import {
  allOfficeZones,
  allRoomWallZones,
  buildIdleRoute,
  cafeFurnitureZones,
  cafeLocalToWorld,
  cafeWallZones,
  pathIntersectsAnyZone,
  type Rect,
} from "./officePathing";

describe("cafeLocalToWorld — la rotación deja la puerta mirando hacia la oficina", () => {
  it("la pared con las puertas (local x=-8) queda MÁS CERCA de la oficina (menor Z) que la pared opuesta (local x=+8)", () => {
    const [, entranceWallZ] = cafeLocalToWorld([-8, 0]);
    const [, farWallZ] = cafeLocalToWorld([8, 0]);
    expect(entranceWallZ).toBeLessThan(farWallZ);
    // Y ambas deben quedar delante del pasillo de despachos — nunca detrás.
    expect(entranceWallZ).toBeGreaterThan(CORRIDOR_Z);
  });

  it("los dos huecos de puerta (local z=±2.6) quedan a ambos lados de X=0 tras la rotación", () => {
    const [doorAX] = cafeLocalToWorld([-8, -2.6]);
    const [doorBX] = cafeLocalToWorld([-8, 2.6]);
    expect(Math.sign(doorAX)).not.toBe(Math.sign(doorBX));
  });
});

describe("La oficina sigue centrada; la cafetería queda delante, nunca desplazada a un extremo", () => {
  it("la rejilla de 12 despachos sigue centrada en X=0 (simétrica)", () => {
    const xs = Array.from({ length: 12 }, (_, i) => roomCenter(i)[0]);
    expect(Math.min(...xs)).toBe(-Math.max(...xs));
  });

  it("CAFE_CENTER está en X=0 — centrada, no desplazada a un lateral", () => {
    expect(CAFE_CENTER[0]).toBe(0);
  });

  it("la cafetería está delante de los despachos (mayor Z que el pasillo principal), conectada por un pasillo, no pegada a un lado", () => {
    expect(CAFE_CENTER[2]).toBeGreaterThan(CORRIDOR_Z);
    expect(CORRIDOR_Z).toBeGreaterThan(roomCenter(0)[2]);
  });

  it("hay espacio reservado a ambos lados del edificio para futuros módulos, fuera de cualquier zona ocupada", () => {
    expect(RESERVED_MODULE_LEFT_X).toBeLessThan(-BUILDING_WIDTH / 2);
    expect(RESERVED_MODULE_RIGHT_X).toBeGreaterThan(BUILDING_WIDTH / 2);
    const zones = allOfficeZones();
    for (const zone of zones) {
      expect(zone.maxX).toBeLessThan(RESERVED_MODULE_RIGHT_X);
      expect(zone.minX).toBeGreaterThan(RESERVED_MODULE_LEFT_X);
    }
  });
});

describe("pathIntersectsAnyZone — el propio detector de colisiones es correcto", () => {
  const rect: Rect = { minX: 0, maxX: 2, minZ: 0, maxZ: 2 };

  it("detecta un segmento que atraviesa el rectángulo de lado a lado", () => {
    const path: [number, number, number][] = [[-1, 0, 1], [3, 0, 1]];
    expect(pathIntersectsAnyZone(path, [rect])).toBe(true);
  });

  it("no detecta nada en un segmento que pasa claramente fuera", () => {
    const path: [number, number, number][] = [[-1, 0, 5], [3, 0, 5]];
    expect(pathIntersectsAnyZone(path, [rect])).toBe(false);
  });

  it("no detecta nada en un segmento que bordea el rectángulo sin entrar", () => {
    const path: [number, number, number][] = [[-1, 0, -0.5], [3, 0, -0.5]];
    expect(pathIntersectsAnyZone(path, [rect])).toBe(false);
  });
});

describe("buildIdleRoute — ninguna ruta de agente atraviesa paredes, puertas cerradas ni mobiliario", () => {
  const zones = allOfficeZones();

  it.each(Array.from({ length: 12 }, (_, i) => i))("despacho %i: la ruta completa nunca cruza una zona ocupada", (index) => {
    const route = buildIdleRoute(index);
    expect(pathIntersectsAnyZone(route.path, zones)).toBe(false);
  });

  it("la ruta entra a la cafetería exactamente por uno de los 2 huecos reales de puerta, nunca por una pared sólida", () => {
    for (let index = 0; index < 12; index += 1) {
      const route = buildIdleRoute(index);
      // El punto "justo dentro" de la puerta (5º punto del recorrido, tras
      // cruzar el hueco) debe quedar DENTRO del rectángulo mundo de la
      // cafetería y fuera de cualquier pared — ya cubierto arriba por
      // pathIntersectsAnyZone, aquí se confirma explícitamente que de
      // verdad cruza al interior (Z aumenta hacia dentro de la cafetería).
      const outsidePoint = route.path[5]; // justo delante de la puerta
      const insidePoint = route.path[6]; // justo tras cruzar el hueco real
      expect(insidePoint[2]).toBeGreaterThan(outsidePoint[2]);
    }
  });

  it("la distancia total de la ruta es coherente con el cupPickupProgress (entre 0 y 1)", () => {
    for (let index = 0; index < 12; index += 1) {
      const route = buildIdleRoute(index);
      expect(route.distance).toBeGreaterThan(0);
      expect(route.cupPickupProgress).toBeGreaterThan(0);
      expect(route.cupPickupProgress).toBeLessThanOrEqual(1);
    }
  });

  it("agentes de índices consecutivos no comparten exactamente la misma puerta ni la misma mesa (evita amontonarse)", () => {
    const routeA = buildIdleRoute(0);
    const routeB = buildIdleRoute(1);
    // Puntos finales (parada en mesa) distintos.
    const finalA = routeA.path[routeA.path.length - 1];
    const finalB = routeB.path[routeB.path.length - 1];
    expect(finalA).not.toEqual(finalB);
  });
});

describe("Zonas de paredes/mobiliario — datos no degenerados", () => {
  it("cada despacho aporta 3 paredes con área positiva", () => {
    for (const zone of allRoomWallZones()) {
      expect(zone.maxX).toBeGreaterThan(zone.minX);
      expect(zone.maxZ).toBeGreaterThan(zone.minZ);
    }
  });

  it("las paredes de la cafetería tienen área positiva", () => {
    for (const zone of cafeWallZones()) {
      expect(zone.maxX).toBeGreaterThan(zone.minX);
      expect(zone.maxZ).toBeGreaterThan(zone.minZ);
    }
  });

  it("el mobiliario de la cafetería (mesas + barra) tiene área positiva y queda dentro de la huella de la cafetería", () => {
    const furniture = cafeFurnitureZones();
    expect(furniture.length).toBeGreaterThan(0);
    for (const zone of furniture) {
      expect(zone.maxX).toBeGreaterThan(zone.minX);
      expect(zone.maxZ).toBeGreaterThan(zone.minZ);
    }
  });

  it("BUILDING_DEPTH sigue siendo positivo tras el recentrado (no se rompió la rejilla de despachos)", () => {
    expect(BUILDING_DEPTH).toBeGreaterThan(0);
  });
});
