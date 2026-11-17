import { Container, Graphics, Sprite, type Texture } from "pixi.js";
import { COLORS } from "../config";

export interface PlatformDef {
  /** Left edge */
  x: number;
  /** Top surface (where the player stands) */
  y: number;
  w: number;
  /**
   * Optional movement: the platform eases back and forth between its start position
   * and start + (dx, dy), taking `period` seconds for a full round trip.
   */
  move?: { dx: number; dy: number; period: number };
}

const THICKNESS = 18;
/** Textured platforms: how much wider than the hitbox the art is drawn (rock edges overhang a bit). */
const ART_OVERHANG = 1.1;
/** Textured platforms: where the walkable top surface sits in the art, as a fraction of its height. */
const ART_TOP = 0.32;

/**
 * One-way platform: the player can jump up through it from below, land on top,
 * and drop through by pressing Down while standing on it. Can optionally move.
 */
export class Platform extends Container {
  readonly w: number;
  /** How far the platform moved this frame (the player riding it is carried by this). */
  deltaX = 0;
  deltaY = 0;
  private time = 0;

  /** `texture`: optional art, scaled to the platform's width keeping its aspect ratio. Without it, a plain block is drawn. */
  constructor(
    private def: PlatformDef,
    texture?: Texture,
  ) {
    super();
    this.w = def.w;
    this.position.set(def.x, def.y);
    if (texture) {
      const s = new Sprite(texture);
      s.anchor.set(0.5, ART_TOP);
      s.width = def.w * ART_OVERHANG;
      s.scale.y = s.scale.x;
      s.position.set(def.w / 2, 0);
      this.addChild(s);
    } else {
      this.addChild(
        new Graphics()
          .roundRect(0, 0, def.w, THICKNESS, 6)
          .fill(def.move ? COLORS.movingPlatform : COLORS.platform)
          .rect(4, 0, def.w - 8, 4)
          .fill(COLORS.platformTop),
      );
    }
  }

  get left(): number {
    return this.x;
  }
  get right(): number {
    return this.x + this.w;
  }
  get top(): number {
    return this.y;
  }
  get moving(): boolean {
    return this.def.move !== undefined;
  }

  update(dt: number): void {
    const m = this.def.move;
    if (!m) return;
    this.time += dt;
    const p = (1 - Math.cos((this.time / m.period) * Math.PI * 2)) / 2; // 0 -> 1 -> 0, eased
    const nx = this.def.x + m.dx * p;
    const ny = this.def.y + m.dy * p;
    this.deltaX = nx - this.x;
    this.deltaY = ny - this.y;
    this.position.set(nx, ny);
  }

  /** Is horizontal position `x` (with half-width `halfW`) over this platform? */
  spans(x: number, halfW: number): boolean {
    return x + halfW > this.left && x - halfW < this.right;
  }
}
