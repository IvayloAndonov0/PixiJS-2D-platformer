import { AnimatedSprite, Container, Graphics, type GraphicsContext } from "pixi.js";
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
  /** Extra rotation in radians, for art that doesn't point right (e.g. Math.PI for left-pointing art). */
  angle?: number;
  /** false = keep the art upright instead of pointing it along the velocity. Default true. */
  orient?: boolean;
  fps?: number;
}

/** A shape drawn in code (shared GraphicsContext, so thousands of bullets stay cheap). */
export interface BulletShape {
  ctx: GraphicsContext;
  scale?: number;
  /** Radians per second. If set, the shape spins instead of pointing along its velocity. */
  spin?: number;
  /** Extra rotation in radians, for shapes that don't point right. */
  angle?: number;
  /** false = keep it upright instead of pointing it along the velocity. Default true. */
  orient?: boolean;
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
  /** Downward acceleration, px/s^2 (lobbed boulders, falling meteors). Default 0. */
  gravity?: number;
  /** Seconds before the bullet disappears on its own (lingering hazards). Default: until off-screen. */
  life?: number;
  /** Not drawn at all: an invisible hitbox under an effect sprite (spikes, vortex...). */
  hidden?: boolean;
  /** Use an animation instead of a coloured circle. Plays once, then holds the last frame. */
  sprite?: BulletSprite;
  /** Use a shape drawn in code (see entities/bosses/art/projectiles.ts). */
  shape?: BulletShape;
  /** Steer toward a moving target (keeps its speed). `target` returning undefined = fly straight. */
  homing?: { target: () => { x: number; y: number } | undefined; turnRate: number };
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
  private gravity: number;
  private life: number;
  private orient = false;
  private angleOffset = 0;
  private homing?: BulletOptions["homing"];

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
    this.gravity = opts.gravity ?? 0;
    this.life = opts.life ?? Infinity;
    this.homing = opts.homing;
    this.position.set(x, y);

    if (opts.hidden) {
      // Nothing to draw.
    } else if (opts.sprite || opts.shape) {
      let s: AnimatedSprite | Graphics;
      const look = (opts.sprite ?? opts.shape)!;
      if (opts.sprite) {
        const a = new AnimatedSprite({ textures: anim(opts.sprite.sheet, opts.sprite.anim), updateAnchor: true });
        a.animationSpeed = (opts.sprite.fps ?? 24) / 60;
        a.loop = false;
        a.play();
        s = a;
      } else {
        s = new Graphics(opts.shape!.ctx);
      }
      s.scale.set(look.scale ?? 1);
      this.addChild(s);
      this.spin = look.spin ?? 0;
      this.angleOffset = look.angle ?? 0;
      this.orient = !this.spin && look.orient !== false;
      if (this.orient) this.rotation = Math.atan2(vy, vx) + this.angleOffset;
      if (this.parryable) {
        // Keep the "green = parry me" rule readable on sprite / shape bullets too. A tint alone turns
        // dark art (e.g. the eclipse orbs) murky, so there's also a solid green glow behind it.
        this.addChildAt(new Graphics().circle(0, 0, this.radius + 6).fill({ color: COLORS.parryable, alpha: 0.55 }), 0);
        s.tint = COLORS.parryable;
        this.addChild(new Graphics().circle(0, 0, this.radius + 4).stroke({ color: 0xffffff, width: 2 }));
      }
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
    this.life -= dt;
    if (this.life <= 0) this.dead = true;
    this.vy += this.gravity * dt;
    const target = this.homing?.target();
    if (target) {
      // Turn the velocity toward the target by at most turnRate * dt, keeping the speed.
      const speed = Math.hypot(this.vx, this.vy);
      const current = Math.atan2(this.vy, this.vx);
      let diff = Math.atan2(target.y - this.y, target.x - this.x) - current;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff)); // wrap to -PI..PI
      const max = this.homing!.turnRate * dt;
      const a = current + Math.max(-max, Math.min(max, diff));
      this.vx = Math.cos(a) * speed;
      this.vy = Math.sin(a) * speed;
      if (this.orient) this.rotation = a + this.angleOffset;
    }
    if (this.orient && this.gravity) this.rotation = Math.atan2(this.vy, this.vx) + this.angleOffset;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    if (this.spin) this.rotation += this.spin * dt;
  }
}
