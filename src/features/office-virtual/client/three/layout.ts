// Building layout: a spacious 4x3 grid of 12 offices — Orquestador, Agente
// WhatsApp, Agente de Voz, Chatbot, and 8 configurable specialist seats.
// Every room shares the same footprint and is open on its local +Z side
// (the side facing the camera); walls close off the left, right and far
// (-Z) sides. Supersedes the earlier 3x2 grid + separate coordinator room —
// with 12 uniform seats there's no longer a reason for the coordinator to
// get a special-cased room.
export const ROOM_W = 8.2;
export const ROOM_D = 6.5;
export const WALL_H = 3;
export const WALL_T = 0.2;
// Real circulation lanes between rooms. The previous decorative 70 cm gap
// could not physically accommodate a walking character or an opening door.
export const GAP = 1.8;

export const SPACING_X = ROOM_W + GAP;
export const SPACING_Z = ROOM_D + GAP;

export const COLS = 4;
export const ROWS = 3;

export function roomCenter(index: number): [number, number, number] {
  const col = index % COLS;
  const row = Math.floor(index / COLS);
  const x = (col - (COLS - 1) / 2) * SPACING_X;
  // row 0 sits closer to the camera (+Z), later rows further back (-Z).
  const z = ((ROWS - 1) / 2 - row) * SPACING_Z;
  return [x, 0, z];
}

export const BUILDING_WIDTH = COLS * SPACING_X;
export const BUILDING_DEPTH = ROWS * SPACING_Z;

// ──────────────────────────────────────────────────────────────────────────
// Cafetería y pasillo de conexión — antes vivían como números sueltos
// dentro de Building.tsx (cafeCenter desplazado a un lateral, x = mitad del
// edificio + 12). Ahora la cafetería queda CENTRADA en el mismo eje X=0 que
// la rejilla de despachos, delante de ellos (mayor Z), enlazada por un
// pasillo ancho y despejado a lo largo de Z — nunca desplazada a un extremo.
// ──────────────────────────────────────────────────────────────────────────

/** Eje Z del pasillo principal (spine) que recorre el frente de los 4 despachos de la fila 0. */
export const CORRIDOR_Z = roomCenter(0)[2] + ROOM_D / 2 + GAP / 2;

/**
 * Huella de la cafetería EN SU PROPIO MARCO LOCAL (antes de rotarla) — el
 * interior (mesas, barra, expositor de tazas, puertas) se sigue definiendo
 * con estos mismos números en `CafeLounge`. La rotación de -90° sobre Y que
 * aplica `Building.tsx` hace que la pared con las 2 puertas (antes en el
 * lateral local -X) pase a mirar hacia la oficina (-Z mundo) en vez de
 * hacia un lateral — ver `officePathing.ts` para la transformación exacta,
 * compartida entre el render y las rutas de los agentes.
 */
export const CAFE_LOCAL_WIDTH = 16; // eje local X (antes: ancho visible al aproximarse desde el lateral)
export const CAFE_LOCAL_DEPTH = 13; // eje local Z
export const CAFE_ROTATION_Y = -Math.PI / 2;

/** Tras la rotación de -90°, el ancho/profundidad locales quedan intercambiados en el mundo. */
export const CAFE_WORLD_WIDTH = CAFE_LOCAL_DEPTH; // eje mundo X
export const CAFE_WORLD_DEPTH = CAFE_LOCAL_WIDTH; // eje mundo Z

/** Pasillo ancho y despejado que conecta el spine de despachos con la puerta de la cafetería. */
export const CAFE_CORRIDOR_GAP = 4;
export const CAFE_CORRIDOR_WIDTH = 3.4;

export const CAFE_CENTER_Z = CORRIDOR_Z + CAFE_CORRIDOR_GAP + CAFE_WORLD_DEPTH / 2;
export const CAFE_CENTER: [number, number, number] = [0, 0, CAFE_CENTER_Z];

// ──────────────────────────────────────────────────────────────────────────
// Espacio reservado para futuros módulos (Marketing, parque, recepción,
// reuniones...) — solo constantes de reserva, nada se renderiza aquí
// todavía. Mantiene despejados los laterales del edificio y la franja
// trasera (detrás de la fila 2, la más alejada de la cafetería).
// ──────────────────────────────────────────────────────────────────────────
export const RESERVED_MODULE_GAP = 6;
export const RESERVED_MODULE_WIDTH = 20;
export const RESERVED_MODULE_LEFT_X = -(BUILDING_WIDTH / 2 + RESERVED_MODULE_GAP + RESERVED_MODULE_WIDTH / 2);
export const RESERVED_MODULE_RIGHT_X = BUILDING_WIDTH / 2 + RESERVED_MODULE_GAP + RESERVED_MODULE_WIDTH / 2;
export const RESERVED_MODULE_REAR_Z = -(BUILDING_DEPTH / 2 + RESERVED_MODULE_GAP + RESERVED_MODULE_WIDTH / 2);
