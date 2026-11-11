import { Graphics } from "pixi.js";
import { GAME_WIDTH, GROUND_Y } from "../../config";
import type { BulletPool } from "../../systems/BulletPool";
import type { BulletShape } from "../Bullet";
import type { Player } from "../Player";
import { CrowModel } from "./art/CrowModel";
import { FEATHER, TORNADO, lightningBolt } from "./art/projectiles";
import { Boss, type Attack, type Phase } from "./Boss";

/** Bottom of the body while hovering. */
const HOVER_Y = 250;

const feather = (): BulletShape => ({ ctx: FEATHER(), scale: 1.1 });

/**
 * Flying boss. Glides around the top of the arena, fans feathers at you, makes it rain,
 * calls lightning down on you, kicks up tornadoes, and dive-bombs through the floor.
 * Use the platforms to get close.
 */
export class StormCrow extends Boss {
  protected phases: Phase[];
  private crow = new CrowModel();
  private glideTo = 0;
  private diveTo = 0;
  private rainInterval = 0.09;
  private strikes: number[] = [];

  constructor(bullets: BulletPool, player: Player) {
    super("Storm Crow", 320, 170, 120, bullets, player);
    this.position.set(GAME_WIDTH - 260, HOVER_Y);
    this.useModel(this.crow);

    this.phases = [
      { name: "Phase 1", untilHpFraction: 0.6, attacks: [this.glide, this.featherFan, this.glide, this.rain, this.tornado], restTime: 0.9 },
      { name: "Phase 2", untilHpFraction: 0.3, attacks: [this.featherFan, this.dive, this.lightning, this.glide, this.rain, this.dive], restTime: 0.7 },
      {
        name: "Phase 3",
        untilHpFraction: 0,
        attacks: [this.dive, this.lightning, this.featherFan, this.tornado, this.dive, this.rain, this.glide],
        restTime: 0.45,
      },
    ];
  }

  private get beak() {
    // The model faces left; flipping the boss (scale.x = -1) mirrors it.
    return { x: this.x - 128 * this.scale.x, y: this.y - 82 };
  }

  protected override onAttackEnd(): void {
    this.crow.pose = "fly";
  }

  /** Fly to a new spot across the top of the arena. */
  private glide: Attack = (_dt, t) => {
    if (this.justStarted) {
      // Prefer the side away from the player so it doesn't sit on top of them.
      const px = this.player.x;
      this.glideTo = px < GAME_WIDTH / 2 ? 700 + Math.random() * 450 : 130 + Math.random() * 450;
    }
    const p = Math.min(t / 1.1, 1);
    const e = p * p * (3 - 2 * p);
    this.x = this.startX + (this.glideTo - this.startX) * e;
    this.y = HOVER_Y - Math.sin(p * Math.PI) * 40;
    this.scale.x = this.glideTo > this.startX ? -1 : 1; // face where it's going
    return p >= 1;
  };

  /** Two fans of 5 feathers aimed at the player. The middle one of the second fan is parryable. */
  private featherFan: Attack = (_dt, t) => {
    this.faceThePlayer();
    this.crow.pose = "cast";
    const done = this.fireEvery(t, 0.55, 2, (i) => {
      for (let k = -2; k <= 2; k++) {
        const b = this.beak;
        const tg = this.target;
        const a = Math.atan2(tg.y - b.y, tg.x - b.x) + k * 0.2;
        this.bullets.spawn(b.x, b.y, Math.cos(a) * 420, Math.sin(a) * 420, { radius: 9, parryable: i === 1 && k === 0, shape: feather() });
      }
    });
    return done && t > 1;
  };

  /** Feathers fall from the sky at random spots. Every 5th one is parryable. */
  private rain: Attack = (_dt, t) => {
    this.crow.pose = "gust";
    this.fireEvery(t, this.rainInterval, Math.round(2.2 / this.rainInterval), (i) => {
      const x = 30 + Math.random() * (GAME_WIDTH - 60);
      this.bullets.spawn(x, -20, (Math.random() - 0.5) * 60, 340 + Math.random() * 80, { radius: 8, parryable: i % 5 === 4, shape: feather() });
    });
    return t > 2.6;
  };

  /** Shakes, then swoops down through the player's spot and back up on the other side. */
  private dive: Attack = (_dt, t) => {
    const windup = 0.5;
    if (this.justStarted) this.diveTo = this.player.x;
    if (t < windup) {
      this.crow.pose = "cast";
      this.x = this.startX + Math.sin(t * 60) * 6; // telegraph
      return false;
    }
    this.crow.pose = "dive";
    const p = Math.min((t - windup) / 1.1, 1);
    const endX = Math.max(120, Math.min(GAME_WIDTH - 120, 2 * this.diveTo - this.startX));
    // Straight line in x through the target, dipping to the floor halfway.
    this.x = p < 0.5 ? this.startX + (this.diveTo - this.startX) * (p * 2) : this.diveTo + (endX - this.diveTo) * ((p - 0.5) * 2);
    this.y = HOVER_Y + Math.sin(p * Math.PI) * (GROUND_Y - HOVER_Y);
    this.scale.x = endX > this.startX ? -1 : 1;
    // Drop a ring of feathers at the bottom of the swoop.
    if (p >= 0.5 && this.count === 0) {
      this.count = 1;
      for (let k = 0; k < 10; k++) {
        const a = Math.PI + (k / 10) * Math.PI * 2;
        this.bullets.spawn(this.x, this.y - 40, Math.cos(a) * 300, Math.sin(a) * 300, { radius: 9, parryable: k % 5 === 0, shape: feather() });
      }
    }
    return p >= 1;
  };

  /**
   * NEW: it screeches and calls lightning onto the player three times in a row.
   * A thin flickering line warns where each bolt will land.
   */
  private lightning: Attack = (_dt, t) => {
    const count = 3;
    const gap = 0.55;
    const warn = 0.7;
    if (this.justStarted) this.strikes = [];
    this.crow.pose = "cast";
    this.faceThePlayer();
    while (this.strikes.length < count && t >= this.strikes.length * gap) {
      const x = Math.max(30, Math.min(GAME_WIDTH - 30, this.player.x));
      this.strikes.push(x);
      const line = new Graphics().rect(-2, 0, 4, GROUND_Y).fill({ color: 0xbfe9ff, alpha: 0.5 }).rect(-22, GROUND_Y - 6, 44, 6).fill({ color: 0xbfe9ff, alpha: 0.6 });
      this.fx.stillView(line, x, 0, { life: warn, fadeIn: 0.1 });
    }
    this.fireEvery(t - warn, gap, count, (i) => {
      const x = this.strikes[i];
      this.fx.stillView(lightningBolt(-20, GROUND_Y), x, 0, { life: 0.3, fadeOut: 0.2 });
      for (let y = 40; y <= GROUND_Y - 10; y += 40) this.bullets.spawn(x, y, 0, 0, { radius: 16, hidden: true, life: 0.18 });
      // TODO(audio): thunder crack
    });
    return this.count >= count && t > warn + (count - 1) * gap + 0.4;
  };

  /**
   * NEW: big wing-beats whip up a tornado that rolls along the floor toward the player.
   * It's short enough to jump over (or dash through).
   */
  private tornado: Attack = (_dt, t) => {
    this.crow.pose = "gust";
    this.faceThePlayer();
    const fromLeft = this.player.x > this.x;
    const done = this.fireEvery(t - 0.5, 1, 1, () => {
      const x = this.x;
      const vx = fromLeft ? 300 : -300;
      // The visible funnel + two hidden hitboxes stacked above it.
      this.bullets.spawn(x, GROUND_Y - 34, vx, 0, { radius: 30, shape: { ctx: TORNADO(), orient: false, scale: 0.9 } });
      this.bullets.spawn(x, GROUND_Y - 84, vx, 0, { radius: 26, hidden: true });
    });
    return done && t > 1.2;
  };

  private faceThePlayer(): void {
    this.scale.x = this.player.x > this.x ? -1 : 1;
  }

  protected override onPhaseChange(index: number): void {
    this.y = HOVER_Y; // in case a dive was interrupted
    this.crow.pose = "fly";
    this.rainInterval = index >= 2 ? 0.06 : 0.075;
    if (index === this.phases.length - 1) this.body.tint = 0xff9e9e;
  }
}
