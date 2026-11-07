import { DEFAULT_PLATFORMS } from "./config";
import type { PlatformDef } from "./entities/Platform";
import type { Player } from "./entities/Player";
import type { Boss } from "./entities/bosses/Boss";
import { ExampleBoss } from "./entities/bosses/ExampleBoss";
import { PARKOUR_1, type IntroDef } from "./level/parkour";
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
}

/** Every fightable boss, in order. Add yours here, then give it a spot on the map in level/overworld.ts. */
export const BOSSES: BossEntry[] = [
  { name: "Example Boss", create: (b, p) => new ExampleBoss(b, p), platforms: DEFAULT_PLATFORMS, intro: PARKOUR_1 },
];
