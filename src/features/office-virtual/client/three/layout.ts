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
export const GAP = 0.7;

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
