import { Graphics } from "pixi.js";
import { GAME_HEIGHT, GAME_WIDTH } from "../../config";
import type { BulletPool } from "../../systems/BulletPool";
import type { BulletShape } from "../Bullet";
import type { BossTarget } from "../Fighter";
import { CrowModel } from "./art/CrowModel";
import { CROWLING, FEATHER, lightningBolt } from "./art/projectiles";
import { Boss, type Attack, type Phase } from "./Boss";

/** Where the crow hangs out: the right part of the screen. x/y is the bottom-center of its body. */
const HOME_X = GAME_WIDTH - 230;
const MIN_X = GAME_WIDTH - 420;
const MAX_X = GAME_WIDTH - 140;
const MIN_Y = 190;
const MAX_Y = GAME_HEIGHT - 60;
/** The body's center is this far above (x, y). */
const CENTER_UP = 60;

const feather = (): BulletShape => ({ ctx: FEATHER(), scale: 1.1 });
const crowling = (): BulletShape => ({ ctx: CROWLING(), scale: 1.3 });

/**
 * Plane boss (fought in the air, see BossEntry.mode = "plane").
 * The crow flies on the right side of the screen while the player's plane flies on the left.
 *
 * Phase 1: glides around, fans feathers at you, sends walls of feathers with a gap to fly through.
 * Phase 2: adds horizontal lightning (warning line first), homing crowlings, and a charge across the screen.
 * Phase 3: everything faster, more charges.
 */
export class StormCrow extends Boss {
  protected phases: Phase[];
  private crow = new CrowModel();
  private glideTo = { x: HOME_X, y: 400 };
  private glideFromY = 400;
  private bobTime = 0;
  private strikes: number[] = [];
  private chargeY = 0;
  private wallSpeed = 300;
  private crowlingCount = 4;

  constructor(bullets: BulletPool, player: BossTarget) {
    super("Storm Crow", 320, 170, 120, bullets, player);
    this.position.set(HOME_X, 420);
    this.useModel(this.crow);

    this.phases = [
      {
        name: "Phase 1",
        untilHpFraction: 0.6,
        attacks: [this.glide, this.featherFan, this.glide, this.featherWall],
        restTime: 0.8,
      },
      {
        name: "Phase 2",
        untilHpFraction: 0.3,
        attacks: [this.featherFan, this.lightning, this.glide, this.crowlings, this.featherWall, this.charge],
        restTime: 0.65,
      },
      {
        name: "Phase 3",
        untilHpFraction: 0,
        attacks: [this.charge, this.lightning, this.crowlings, this.featherFan, this.charge, this.featherWall, this.glide],
        restTime: 0.45,
      },
    ];
  }

  /** The model faces left (toward the plane); the beak is at its front. */
  private get beak() {
    return { x: this.x - 128, y: this.y - 82 };
  }

  protected override onAttackEnd(): void {
    this.crow.pose = "fly";
    this.rotation = 0;
  }

  override update(dt: number): void {
    super.update(dt);
    // Gentle hover bob (on the model, so it never fights the position an attack sets).
    this.bobTime += dt;
    this.crow.y = Math.sin(this.bobTime * 3.3) * 4;
  }

  // ---------------------------------------------------------------- attacks

  /** Fly to a new spot on the right side, drifting toward the plane's height. */
  private glide: Attack = (_dt, t) => {
    if (this.justStarted) {
      const py = this.player.y + CENTER_UP + (Math.random() - 0.5) * 220;
      this.glideTo = {
        x: MIN_X + Math.random() * (MAX_X - MIN_X),
        y: Math.max(MIN_Y, Math.min(MAX_Y, py)),
      };
      this.glideFromY = this.y; // startX is tracked by Boss
    }
    const p = Math.min(t / 1.0, 1);
    const e = p * p * (3 - 2 * p);
    this.x = this.startX + (this.glideTo.x - this.startX) * e;
    this.y = this.glideFromY + (this.glideTo.y - this.glideFromY) * e;
    return p >= 1;
  };

  /** Two fans of 5 feathers aimed at the plane. The middle one of the second fan is parryable. */
  private featherFan: Attack = (_dt, t) => {
    this.crow.pose = "cast";
    const done = this.fireEvery(t, 0.55, 2, (i) => {
      const b = this.beak;
      const tg = this.target;
      for (let k = -2; k <= 2; k++) {
        const a = Math.atan2(tg.y - b.y, tg.x - b.x) + k * 0.18;
        this.bullets.spawn(b.x, b.y, Math.cos(a) * 440, Math.sin(a) * 440, { radius: 9, parryable: i === 1 && k === 0, shape: feather() });
      }
    });
    return done && t > 1;
  };

  /**
   * Two walls of feathers sweep in from the right edge, each with a gap to fly through.
   * The feather just above each gap is parryable.
   */
  private featherWall: Attack = (_dt, t) => {
    this.crow.pose = "gust";
    const spacing = 46;
    const gapSize = 3; // feathers missing
    this.fireEvery(t, 1.1, 2, (i) => {
      const rows = Math.floor(GAME_HEIGHT / spacing);
      // First gap near the plane (fair), second somewhere else.
      const py = i === 0 ? this.player.y : 60 + Math.random() * (GAME_HEIGHT - 120);
      const gapStart = Math.max(0, Math.min(rows - gapSize, Math.round(py / spacing) - 1));
      for (let r = 0; r < rows; r++) {
        if (r >= gapStart && r < gapStart + gapSize) continue;
        const y = 20 + r * spacing;
        this.bullets.spawn(GAME_WIDTH + 30, y, -this.wallSpeed, 0, {
          radius: 10,
          parryable: r === gapStart - 1,
          shape: feather(),
        });
      }
    });
    return t > 2.2;
  };

  /**
   * Three horizontal lightning bolts at the plane's height, one after another.
   * A thin flickering line across the screen warns where each one will strike.
   */
  private lightning: Attack = (_dt, t) => {
    const count = 3;
    const gap = 0.6;
    const warn = 0.75;
    if (this.justStarted) this.strikes = [];
    this.crow.pose = "cast";
    const reach = this.beak.x;
    while (this.strikes.length < count && t >= this.strikes.length * gap) {
      const y = Math.max(30, Math.min(GAME_HEIGHT - 30, this.player.y));
      this.strikes.push(y);
      const line = new Graphics().rect(0, -2, reach, 4).fill({ color: 0xbfe9ff, alpha: 0.5 }).rect(0, -14, 6, 28).fill({ color: 0xbfe9ff, alpha: 0.6 });
      this.fx.stillView(line, 0, y, { life: warn, fadeIn: 0.1 });
    }
    this.fireEvery(t - warn, gap, count, (i) => {
      const y = this.strikes[i];
      // The bolt art is vertical; rotating it a quarter turn makes it shoot left from the crow.
      this.fx.stillView(lightningBolt(0, reach + 20), reach, y, { life: 0.3, fadeOut: 0.2, rotation: Math.PI / 2 });
      for (let x = 20; x <= reach; x += 40) this.bullets.spawn(x, y, 0, 0, { radius: 16, hidden: true, life: 0.18 });
      // TODO(audio): thunder crack
    });
    return this.count >= count && t > warn + (count - 1) * gap + 0.4;
  };

  /** Releases a flock of small crows that chase the plane (slowly turning). Every 3rd is parryable. */
  private crowlings: Attack = (_dt, t) => {
    this.crow.pose = "gust";
    this.fireEvery(t, 0.35, this.crowlingCount, (i) => {
      const b = this.beak;
      const a = Math.PI + (i % 2 ? -0.6 : 0.6); // fan out up/down before homing in
      this.bullets.spawn(b.x, b.y, Math.cos(a) * 260, Math.sin(a) * 260, {
        radius: 13,
        parryable: i % 3 === 2,
        life: 4.5,
        shape: crowling(),
        homing: { target: () => (this.player.isDead ? undefined : this.target), turnRate: 1.6 },
      });
    });
    return t > this.crowlingCount * 0.35 + 0.4;
  };

  /**
   * Shakes and locks onto the plane's height (a red line warns), then charges straight across
   * the screen, off the left edge, and swoops back in from the right.
   */
  private charge: Attack = (_dt, t) => {
    const windup = 0.75;
    const dash = 0.7;
    const back = 0.9;
    if (this.justStarted) {
      this.chargeY = Math.max(MIN_Y, Math.min(MAX_Y, this.player.y + CENTER_UP));
      const line = new Graphics().rect(0, -3, GAME_WIDTH, 6).fill({ color: 0xff5252, alpha: 0.35 });
      this.fx.stillView(line, 0, this.chargeY - CENTER_UP, { life: windup, fadeIn: 0.15 });
    }
    if (t < windup) {
      // Rise to the locked height while shaking.
      this.crow.pose = "cast";
      const p = t / windup;
      this.y += (this.chargeY - this.y) * Math.min(1, p * 2);
      this.x = this.startX + Math.sin(t * 60) * 6;
      return false;
    }
    if (t < windup + dash) {
      this.crow.pose = "dive";
      const p = (t - windup) / dash;
      this.x = this.startX + (-260 - this.startX) * p * p; // accelerates
      this.y = this.chargeY;
      this.rotation = -0.15;
      // Drop feathers up and down along the way.
      this.fireEvery(t - windup, 0.12, 6, (i) => {
        const dir = i % 2 ? -1 : 1;
        this.bullets.spawn(this.x, this.y - CENTER_UP, 0, dir * 220, { radius: 9, shape: feather() });
      });
      return false;
    }
    // Swoop back in from the right to home.
    this.crow.pose = "fly";
    this.rotation = 0;
    const p = Math.min((t - windup - dash) / back, 1);
    const e = 1 - Math.pow(1 - p, 3);
    this.x = GAME_WIDTH + 260 + (HOME_X - GAME_WIDTH - 260) * e;
    this.y = this.chargeY + (400 - this.chargeY) * e;
    return p >= 1;
  };

  protected override onPhaseChange(index: number): void {
    // If a charge was interrupted while off-screen, come back into view.
    if (this.x < MIN_X || this.x > MAX_X) this.x = HOME_X;
    this.y = Math.max(MIN_Y, Math.min(MAX_Y, this.y));
    this.rotation = 0;
    this.crow.pose = "fly";
    this.wallSpeed = index >= 2 ? 380 : 330;
    this.crowlingCount = index >= 2 ? 6 : 4;
    if (index === this.phases.length - 1) this.body.tint = 0xff9e9e;
  }
}
