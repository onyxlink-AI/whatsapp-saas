// Building layout: a fixed 3x2 grid of offices. Every room shares the same
// footprint and is open on its local +Z side (the side facing the camera);
// walls close off the left, right and far (-Z) sides.

// Every department uses the same generous footprint. Coordination is no
// longer a special-sized room, which keeps the whole office visually fair.
export const ROOM_W = 8.8;
export const ROOM_D = 6.9;
export const WALL_H = 3;
export const WALL_T = 0.2;
export const GAP = 0.7;

export const SPACING_X = ROOM_W + GAP;
export const SPACING_Z = ROOM_D + GAP;

export const COLS = 3;
export const ROWS = 2;

export function roomCenter(index: number): [number, number, number] {
  const col = index % COLS;
  const row = Math.floor(index / COLS);
  const x = (col - (COLS - 1) / 2) * SPACING_X;
  // row 0 sits closer to the camera (+Z), row 1 further back (-Z).
  const z = ((ROWS - 1) / 2 - row) * SPACING_Z;
  return [x, 0, z];
}

export const BUILDING_WIDTH = COLS * SPACING_X;

export const COORD_ROOM_W = ROOM_W;
export const COORD_ROOM_D = ROOM_D;

export function coordinatorRoomCenter(): [number, number, number] {
  const frontRowEdge = ((ROWS - 1) / 2) * SPACING_Z + ROOM_D / 2;
  const z = frontRowEdge + GAP + COORD_ROOM_D / 2;
  return [0, 0, z];
}

export const BUILDING_DEPTH = ROWS * SPACING_Z + GAP + COORD_ROOM_D;
