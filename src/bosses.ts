import { DEFAULT_PLATFORMS } from "./config";
import type { PlatformDef } from "./entities/Platform";
import type { Player } from "./entities/Player";
import type { Boss } from "./entities/bosses/Boss";
import { EclipseHeart } from "./entities/bosses/EclipseHeart";
import { ExampleBoss } from "./entities/bosses/ExampleBoss";
import { HEX_PLATFORMS, HexWizard } from "./entities/bosses/HexWizard";
import { IronGolem } from "./entities/bosses/IronGolem";
import { StormCrow } from "./entities/bosses/StormCrow";
import type { BackgroundTheme } from "./level/Background";
import { PARKOUR_1, PARKOUR_2, PARKOUR_3, PARKOUR_4, PARKOUR_5, type IntroDef } from "./level/parkour";
import type { BulletPool } from "./systems/BulletPool";

export type BossFactory = (bullets: BulletPool, player: Player) => Boss;

export interface BossEntry {
  name: string;
  create: BossFactory;
  /** One-way platforms inside the arena (x 0..1280). Use [] for a flat arena. */
  platforms: PlatformDef[];
  /** Clear time (seconds) that still earns full time points for the grade. Default 90. */
  parTime?: number;
  /** Parkour section before the arena (at negative x). Omit to start right in the arena. */
  intro?: IntroDef;
  /** Scenery behind the level (also sets the floor colour). Default "hills". */
  background?: BackgroundTheme;
}

/** Every fightable boss, in order. Add yours here, then give it a spot on the map in level/overworld.ts. */
export const BOSSES: BossEntry[] = [
  { name: "Example Boss", create: (b, p) => new ExampleBoss(b, p), platforms: DEFAULT_PLATFORMS, intro: PARKOUR_1, background: "hills" },
  {
    name: "Storm Crow",
    create: (b, p) => new StormCrow(b, p),
    platforms: [
      { x: 120, y: 500, w: 200 },
      { x: 540, y: 410, w: 200 },
      { x: 960, y: 500, w: 200 },
    ],
    parTime: 100,
    intro: PARKOUR_2,
    background: "storm",
  },
  {
    name: "Iron Golem",
    create: (b, p) => new IronGolem(b, p),
    platforms: [
      { x: 140, y: 520, w: 180 },
      { x: 460, y: 440, w: 180 },
    ],
    parTime: 100,
    intro: PARKOUR_3,
    background: "quarry",
  },
  {
    name: "Hex Wizard",
    create: (b, p) => new HexWizard(b, p),
    platforms: HEX_PLATFORMS, // the wizard teleports onto these; edit them in HexWizard.ts
    parTime: 110,
    intro: PARKOUR_4,
    background: "arcane",
  },
  {
    name: "Eclipse Heart",
    create: (b, p) => new EclipseHeart(b, p),
    platforms: [
      { x: 140, y: 520, w: 200 },
      { x: 540, y: 450, w: 200 },
      { x: 940, y: 520, w: 200 },
    ],
    parTime: 130,
    intro: PARKOUR_5,
    background: "eclipse",
  },
];
