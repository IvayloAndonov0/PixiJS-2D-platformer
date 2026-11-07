import { AnimatedSprite, Container, Graphics } from "pixi.js";
import { anim, type SheetName } from "../assets";
import { BULLET, COLORS, DEBUG_HITBOXES } from "../config";
import type { Circle } from "../systems/collision";

export type BulletOwner = "player" | "boss";

export interface BulletSprite {
  sheet: SheetName;
  anim: string;
  scale?: number;
  /** Radians per second. If set, the sprite spins instead of pointing along its velocity. */
  spin?: number;
  fps?: number;
}

export interface BulletOptions {
  radius?: number;
  damage?: number;
  /** Colour of the placeholder circle (ignored when `sprite` is set). */
  color?: number;
  /** Boss bullets only: player can parry it (drawn in COLORS.parryable). */
  parryable?: boolean;
  /** Player bullets only: keeps flying after hitting the boss (used by the special). */
  piercing?: boolean;
  /** Use an animation instead of a coloured circle. Plays once, then holds the last frame. */
  sprite?: BulletSprite;
}

export class Bullet extends Container {
  readonly radius: number;
  readonly damage: number;
  readonly parryable: boolean;
  readonly piercing: boolean;
  dead = false;
  /** Piercing bullets only damage the boss once. */
  hasHit = false;
  private spin = 0;

  constructor(
    readonly owner: BulletOwner,
    x: number,
    y: number,
    public vx: number,
    public vy: number,
    opts: BulletOptions = {},
  ) {
    super();
    this.radius = opts.radius ?? BULLET.radius;
    this.damage = opts.damage ?? BULLET.damage;
    this.parryable = opts.parryable ?? false;
    this.piercing = opts.piercing ?? false;
    this.position.set(x, y);

    if (opts.sprite) {
      const s = new AnimatedSprite({ textures: anim(opts.sprite.sheet, opts.sprite.anim), updateAnchor: true });
      s.scale.set(opts.sprite.scale ?? 1);
      s.animationSpeed = (opts.sprite.fps ?? 24) / 60;
      s.loop = false;
      s.play();
      this.addChild(s);
      this.spin = opts.sprite.spin ?? 0;
      if (!this.spin) this.rotation = Math.atan2(vy, vx);
    } else {
      // Placeholder circle. TODO(art): boss bullet sprites
      const color =
        opts.color ?? (this.parryable ? COLORS.parryable : owner === "player" ? COLORS.playerBullet : COLORS.bossBullet);
      const g = new Graphics().circle(0, 0, this.radius).fill(color);
      if (this.parryable) g.circle(0, 0, this.radius + 3).stroke({ color: 0xffffff, width: 2 });
      this.addChild(g);
    }

    if (DEBUG_HITBOXES) this.addChild(new Graphics().circle(0, 0, this.radius).stroke({ color: 0x00ff00, width: 1 }));
  }

  get hitbox(): Circle {
    return { x: this.x, y: this.y, r: this.radius };
  }

  update(dt: number): void {
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    if (this.spin) this.rotation += this.spin * dt;
  }
}
