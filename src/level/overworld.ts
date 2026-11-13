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
  /** The shop building instead of a level. */
  shop?: boolean;
}

export const MAP_NODES: MapNode[] = [
  { x: 820, y: 940, boss: 0 },
  { x: 1400, y: 640, boss: 1 },
  { x: 2000, y: 980, boss: 2 },
  { x: 1960, y: 340, boss: 3 },
  { x: 720, y: 380, boss: 4 },
];

/**
 * The shop building. Kept out of MAP_NODES / MAP_PATHS on purpose: those drive the tree layout,
 * and changing them would reshuffle every tree on the map.
 */
export const MAP_SHOP: MapNode = { x: 420, y: 740, shop: true };
export const SHOP_PATH = [MAP_START, { x: 360, y: 960 }, MAP_SHOP];

/** Dirt paths as waypoint lists (drawn as smooth curves). Purely visual: you can walk anywhere open. */
export const MAP_PATHS: { x: number; y: number }[][] = [
  [MAP_START, { x: 520, y: 1120 }, { x: 640, y: 980 }, MAP_NODES[0]],
  [MAP_NODES[0], { x: 1010, y: 860 }, { x: 1180, y: 700 }, MAP_NODES[1]],
  [MAP_NODES[1], { x: 1640, y: 700 }, { x: 1800, y: 900 }, MAP_NODES[2]],
  [MAP_NODES[1], { x: 1560, y: 470 }, { x: 1780, y: 360 }, MAP_NODES[3]],
  [MAP_NODES[1], { x: 1220, y: 520 }, { x: 960, y: 420 }, MAP_NODES[4]],
];

/**
 * Coins hidden around the map, 1 coin each, collectable once per save file (tracked by id, so
 * never reuse or renumber an id). Trees are kept clear of them; keep them away from water.
 */
export const MAP_COINS: { id: string; x: number; y: number }[] = [
  { id: "c1", x: 250, y: 880 },
  { id: "c2", x: 600, y: 560 },
  { id: "c3", x: 980, y: 1060 },
  { id: "c4", x: 1100, y: 450 },
  { id: "c5", x: 1650, y: 560 },
  { id: "c6", x: 2200, y: 700 },
  { id: "c7", x: 2180, y: 1260 },
  { id: "c8", x: 1750, y: 1150 },
  { id: "c9", x: 1650, y: 1270 },
  { id: "c10", x: 470, y: 1290 },
  { id: "c11", x: 860, y: 1290 },
  { id: "c12", x: 1250, y: 850 },
  { id: "c13", x: 2160, y: 230 },
  { id: "c14", x: 1500, y: 250 },
  { id: "c15", x: 300, y: 300 },
  { id: "c16", x: 1000, y: 230 },
];

/** Lake, as overlapping circles (also its collision). */
export const LAKE: { x: number; y: number; r: number }[] = [
  { x: 1220, y: 1180, r: 150 },
  { x: 1380, y: 1240, r: 120 },
  { x: 1080, y: 1250, r: 110 },
  { x: 1270, y: 1060, r: 80 },
  { x: 1500, y: 1290, r: 80 },
];
