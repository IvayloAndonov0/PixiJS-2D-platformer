import { Graphics } from "pixi.js";
import { GAME_WIDTH, GROUND_Y } from "../../config";
import type { PlatformDef } from "../Platform";
import type { Rect } from "../../systems/collision";
import type { BulletPool } from "../../systems/BulletPool";
import type { Bullet } from "../Bullet";
import type { Player } from "../Player";
import { WizardModel } from "./art/WizardModel";
import { ARCANE_BOLT, HEX_ORB, HEX_WISP, RUNE_BAR, RUNE_CIRCLE } from "./art/projectiles";
import { Boss, type Attack, type Phase } from "./Boss";

/** Arena platforms for this fight (bosses.ts uses this list). The wizard teleports onto them. */
export const HEX_PLATFORMS: PlatformDef[] = [
  { x: 120, y: 480, w: 200 },
  { x: 540, y: 380, w: 200 },
  { x: 960, y: 480, w: 200 },
];
/** Teleport spots (bottom-center): two on the floor, plus the middle of every platform. */
const SPOTS = [
  { x: 1120, y: GROUND_Y },
  { x: 160, y: GROUND_Y },
  ...HEX_PLATFORMS.map((p) => ({ x: p.x + p.w / 2, y: p.y })),
];
/** Top surfaces the rune traps can be drawn on (floor + platforms), as [left, right, y]. */
const SURFACES: [number, number, number][] = [
  [0, GAME_WIDTH, GROUND_Y],
  ...HEX_PLATFORMS.map((p): [number, number, number] => [p.x, p.x + p.w, p.y]),
];

/**
 * Teleporting caster. Blinks between the floor and the platforms, fires spirals, slow heavy orbs,
 * walls of runes with a gap to find, homing hex wisps, and rune traps that explode under you.
 * While it's blinking it can't be hit and can't hurt you.
 */
export class HexWizard extends Boss {
  protected phases: Phase[];
  private wizard = new WizardModel();
  private blinking = false;
  private spiralArms = 2;
  private spiralSpin = 3.2;
  private wisps: { b: Bullet; age: number }[] = [];
  private traps: { x: number; y: number }[] = [];

  constructor(bullets: BulletPool, player: Player) {
    super("Hex Wizard", 340, 90, 170, bullets, player);
    this.position.set(SPOTS[0].x, SPOTS[0].y);
    this.useModel(this.wizard);
    this.wizard.sortableChildren = true; // runes orbit in front of / behind him

    this.phases = [
      {
        name: "Phase 1",
        untilHpFraction: 0.65,
        attacks: [this.spiral, this.blink, this.orbs, this.blink, this.curtain, this.homing, this.blink],
        restTime: 0.8,
      },
      {
        name: "Phase 2",
        untilHpFraction: 0.3,
        attacks: [this.curtain, this.blink, this.runeTraps, this.spiral, this.homing, this.orbs, this.blink],
        restTime: 0.6,
      },
      {
        name: "Phase 3",
        untilHpFraction: 0,
        attacks: [this.spiral, this.blink, this.runeTraps, this.curtain, this.homing, this.blink, this.curtain],
        restTime: 0.4,
      },
    ];
  }

  override get hitbox(): Rect {
    if (this.blinking) return { x: -9999, y: -9999, w: 0, h: 0 }; // untouchable mid-teleport
    return super.hitbox;
  }

  /** The glowing orb on top of the staff: every spell comes out of it. */
  private get staff() {
    return { x: this.x + this.wizard.orbOffset.x * this.scale.x, y: this.y + this.wizard.orbOffset.y };
  }

  override update(dt: number): void {
    super.update(dt);
    if (!this.blinking && !this.isDead) this.scale.x = this.player.x > this.x ? -1 : 1; // face the player
    this.steerWisps(dt);
  }

  protected override onAttackEnd(): void {
    this.wizard.pose = "idle";
  }

  /** Fade out, reappear at a spot away from the player. */
  private blink: Attack = (_dt, t) => {
    const out = 0.3;
    if (t < out) {
      this.blinking = true;
      this.alpha = 1 - t / out;
      return false;
    }
    if (this.count === 0) {
      this.count = 1;
      const options = SPOTS.filter((s) => Math.hypot(s.x - this.player.x, s.y - this.player.y) > 380 && s.x !== this.x);
      const pick = options[Math.floor(Math.random() * options.length)] ?? SPOTS[0];
      this.position.set(pick.x, pick.y);
    }
    this.alpha = Math.min(1, (t - out) / out);
    if (this.alpha < 1) return false;
    this.blinking = false;
    return true;
  };

  /** Rotating spiral of bolts. Every 8th bolt is parryable. */
  private spiral: Attack = (_dt, t) => {
    this.wizard.pose = "channel";
    const s = this.staff;
    this.fireEvery(t, 0.09, Math.round(2.4 / 0.09), (i) => {
      for (let a = 0; a < this.spiralArms; a++) {
        const angle = i * 0.09 * this.spiralSpin + (a / this.spiralArms) * Math.PI * 2;
        this.bullets.spawn(s.x, s.y, Math.cos(angle) * 260, Math.sin(angle) * 260, {
          parryable: a === 0 && i % 8 === 7,
          shape: { ctx: ARCANE_BOLT() },
        });
      }
    });
    return t > 2.6;
  };

  /** Three big slow orbs aimed at the player. The middle one is parryable. */
  private orbs: Attack = (_dt, t) => {
    this.wizard.pose = "cast";
    const done = this.fireEvery(t, 0.5, 3, (i) => {
      const s = this.staff;
      const tg = this.target;
      const angle = Math.atan2(tg.y - s.y, tg.x - s.x);
      this.bullets.spawn(s.x, s.y, Math.cos(angle) * 230, Math.sin(angle) * 230, {
        radius: 18,
        parryable: i === 1,
        shape: { ctx: HEX_ORB(), spin: 3 },
      });
    });
    return done && t > 1.3;
  };

  /**
   * Walls of runes sweep across from one edge with a gap: low gap (stay on the floor)
   * or high gap (be up on the side platforms or jumping).
   */
  private curtain: Attack = (_dt, t) => {
    this.wizard.pose = "channel";
    const fromLeft = this.x > GAME_WIDTH / 2;
    const x = fromLeft ? -10 : GAME_WIDTH + 10;
    const vx = fromLeft ? 300 : -300;
    const gaps = [600, 440, 600];
    const done = this.fireEvery(t, 1.3, gaps.length, (i) => {
      const gap = gaps[i];
      for (let y = 20; y <= 620; y += 40) {
        if (Math.abs(y - gap) <= 70) continue;
        // The rune right above the gap is parryable: jump out of the gap to catch it.
        const parryable = y < gap - 70 && y + 40 > gap - 70;
        this.bullets.spawn(x, y, vx, 0, { parryable, shape: { ctx: RUNE_BAR(), orient: false } });
      }
    });
    return done && t > 3;
  };

  /**
   * NEW: four hex wisps circle out of the staff, then home in on the player for a while
   * before flying straight. Outrun them, or dash through. The last one is parryable.
   */
  private homing: Attack = (_dt, t) => {
    this.wizard.pose = "cast";
    const count = this.spiralArms >= 4 ? 5 : 4;
    const done = this.fireEvery(t, 0.25, count, (i) => {
      const s = this.staff;
      const a = -Math.PI / 2 + (i - (count - 1) / 2) * 0.6; // fan upward first
      const b = this.bullets.spawn(s.x, s.y, Math.cos(a) * 240, Math.sin(a) * 240, {
        radius: 10,
        parryable: i === count - 1,
        shape: { ctx: HEX_WISP() },
      });
      this.wisps.push({ b, age: 0 });
    });
    return done && t > count * 0.25 + 0.6;
  };

  private steerWisps(dt: number): void {
    const homeTime = 1.8;
    const turn = 3.2; // rad/s
    this.wisps = this.wisps.filter((w) => {
      if (w.b.destroyed || w.b.dead) return false;
      w.age += dt;
      if (w.age > homeTime) return false; // stop steering, keep flying straight
      const tg = this.target;
      const want = Math.atan2(tg.y - w.b.y, tg.x - w.b.x);
      const cur = Math.atan2(w.b.vy, w.b.vx);
      let diff = want - cur;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      const next = cur + Math.max(-turn * dt, Math.min(turn * dt, diff));
      const speed = Math.min(330, Math.hypot(w.b.vx, w.b.vy) + 60 * dt);
      w.b.vx = Math.cos(next) * speed;
      w.b.vy = Math.sin(next) * speed;
      w.b.rotation = next;
      return true;
    });
  }

  /**
   * NEW: rune circles appear under the player and on other surfaces, then explode
   * in pillars of light that throw bolts upward. Step off the circles before they go off.
   */
  private runeTraps: Attack = (_dt, t) => {
    const arm = 1;
    if (this.justStarted) {
      this.wizard.pose = "channel";
      this.traps = [{ x: this.player.x, y: this.surfaceUnder(this.player.x, this.player.y) }];
      const extra = this.spiralArms >= 4 ? 3 : 2;
      for (let i = 0; i < extra; i++) {
        const [l, r, y] = SURFACES[Math.floor(Math.random() * SURFACES.length)];
        this.traps.push({ x: l + 60 + Math.random() * (r - l - 120), y });
      }
      for (const tr of this.traps) {
        this.fx.stillView(new Graphics(RUNE_CIRCLE()), tr.x, tr.y - 2, { life: arm, fadeIn: 0.2, scaleFrom: 0.4, scaleTo: 1 });
      }
    }
    this.fireEvery(t - arm, 1, 1, () => {
      for (const tr of this.traps) {
        const pillar = new Graphics().rect(-34, -200, 68, 200).fill({ color: 0xb388ff, alpha: 0.45 }).rect(-14, -200, 28, 200).fill({ color: 0xffffff, alpha: 0.7 });
        this.fx.stillView(pillar, tr.x, tr.y, { life: 0.35, fadeOut: 0.3 });
        for (const h of [20, 60, 100, 140]) this.bullets.spawn(tr.x, tr.y - h, 0, 0, { radius: 26, hidden: true, life: 0.2 });
        for (let k = -1; k <= 1; k++) {
          const a = -Math.PI / 2 + k * 0.45;
          this.bullets.spawn(tr.x, tr.y - 30, Math.cos(a) * 340, Math.sin(a) * 340, { shape: { ctx: ARCANE_BOLT() } });
        }
      }
    });
    return t > arm + 0.5;
  };

  /** y of the floor or platform the player is standing on (or the floor below them). */
  private surfaceUnder(x: number, y: number): number {
    let best = GROUND_Y;
    for (const [l, r, sy] of SURFACES) if (x >= l && x <= r && sy >= y - 4 && sy < best) best = sy;
    return best;
  }

  protected override onPhaseChange(index: number): void {
    this.blinking = false;
    this.alpha = 1;
    this.wizard.pose = "idle";
    this.spiralArms = index + 2;
    this.spiralSpin = 3.2 + index * 0.6;
    if (index === this.phases.length - 1) this.body.tint = 0xffb3b3;
  }
}
