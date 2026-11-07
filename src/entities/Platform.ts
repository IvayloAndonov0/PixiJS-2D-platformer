import { Graphics } from "pixi.js";
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

/**
 * One-way platform: the player can jump up through it from below, land on top,
 * and drop through by pressing Down while standing on it. Can optionally move.
 */
export class Platform extends Graphics {
  readonly w: number;
  /** How far the platform moved this frame (the player riding it is carried by this). */
  deltaX = 0;
  deltaY = 0;
  private time = 0;

  constructor(private def: PlatformDef) {
    super();
    this.w = def.w;
    this.position.set(def.x, def.y);
    // TODO(art): replace with a platform sprite (cloud, crate, plank...)
    this.roundRect(0, 0, def.w, THICKNESS, 6)
      .fill(def.move ? COLORS.movingPlatform : COLORS.platform)
      .rect(4, 0, def.w - 8, 4)
      .fill(COLORS.platformTop);
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
