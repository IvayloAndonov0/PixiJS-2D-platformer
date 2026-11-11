/**
 * Overworld map layout. The map is a top-down world bigger than the screen; the camera follows the player.
 *
 * To put a new boss on the map: add it to BOSSES in bosses.ts, then change one of the locked
 * nodes below to `{ ..., boss: <its index> }` (or add a new node and a path to it).
 */

export const MAP_W = 2400;
export const MAP_H = 1500;

/** Where the player starts on a fresh visit. */
export const MAP_START = { x: 330, y: 1180 };

export interface MapNode {
  x: number;
  y: number;
  /** Index into BOSSES. Omit for a locked "coming soon" spot. */
  boss?: number;
}

export const MAP_NODES: MapNode[] = [
  { x: 820, y: 940, boss: 0 },
  { x: 1400, y: 640, boss: 1 },
  { x: 2000, y: 980, boss: 2 },
  { x: 1960, y: 340, boss: 3 },
  { x: 720, y: 380, boss: 4 },
];

/** Dirt paths as waypoint lists (drawn as smooth curves). Purely visual: you can walk anywhere open. */
export const MAP_PATHS: { x: number; y: number }[][] = [
  [MAP_START, { x: 520, y: 1120 }, { x: 640, y: 980 }, MAP_NODES[0]],
  [MAP_NODES[0], { x: 1010, y: 860 }, { x: 1180, y: 700 }, MAP_NODES[1]],
  [MAP_NODES[1], { x: 1640, y: 700 }, { x: 1800, y: 900 }, MAP_NODES[2]],
  [MAP_NODES[1], { x: 1560, y: 470 }, { x: 1780, y: 360 }, MAP_NODES[3]],
  [MAP_NODES[1], { x: 1220, y: 520 }, { x: 960, y: 420 }, MAP_NODES[4]],
];

/** Lake, as overlapping circles (also its collision). */
export const LAKE: { x: number; y: number; r: number }[] = [
  { x: 1220, y: 1180, r: 150 },
  { x: 1380, y: 1240, r: 120 },
  { x: 1080, y: 1250, r: 110 },
  { x: 1270, y: 1060, r: 80 },
  { x: 1500, y: 1290, r: 80 },
];
