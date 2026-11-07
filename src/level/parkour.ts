import type { TerrainDef } from "./Terrain";

/**
 * Parkour run before the boss arena. It lives at NEGATIVE x so the arena keeps its
 * 0..1280 coordinates: the run goes from x = -3200 up to x = 0, where the arena starts.
 *
 * Reach (with the default PLAYER tuning):
 *   - full jump: ~155px up, ~250px across
 *   - jump + dash: ~400px across
 * Floor height is GROUND_Y (640). Platform `y` is its top surface.
 */
export interface IntroDef extends TerrainDef {
  /** Player start x */
  start: number;
  /** Text signs along the way: { x, y, text } */
  signs: { x: number; y: number; text: string }[];
}

export const PARKOUR_1: IntroDef = {
  start: -3100,
  floor: [
    [-3200, -2600], // start area
    [-2440, -2050], // after the first small pit
    [-1750, -1450], // after the stepping-stone pit
    [-900, -620], // after the moving-platform pit
    [-250, 0], // run-up to the arena (arena floor 0..1280 is added by the scene)
  ],
  platforms: [
    // Warm-up: hop onto a platform
    { x: -2950, y: 520, w: 160 },
    // Stepping stone over the 300px pit
    { x: -1965, y: 540, w: 110 },
    // Climb
    { x: -1700, y: 520, w: 140 },
    { x: -1540, y: 410, w: 140 },
    // Ferry across the big pit
    { x: -1400, y: 470, w: 140, move: { dx: 360, dy: 0, period: 3.2 } },
    // Elevator up to a high ledge, then drop to the arena run-up
    { x: -600, y: 560, w: 120, move: { dx: 0, dy: -170, period: 2.6 } },
    { x: -450, y: 390, w: 200 },
  ],
  spikes: [
    { x: -2300, w: 60 },
    { x: -1650, w: 80 },
    { x: -820, w: 60 },
  ],
  signs: [
    { x: -3150, y: 380, text: "→ The boss is this way" },
    { x: -2560, y: 430, text: "Fall in a pit = lose 1 HP" },
    { x: -1420, y: 300, text: "Ride the platform" },
    { x: -180, y: 420, text: "BOSS AHEAD\nno turning back" },
  ],
};
