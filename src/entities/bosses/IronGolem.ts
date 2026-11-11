import { Graphics } from "pixi.js";
import { GAME_WIDTH, GROUND_Y } from "../../config";
import type { BulletPool } from "../../systems/BulletPool";
import type { Bullet } from "../Bullet";
import type { Player } from "../Player";
import { GolemModel } from "./art/GolemModel";
import { BOULDER, ROCKET_FIST, ROCK_SPIKE, SHOCKWAVE } from "./art/projectiles";
import { Boss, type Attack, type Phase } from "./Boss";

const HOME_X = GAME_WIDTH - 190;
const BOULDER_GRAVITY = 1100;
const ROCK_GRAVITY = 1600;

/**
 * Slow, heavy ground boss. Stomps shockwaves along the floor (jump them), lobs boulders
 * at where you stand, makes rock spikes erupt under you, fires its fist like a rocket
 * (low = jump, high = stay down), and shakes rocks loose from the ceiling.
 */
export class IronGolem extends Boss {
  protected phases: Phase[];
  private golem = new GolemModel();
  /** Red warning marks on the floor before an eruption. */
  private warning = new Graphics();
  private eruptAt: number[] = [];
  private waves = 1;
  private fist?: Bullet;
  private fistHigh = false;

  constructor(bullets: BulletPool, player: Player) {
    super("Iron Golem", 380, 240, 230, bullets, player);
    this.position.set(HOME_X, GROUND_Y);
    this.useModel(this.golem);
    this.addChild(this.warning);

    this.phases = [
      { name: "Phase 1", untilHpFraction: 0.65, attacks: [this.stomp, this.boulders, this.rocketFist, this.erupt], restTime: 1.1 },
      { name: "Phase 2", untilHpFraction: 0.3, attacks: [this.boulders, this.rocketFist, this.stomp, this.rockfall, this.erupt], restTime: 0.85 },
      {
        name: "Phase 3",
        untilHpFraction: 0,
        attacks: [this.erupt, this.rocketFist, this.rockfall, this.stomp, this.boulders, this.rocketFist],
        restTime: 0.6,
      },
    ];
  }

  override get hitbox() {
    // Include the head.
    return { x: this.x - this.bodyW / 2, y: this.y - this.bodyH - 60, w: this.bodyW, h: this.bodyH + 60 };
  }

  protected override onAttackEnd(): void {
    this.golem.pose = "idle";
  }

  override update(dt: number): void {
    super.update(dt);
    // The rocket fist flies out, slows down, and comes back to the arm.
    const f = this.fist;
    if (f) {
      f.vx += 650 * dt; // turns around after ~930px
      const back = f.vx > 0 && f.x >= this.x - 120;
      if (f.destroyed || f.dead || back) {
        if (!f.destroyed) f.dead = true;
        this.fist = undefined;
        this.golem.fistGone = false;
      }
    }
  }

  /** Hop up and slam: shockwaves roll left along the floor. The last wave is parryable. */
  private stomp: Attack = (_dt, t) => {
    const rise = 0.45;
    const fall = 0.12;
    if (t < rise) {
      this.golem.pose = "raise";
      this.y = GROUND_Y - Math.sin((t / rise) * (Math.PI / 2)) * 60;
      return false;
    }
    if (t < rise + fall) {
      this.golem.pose = "slam";
      this.y = GROUND_Y - 60 * (1 - (t - rise) / fall);
      return false;
    }
    this.y = GROUND_Y;
    const left = this.x - this.bodyW / 2;
    const done = this.fireEvery(t - rise - fall, 0.55, this.waves, (i) => {
      const parryable = i === this.waves - 1 && this.waves > 1;
      this.bullets.spawn(left, GROUND_Y - 22, -520, 0, { radius: 18, parryable, shape: { ctx: SHOCKWAVE(), scale: 1.3 } });
      this.bullets.spawn(left, GROUND_Y - 48, -520, 0, { radius: 10, hidden: true });
      this.dust(left, 1);
    });
    return done && t > rise + fall + 0.3;
  };

  /** Lobs 3 boulders that land where the player is standing. The last one is parryable. */
  private boulders: Attack = (_dt, t) => {
    this.golem.pose = "throw";
    const done = this.fireEvery(t - 0.25, 0.45, 3, (i) => {
      const fromX = this.x - 80;
      const fromY = this.y - this.bodyH - 60;
      const tx = Math.max(40, Math.min(GAME_WIDTH - 40, this.player.x + (i - 1) * 40));
      this.lob(fromX, fromY, tx, GROUND_Y - 20, 1.1, BOULDER_GRAVITY, {
        radius: 22,
        parryable: i === 2,
        shape: { ctx: BOULDER(), spin: -6, scale: 1.1 },
      });
    });
    return done && t > 1.6;
  };

  /** Marks the player's position, then rock spikes shoot up out of the floor there. */
  private erupt: Attack = (_dt, t) => {
    const count = this.waves; // 1 / 2 / 3 targets in phase 1 / 2 / 3
    const gap = 0.45;
    const warn = 0.75;
    if (this.justStarted) {
      this.eruptAt = [];
      this.warning.clear();
    }
    this.golem.pose = t < warn ? "raise" : "slam";
    // Pick a new target every `gap` seconds and draw its warning.
    while (this.eruptAt.length < count && t >= this.eruptAt.length * gap) {
      this.eruptAt.push(this.player.x);
    }
    this.warning.clear();
    this.eruptAt.forEach((x, i) => {
      const age = t - i * gap;
      if (age < warn) {
        const pulse = 0.4 + 0.4 * Math.abs(Math.sin(age * 14));
        this.warning.rect(x - this.x - 40, -10, 80, 10).fill({ color: 0xff1744, alpha: pulse });
      }
    });
    this.fireEvery(t - warn, gap, count, (i) => {
      const x = this.eruptAt[i];
      for (let k = 0; k < 6; k++) {
        this.bullets.spawn(x - 30 + k * 12, GROUND_Y + 10 + (k % 2) * 20, 0, -950 - k * 20, {
          radius: 10,
          shape: { ctx: ROCK_SPIKE(), scale: 1.2 },
        });
      }
      this.dust(x, 0.8);
    });
    const done = this.count >= count && t > warn + (count - 1) * gap + 0.4;
    if (done) this.warning.clear();
    return done;
  };

  /**
   * NEW: pulls its arm back, then fires its fist across the arena like a rocket.
   * Arm aimed low = jump it. Arm aimed high = stay on the ground (don't jump into it).
   * The fist flies back to the arm afterwards, so watch the return trip too.
   */
  private rocketFist: Attack = (_dt, t) => {
    const windup = 0.7;
    if (this.justStarted) this.fistHigh = Math.random() < 0.5;
    if (t < windup) {
      this.golem.pose = "windup";
      // Show the height by leaning: high punch rears up, low punch crouches.
      this.y = GROUND_Y + (this.fistHigh ? -14 : 10) * Math.min(1, t / 0.3);
      return false;
    }
    this.golem.pose = "punch";
    this.y = GROUND_Y;
    this.fireEvery(t - windup, 1, 1, () => {
      if (this.fist) return; // previous one still out
      const y = this.fistHigh ? GROUND_Y - 120 : GROUND_Y - 34;
      this.fist = this.bullets.spawn(this.x - 160, y, -1100, 0, {
        radius: 30,
        parryable: this.waves >= 3 && !this.fistHigh,
        shape: { ctx: ROCKET_FIST(), angle: 0, scale: 1 },
      });
      this.golem.fistGone = true;
    });
    return t > windup + 0.5 && !this.fist;
  };

  /**
   * NEW: slams both fists into the floor and the ceiling sheds rocks. Shadows show where they land.
   * Every 4th rock is parryable.
   */
  private rockfall: Attack = (_dt, t) => {
    const count = this.waves >= 3 ? 10 : 7;
    const slam = 0.5;
    this.golem.pose = t < slam ? "raise" : "slam";
    if (t >= slam && this.count === 0) this.dust(this.x - 100, 1.4);
    this.fireEvery(t - slam, 0.16, count, (i) => {
      const x = 40 + Math.random() * (this.x - 200);
      const fall = Math.sqrt((2 * (GROUND_Y - 20 + 30)) / ROCK_GRAVITY);
      const shadow = new Graphics().ellipse(0, 0, 30, 7).fill({ color: 0x000000, alpha: 0.45 });
      this.fx.stillView(shadow, x, GROUND_Y - 2, { life: fall, scaleFrom: 0.3, scaleTo: 1 });
      this.bullets.spawn(x, -30, 0, 0, { radius: 20, gravity: ROCK_GRAVITY, parryable: i % 4 === 3, shape: { ctx: BOULDER(), spin: 4 } });
    });
    return this.count >= count && t > slam + count * 0.16 + 0.9;
  };

  /** Puff of dust on the floor. */
  private dust(x: number, scale: number): void {
    this.fx.spawn("fx", "Smoke", x, GROUND_Y - 20, { scale, fps: 18 });
  }

  protected override onPhaseChange(index: number): void {
    this.y = GROUND_Y;
    this.warning.clear();
    this.golem.pose = "idle";
    this.waves = index + 1;
    if (index === this.phases.length - 1) this.body.tint = 0xff9e80;
  }
}
