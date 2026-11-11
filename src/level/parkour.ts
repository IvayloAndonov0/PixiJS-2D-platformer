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

/** Windy cliffs before the Storm Crow: a stepping stone, a ferry, then a climb. */
export const PARKOUR_2: IntroDef = {
  start: -3100,
  floor: [
    [-3200, -2700],
    [-2480, -2200], // after a 220px pit (plain jump)
    [-1900, -1700], // after a 300px pit (stepping stone)
    [-1100, -850], // after the ferry
    [-300, 0], // run-up to the arena
  ],
  platforms: [
    { x: -2110, y: 560, w: 120 },
    // Ferry over the long drop
    { x: -1660, y: 540, w: 130, move: { dx: 300, dy: 0, period: 3 } },
    // Climb, then hop across the last gap
    { x: -1050, y: 520, w: 120 },
    { x: -920, y: 400, w: 130 },
    { x: -700, y: 430, w: 110 },
    { x: -480, y: 470, w: 110, move: { dx: 0, dy: -120, period: 2.4 } },
  ],
  spikes: [
    { x: -2950, w: 60 },
    { x: -1820, w: 50 },
    { x: -1000, w: 60 },
  ],
  signs: [
    { x: -3150, y: 380, text: "Storm Crow's cliffs →" },
    { x: -2170, y: 430, text: "Mind the gap" },
    { x: -1050, y: 300, text: "Climb up" },
    { x: -230, y: 420, text: "It attacks from the sky.\nUse the platforms" },
  ],
};

/** Rocky quarry before the Iron Golem: spike beds, an elevator and a ferry. */
export const PARKOUR_3: IntroDef = {
  start: -3300,
  floor: [
    [-3400, -2900],
    [-2700, -2300],
    [-2100, -1500], // spike bed with platforms over it
    [-1100, -900],
    [-500, 0],
  ],
  platforms: [
    // Over the spike bed
    { x: -1980, y: 540, w: 110 },
    { x: -1790, y: 500, w: 110 },
    // Elevator up, then a high ledge across the pit
    { x: -1440, y: 600, w: 120, move: { dx: 0, dy: -200, period: 3 } },
    { x: -1260, y: 420, w: 120 },
    // Ferry across the last pit
    { x: -880, y: 520, w: 120, move: { dx: 300, dy: 0, period: 3 } },
  ],
  spikes: [
    { x: -3050, w: 60 },
    { x: -2560, w: 100 },
    { x: -2000, w: 380 },
    { x: -380, w: 60 },
  ],
  signs: [
    { x: -3350, y: 380, text: "The quarry →" },
    { x: -2000, y: 380, text: "Don't touch the floor" },
    { x: -1460, y: 330, text: "Going up" },
    { x: -250, y: 420, text: "Something heavy\nis waiting" },
  ],
};

/** Floating stairway before the Hex Wizard: almost all platforms, mostly moving. */
export const PARKOUR_4: IntroDef = {
  start: -2900,
  floor: [
    [-3000, -2600],
    [-1200, -950],
    [-350, 0],
  ],
  platforms: [
    // The long stairway over the void
    { x: -2560, y: 520, w: 120 },
    { x: -2400, y: 420, w: 120 },
    { x: -2200, y: 470, w: 120, move: { dx: 250, dy: 0, period: 3 } },
    { x: -1780, y: 420, w: 120 },
    { x: -1600, y: 500, w: 120, move: { dx: 0, dy: -120, period: 2.2 } },
    { x: -1420, y: 430, w: 140 },
    // Second stretch
    { x: -900, y: 540, w: 110 },
    { x: -720, y: 440, w: 110 },
    { x: -560, y: 520, w: 110, move: { dx: 120, dy: 0, period: 2 } },
  ],
  spikes: [
    { x: -2780, w: 60 },
    { x: -1100, w: 60 },
  ],
  signs: [
    { x: -2950, y: 380, text: "The spire →" },
    { x: -2420, y: 300, text: "Don't look down" },
    { x: -1180, y: 420, text: "Halfway" },
    { x: -300, y: 420, text: "It blinks around.\nWatch for the gaps" },
  ],
};

/** The long road to the Eclipse Heart: everything from before, back to back. */
export const PARKOUR_5: IntroDef = {
  start: -3500,
  floor: [
    [-3600, -3200],
    [-2950, -2600],
    [-2200, -1900],
    [-1400, -1200],
    [-700, -500],
    [-250, 0],
  ],
  platforms: [
    { x: -3110, y: 560, w: 80 },
    // Ferry
    { x: -2560, y: 500, w: 120, move: { dx: 260, dy: 0, period: 2.6 } },
    // Elevator to the high road
    { x: -1860, y: 600, w: 110, move: { dx: 0, dy: -180, period: 2.8 } },
    { x: -1700, y: 400, w: 120 },
    { x: -1520, y: 450, w: 110, move: { dx: 0, dy: -100, period: 2 } },
    // Shuttle
    { x: -1150, y: 520, w: 100 },
    { x: -980, y: 470, w: 100, move: { dx: 150, dy: 0, period: 2.4 } },
    // Last stone
    { x: -420, y: 540, w: 90 },
  ],
  spikes: [
    { x: -3400, w: 60 },
    { x: -2800, w: 80 },
    { x: -2080, w: 60 },
    { x: -1340, w: 60 },
    { x: -640, w: 60 },
  ],
  signs: [
    { x: -3550, y: 380, text: "The last road →" },
    { x: -2580, y: 380, text: "Ride it" },
    { x: -1880, y: 330, text: "Up and over" },
    { x: -680, y: 420, text: "Almost there" },
    { x: -220, y: 420, text: "THE ECLIPSE\nno turning back" },
  ],
};
