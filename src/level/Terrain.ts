import { Container, Graphics, Sprite } from "pixi.js";
import { image, type ImageName } from "../assets";
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
  /** Floor colours (body, top edge). Default COLORS.ground / COLORS.platformTop. */
  colors?: { ground: number; top: number };
  /** Art for the one-way platforms. Default: plain coloured blocks. */
  platformTexture?: ImageName;
}

/** Drawn height of the thorns.png tile (the art itself is 128x64). */
const THORN_H = 40;

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
      ground.rect(l, GROUND_Y, r - l, GAME_HEIGHT - GROUND_Y).fill(def.colors?.ground ?? COLORS.ground);
      ground.rect(l, GROUND_Y, r - l, 6).fill(def.colors?.top ?? COLORS.platformTop);
    }
    this.addChild(ground);

    // Thorn strips: the thorns.png tile repeated across each strip, stretched slightly so whole tiles fit.
    const thornTex = image("thorns");
    const tileW = thornTex.width * (THORN_H / thornTex.height);
    this.spikes = def.spikes.map(({ x, w }) => {
      const n = Math.max(1, Math.round(w / tileW));
      const tw = w / n;
      for (let i = 0; i < n; i++) {
        const s = new Sprite(thornTex);
        s.anchor.set(0, 1);
        s.position.set(x + i * tw, GROUND_Y + 2);
        s.width = tw;
        s.height = THORN_H;
        this.addChild(s);
      }
      // Hitbox is a bit shorter than the art so grazing the tips doesn't hurt.
      return { x: x + 4, y: GROUND_Y - THORN_H * 0.45, w: w - 8, h: THORN_H * 0.45 };
    });

    this.platforms = def.platforms.map(
      (p) => new Platform(p, def.platformTexture && image(def.platformTexture)),
    );
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
