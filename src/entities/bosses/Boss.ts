import { Container, Graphics } from "pixi.js";
import type { BossModel } from "./art/BossModel";
import { COLORS } from "../../config";
import type { BulletPool } from "../../systems/BulletPool";
import type { Bullet, BulletOptions } from "../Bullet";
import { Effects } from "../../systems/Effects";
import type { Rect } from "../../systems/collision";
import type { Player } from "../Player";

/**
 * One boss attack. Called every frame while it runs.
 * `t` = seconds since this attack started. Return true when it's finished.
 */
export type Attack = (dt: number, t: number) => boolean;

export interface Phase {
  name: string;
  /** Phase ends when boss HP drops to or below this fraction of max (0..1). */
  untilHpFraction: number;
  /** Attacks are cycled in order. */
  attacks: Attack[];
  /** Pause between attacks, seconds. */
  restTime: number;
}

/**
 * Base boss: HP, hitbox, a phase list, and a simple attack scheduler.
 * Make a new boss by extending this and providing phases. See ExampleBoss.ts.
 * Position (x, y) is the bottom-center of the body.
 */
export abstract class Boss extends Container {
  readonly body: Graphics;
  hp: number;
  private phaseIndex = 0;
  private attackIndex = 0;
  private attackTime = 0;
  private restTimer = 1; // short delay before the first attack
  private flashTimer = 0;

  /** Helpers for writing attacks: reset every time an attack starts. */
  protected count = 0;
  protected startX = 0;
  /** True only on the first frame of an attack (pick targets, show telegraphs...). */
  protected justStarted = false;

  /** Drawn model that replaces the placeholder box (see useModel). */
  protected model?: BossModel;

  /** World-space effects layer. The fight scene replaces this with its own. */
  fx = new Effects();

  protected abstract phases: Phase[];

  constructor(
    readonly displayName: string,
    readonly maxHp: number,
    readonly bodyW: number,
    readonly bodyH: number,
    readonly bullets: BulletPool,
    readonly player: Player,
    color: number = COLORS.boss,
  ) {
    super();
    this.hp = maxHp;
    // TODO(art): replace with boss sprite / animations per phase
    this.body = new Graphics().rect(-bodyW / 2, -bodyH, bodyW, bodyH).fill(color);
    this.addChild(this.body);
  }

  get hitbox(): Rect {
    return { x: this.x - this.bodyW / 2, y: this.y - this.bodyH, w: this.bodyW, h: this.bodyH };
  }

  get phase(): Phase {
    return this.phases[this.phaseIndex];
  }

  get isDead(): boolean {
    return this.hp <= 0;
  }

  takeDamage(amount: number): void {
    if (this.isDead) return;
    this.hp = Math.max(0, this.hp - amount);
    this.flashTimer = 0.05;
    // Advance phase when HP crosses a threshold.
    while (this.phaseIndex < this.phases.length - 1 && this.hp / this.maxHp <= this.phase.untilHpFraction) {
      this.phaseIndex++;
      this.attackIndex = 0;
      this.attackTime = 0;
      this.restTimer = 1.5;
      this.onPhaseChange(this.phaseIndex);
    }
  }

  /** Swap the placeholder box for a drawn, animated model. */
  protected useModel(model: BossModel): void {
    this.body.visible = false;
    this.model = model;
    this.addChild(model);
  }

  /** Hook called when an attack finishes (back to the idle pose, etc.). */
  protected onAttackEnd(): void {}

  /** Hook for phase transitions (new sprite, taunt, arena change...). */
  protected onPhaseChange(_index: number): void {}

  update(dt: number): void {
    this.flashTimer = Math.max(0, this.flashTimer - dt);
    this.body.alpha = this.flashTimer > 0 ? 0.6 : 1; // TODO(fx): proper white hit-flash
    if (this.model) {
      this.model.alpha = this.body.alpha;
      this.model.tint = this.body.tint; // enraged tint in the last phase
      this.model.animate(dt);
    }
    if (this.isDead) return;

    if (this.restTimer > 0) {
      this.restTimer -= dt;
      return;
    }
    const attacks = this.phase.attacks;
    this.justStarted = this.attackTime === 0;
    if (this.justStarted) {
      this.count = 0;
      this.startX = this.x;
    }
    this.attackTime += dt;
    if (attacks[this.attackIndex](dt, this.attackTime)) {
      this.attackIndex = (this.attackIndex + 1) % attacks.length;
      this.attackTime = 0;
      this.restTimer = this.phase.restTime;
      this.onAttackEnd();
    }
  }

  // ---- Helpers for writing attacks ----

  /** Player's center point. */
  get target(): { x: number; y: number } {
    const h = this.player.hitbox;
    return { x: h.x + h.w / 2, y: h.y + h.h / 2 };
  }

  /**
   * Call `fn(i)` once every `interval` seconds (first call right away), `max` times in total.
   * Returns true once all `max` calls have happened.
   */
  protected fireEvery(t: number, interval: number, max: number, fn: (i: number) => void): boolean {
    const due = Math.min(max, Math.floor(t / interval) + 1);
    while (this.count < due) fn(this.count++);
    return this.count >= max;
  }

  /** Fire a bullet with gravity that lands on (toX, toY) after `time` seconds. */
  lob(fromX: number, fromY: number, toX: number, toY: number, time: number, gravity: number, opts: Omit<BulletOptions, "gravity"> = {}): Bullet {
    const vx = (toX - fromX) / time;
    const vy = (toY - fromY - 0.5 * gravity * time * time) / time;
    return this.bullets.spawn(fromX, fromY, vx, vy, { ...opts, gravity });
  }

  /**
   * Fire a bullet aimed at the player's center.
   * `spread` adds an angle offset in radians; `parryable` makes it parryable (drawn in COLORS.parryable).
   */
  shootAtPlayer(fromX: number, fromY: number, speed: number, opts: { spread?: number; parryable?: boolean } = {}): void {
    const t = this.player.hitbox;
    const angle = Math.atan2(t.y + t.h / 2 - fromY, t.x + t.w / 2 - fromX) + (opts.spread ?? 0);
    this.bullets.spawn(fromX, fromY, Math.cos(angle) * speed, Math.sin(angle) * speed, { parryable: opts.parryable });
  }

  /**
   * Fire `count` bullets in an evenly spaced ring.
   * `parryEvery`: every Nth bullet is parryable (0 = none).
   */
  shootRing(fromX: number, fromY: number, count: number, speed: number, offset = 0, parryEvery = 0): void {
    for (let i = 0; i < count; i++) {
      const a = offset + (i / count) * Math.PI * 2;
      const parryable = parryEvery > 0 && i % parryEvery === 0;
      this.bullets.spawn(fromX, fromY, Math.cos(a) * speed, Math.sin(a) * speed, { parryable });
    }
  }
}
