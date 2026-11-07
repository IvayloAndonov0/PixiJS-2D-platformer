import { Container, Graphics } from "pixi.js";
import { COLORS, GAME_HEIGHT, GROUND_Y } from "../config";
import { Platform, type PlatformDef } from "../entities/Platform";
import type { Rect } from "../systems/collision";

export interface SpikeDef {
  /** Left edge */
  x: number;
  w: number;
}

export interface TerrainDef {
  /** Solid floor spans at GROUND_Y, as [left, right]. Gaps between spans are pits. */
  floor: [number, number][];
  platforms: PlatformDef[];
  spikes: SpikeDef[];
}

const SPIKE_H = 26;

/** Floor spans, one-way platforms and spike strips. Owns their display objects. */
export class Terrain extends Container {
  readonly platforms: Platform[];
  readonly spikes: Rect[];
  private floor: [number, number][];

  constructor(def: TerrainDef) {
    super();
    this.floor = def.floor;

    // TODO(art): ground tiles / parallax background
    const ground = new Graphics();
    for (const [l, r] of def.floor) {
      ground.rect(l, GROUND_Y, r - l, GAME_HEIGHT - GROUND_Y).fill(COLORS.ground);
      ground.rect(l, GROUND_Y, r - l, 6).fill(COLORS.platformTop);
    }
    this.addChild(ground);

    // TODO(art): spike sprite
    const spikeGfx = new Graphics();
    this.spikes = def.spikes.map(({ x, w }) => {
      const n = Math.max(1, Math.round(w / 20));
      const tw = w / n;
      for (let i = 0; i < n; i++) {
        spikeGfx.poly([x + i * tw, GROUND_Y, x + (i + 0.5) * tw, GROUND_Y - SPIKE_H, x + (i + 1) * tw, GROUND_Y]);
      }
      spikeGfx.fill(COLORS.spikes);
      // Hitbox is a bit shorter than the art so grazing the tips doesn't hurt.
      return { x: x + 4, y: GROUND_Y - SPIKE_H * 0.6, w: w - 8, h: SPIKE_H * 0.6 };
    });
    this.addChild(spikeGfx);

    this.platforms = def.platforms.map((p) => new Platform(p));
    this.addChild(...this.platforms);
  }

  /** Leftmost / rightmost solid floor. */
  get left(): number {
    return Math.min(...this.floor.map(([l]) => l));
  }
  get right(): number {
    return Math.max(...this.floor.map(([, r]) => r));
  }

  /** Is there floor under horizontal position `x` (body half-width `halfW`)? */
  floorUnder(x: number, halfW: number): boolean {
    return this.floor.some(([l, r]) => x + halfW > l && x - halfW < r);
  }

  /** Move `x` at least `margin` px in from the edges of the floor span it's on (for respawning). */
  safeFloorX(x: number, margin = 90): number {
    const span = this.floor.find(([l, r]) => x >= l - 40 && x <= r + 40);
    if (!span) return x;
    const [l, r] = span;
    if (r - l < margin * 2) return (l + r) / 2;
    return Math.max(l + margin, Math.min(r - margin, x));
  }

  update(dt: number): void {
    for (const p of this.platforms) p.update(dt);
  }
}
