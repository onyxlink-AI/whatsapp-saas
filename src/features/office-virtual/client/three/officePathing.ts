// Fase 2 — Oficina centrada + campus modular: geometría de rutas y zonas
// ocupadas (paredes/mobiliario), extraída de Building.tsx a un módulo puro
// (sin JSX/React) para poder testearla sin renderizar WebGL — mismo patrón
// ya establecido por idleMotion.ts en este mismo directorio.
//
// La cafetería se define en su propio marco LOCAL (mismos números que ya
// usaba `CafeLounge`, sin tocarlos) y se rota -90° sobre Y al colocarla en
// el mundo — la pared con las 2 puertas (antes mirando a un lateral) pasa a
// mirar hacia la oficina. `cafeLocalToWorld()` usa la propia matemática de
// three.js (Vector3.applyAxisAngle), nunca trigonometría a mano, para que
// el render (Building.tsx) y estas rutas/zonas de colisión compartan
// EXACTAMENTE la misma transformación — un error de signo se detectaría en
// las pruebas de geometría, no solo "se vería mal" sin que nada lo avise.
import * as THREE from 'three';
import {
  CAFE_CENTER,
  CAFE_LOCAL_DEPTH,
  CAFE_LOCAL_WIDTH,
  CAFE_ROTATION_Y,
  CORRIDOR_Z,
  GAP,
  ROOM_D,
  ROOM_W,
  WALL_T,
  roomCenter,
} from './layout';

const Y_AXIS = new THREE.Vector3(0, 1, 0);

/** Traduce un punto del marco LOCAL de la cafetería (antes de rotar) a coordenadas de mundo. */
export function cafeLocalToWorld([localX, localZ]: [number, number]): [number, number] {
  const v = new THREE.Vector3(localX, 0, localZ).applyAxisAngle(Y_AXIS, CAFE_ROTATION_Y);
  return [CAFE_CENTER[0] + v.x, CAFE_CENTER[2] + v.z];
}

export interface Rect {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

function localRectToWorldRect(rect: Rect): Rect {
  const localCorners: [number, number][] = [
    [rect.minX, rect.minZ],
    [rect.minX, rect.maxZ],
    [rect.maxX, rect.minZ],
    [rect.maxX, rect.maxZ],
  ];
  const corners = localCorners.map((corner) => cafeLocalToWorld(corner));
  const xs = corners.map((c) => c[0]);
  const zs = corners.map((c) => c[1]);
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minZ: Math.min(...zs), maxZ: Math.max(...zs) };
}

// ──────────────────────────────────────────────────────────────────────────
// Zonas ocupadas — paredes de despacho y de cafetería, mobiliario (mesas,
// barra). Un despacho está abierto en su lado local +Z (donde está la
// puerta) — solo sus otras 3 paredes bloquean.
// ──────────────────────────────────────────────────────────────────────────
export function roomWallZones(index: number): Rect[] {
  const [cx, , cz] = roomCenter(index);
  const halfW = ROOM_W / 2;
  const halfD = ROOM_D / 2;
  return [
    { minX: cx - halfW - WALL_T, maxX: cx - halfW, minZ: cz - halfD, maxZ: cz + halfD }, // izquierda
    { minX: cx + halfW, maxX: cx + halfW + WALL_T, minZ: cz - halfD, maxZ: cz + halfD }, // derecha
    { minX: cx - halfW, maxX: cx + halfW, minZ: cz - halfD - WALL_T, maxZ: cz - halfD }, // fondo
  ];
}

export function allRoomWallZones(roomCount = 12): Rect[] {
  return Array.from({ length: roomCount }, (_, i) => roomWallZones(i)).flat();
}

/**
 * Paredes/mobiliario de la cafetería, en su marco LOCAL — mismos números
 * que usa `CafeLounge` en Building.tsx (nunca duplicados a mano: si
 * `CafeLounge` cambia su interior, estos rects deben actualizarse junto a
 * él). Las 2 puertas de la pared local x=-8 quedan como los huecos entre
 * los 3 segmentos de pared (en z≈-5, 0 y 5) — igual que hoy.
 */
const CAFE_LOCAL_WALL_SEGMENTS: Rect[] = [
  // Pared derecha (local x=+8), sólida en toda su longitud.
  { minX: CAFE_LOCAL_WIDTH / 2 - 0.09, maxX: CAFE_LOCAL_WIDTH / 2 + 0.09, minZ: -CAFE_LOCAL_DEPTH / 2, maxZ: CAFE_LOCAL_DEPTH / 2 },
  // Pared trasera (local z=-6.5), sólida.
  { minX: -CAFE_LOCAL_WIDTH / 2, maxX: CAFE_LOCAL_WIDTH / 2, minZ: -CAFE_LOCAL_DEPTH / 2 - 0.09, maxZ: -CAFE_LOCAL_DEPTH / 2 + 0.09 },
  // Pared local x=-8, segmentada en 3 tramos — deja 2 puertas (huecos) en z≈±2.6.
  { minX: -CAFE_LOCAL_WIDTH / 2 - 0.09, maxX: -CAFE_LOCAL_WIDTH / 2 + 0.09, minZ: -6.5, maxZ: -3.5 },
  { minX: -CAFE_LOCAL_WIDTH / 2 - 0.09, maxX: -CAFE_LOCAL_WIDTH / 2 + 0.09, minZ: -1.7, maxZ: 1.7 },
  { minX: -CAFE_LOCAL_WIDTH / 2 - 0.09, maxX: -CAFE_LOCAL_WIDTH / 2 + 0.09, minZ: 3.5, maxZ: 6.5 },
];

const CAFE_LOCAL_FURNITURE: Rect[] = [
  // Barra/mostrador (incluye expositor de tazas), local position [2.4,0,-5.4], caja [10,1.12,1.25].
  { minX: 2.4 - 5, maxX: 2.4 + 5, minZ: -5.4 - 0.625, maxZ: -5.4 + 0.625 },
  // 4 mesas con sus sillas — aproximadas como un único rect por mesa (mesa + 2 sillas a ±1.85 en x).
  ...([[-4.5, -1.5], [2, -1.5], [-4.5, 3.4], [2, 3.4]] as [number, number][]).map(([x, z]) => ({
    minX: x - 2.2,
    maxX: x + 2.2,
    minZ: z - 1,
    maxZ: z + 1,
  })),
];

export function cafeWallZones(): Rect[] {
  return CAFE_LOCAL_WALL_SEGMENTS.map(localRectToWorldRect);
}

export function cafeFurnitureZones(): Rect[] {
  return CAFE_LOCAL_FURNITURE.map(localRectToWorldRect);
}

export function allOfficeZones(roomCount = 12): Rect[] {
  return [...allRoomWallZones(roomCount), ...cafeWallZones(), ...cafeFurnitureZones()];
}

// ──────────────────────────────────────────────────────────────────────────
// Detección de colisión de un segmento de ruta (línea recta 2D, plano XZ)
// contra un rectángulo — usada tanto por las pruebas como, si hiciera
// falta, por cualquier validación en tiempo de ejecución.
// ──────────────────────────────────────────────────────────────────────────
function segmentIntersectsRect(a: [number, number], b: [number, number], rect: Rect): boolean {
  // Clip de Liang-Barsky: el segmento no colisiona si existe un parámetro t
  // en [0,1] donde el punto interpolado cae DENTRO del rectángulo.
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  let tMin = 0;
  let tMax = 1;
  const clip = (p: number, q: number): boolean => {
    if (p === 0) return q >= 0;
    const r = q / p;
    if (p < 0) {
      if (r > tMax) return false;
      if (r > tMin) tMin = r;
    } else {
      if (r < tMin) return false;
      if (r < tMax) tMax = r;
    }
    return true;
  };
  if (!clip(-dx, a[0] - rect.minX)) return false;
  if (!clip(dx, rect.maxX - a[0])) return false;
  if (!clip(-dz, a[1] - rect.minZ)) return false;
  if (!clip(dz, rect.maxZ - a[1])) return false;
  return tMin <= tMax;
}

export function pathIntersectsAnyZone(path: [number, number, number][], zones: Rect[]): boolean {
  for (let i = 0; i < path.length - 1; i += 1) {
    const a: [number, number] = [path[i][0], path[i][2]];
    const b: [number, number] = [path[i + 1][0], path[i + 1][2]];
    for (const rect of zones) {
      if (segmentIntersectsRect(a, b, rect)) return true;
    }
  }
  return false;
}

// ──────────────────────────────────────────────────────────────────────────
// Ruta completa de un agente inactivo: despacho → pasillo compartido →
// pasillo de conexión hacia la cafetería (siempre por delante de los
// despachos, nunca atravesándolos) → dentro de la cafetería por una de las
// 2 puertas reales, hasta el expositor de tazas y una mesa.
// ──────────────────────────────────────────────────────────────────────────
const DESK_LOCAL_Z = -ROOM_D / 2 + 1.25;
export const WORK_CHAIR_LOCAL_Z = DESK_LOCAL_Z + 1.05;
export const PATROL_LOCAL_Z = 0.8;
export const PATROL_AMPLITUDE = 2.75;
export { DESK_LOCAL_Z };

export interface IdleRoute {
  path: [number, number, number][];
  distance: number;
  cupPickupProgress: number;
}

export function pathDistance(start: [number, number, number], path: [number, number, number][]): number {
  let distance = 0;
  let previous = start;
  for (const point of path) {
    distance += Math.hypot(point[0] - previous[0], point[2] - previous[2]);
    previous = point;
  }
  return distance;
}

export function buildIdleRoute(index: number): IdleRoute {
  const room = roomCenter(index);
  const laneOffset = (index % 4 - 1.5) * 0.28;
  const rowCorridorZ = room[2] + ROOM_D / 2 + GAP / 2 + laneOffset;
  // Los despachos que NO son de la fila 0 (los más cercanos a la cafetería)
  // no pueden subir en línea recta hasta el pasillo principal a su propia
  // X — esa línea cruzaría de lleno los despachos de las filas que tiene
  // delante. En su lugar cruzan primero, en horizontal y siempre por la
  // franja despejada entre filas (rowCorridorZ, nunca atraviesa paredes),
  // hasta el hueco libre entre las columnas 1 y 2 (x≈0 — el mismo eje que
  // usa después el pasillo de conexión con la cafetería) y solo entonces
  // suben en vertical por ese hueco, que está despejado en TODAS las filas
  // por diseño de la rejilla (misma separación de columnas en cada fila).
  const columnGapX = (index % 3 - 1) * 0.5;
  // Dos puertas reales en la cafetería — cada agente usa una según su índice,
  // igual que antes, para que no se amontonen todos en la misma.
  const entranceZ = index % 2 === 0 ? -2.6 : 2.6;
  const cafeAisleZ = index % 2 === 0 ? 0.35 : 1.35;
  const cupStationX = 2.8 + (index % 6) * 0.42;
  const cafeStopX = -6.05 + (index % 6) * 2.35;

  const doorOuter = cafeLocalToWorld([-CAFE_LOCAL_WIDTH / 2 - 0.55, entranceZ]);
  const doorInner = cafeLocalToWorld([-CAFE_LOCAL_WIDTH / 2 + 0.6, entranceZ]);
  const aisleNorth = cafeLocalToWorld([-CAFE_LOCAL_WIDTH / 2 + 0.6, cafeAisleZ]);
  const counterStrip = cafeLocalToWorld([-CAFE_LOCAL_WIDTH / 2 + 0.6, -4.2]);
  const cupStation = cafeLocalToWorld([cupStationX, -4.2]);
  const backToStrip = cafeLocalToWorld([-CAFE_LOCAL_WIDTH / 2 + 1, -4.2]);
  const backToAisle = cafeLocalToWorld([-CAFE_LOCAL_WIDTH / 2 + 1, cafeAisleZ]);
  const tableStop = cafeLocalToWorld([cafeStopX, cafeAisleZ]);

  const path: [number, number, number][] = [
    [room[0] + ROOM_W / 2 - 1.15, 0, room[2] + ROOM_D / 2 + 0.35],
    [room[0] + ROOM_W / 2 - 1.15, 0, rowCorridorZ],
    // Cruza en horizontal, SIEMPRE dentro de la franja despejada entre
    // filas (misma Z), hasta el hueco libre entre columnas — nunca cambia
    // de Z a la X de su propio despacho, que atravesaría los despachos que
    // tenga delante si no es de la fila 0.
    [columnGapX, 0, rowCorridorZ],
    // Sube por ese hueco (despejado en TODAS las filas) hasta el pasillo principal.
    [columnGapX, 0, CORRIDOR_Z],
    // Alineado en X bajo la puerta elegida, todavía en el pasillo principal.
    [doorOuter[0], 0, CORRIDOR_Z],
    // Sube por el pasillo ancho de conexión hasta quedar justo delante de la puerta.
    [doorOuter[0], 0, doorOuter[1]],
    // Atraviesa el hueco real de la puerta.
    [doorInner[0], 0, doorInner[1]],
    // Gira hacia el pasillo interior despejado.
    [aisleNorth[0], 0, aisleNorth[1]],
    [counterStrip[0], 0, counterStrip[1]],
    // Llega al expositor real de tazas.
    [cupStation[0], 0, cupStation[1]],
    [backToStrip[0], 0, backToStrip[1]],
    [backToAisle[0], 0, backToAisle[1]],
    // Última parada, junto a una mesa.
    [tableStop[0], 0, tableStop[1]],
  ];

  const start: [number, number, number] = [room[0], room[1], room[2] + PATROL_LOCAL_Z];
  const distance = pathDistance(start, path);
  const pickupDistance = pathDistance(start, path.slice(0, 10));
  return { path, distance, cupPickupProgress: Math.min(0.94, pickupDistance / distance) };
}
