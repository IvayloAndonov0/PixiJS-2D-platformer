import { Sprite } from "pixi.js";
import { frame } from "../../assets";
import { GAME_WIDTH, GROUND_Y } from "../../config";
import type { BulletPool } from "../../systems/BulletPool";
import type { Bullet, BulletSprite } from "../Bullet";
import type { Player } from "../Player";
import { Boss, type Attack, type Phase } from "./Boss";

/** Bottom of the body while floating. */
const FLOAT_Y = 330;
/** On-screen height of the body art. The enraged pose is drawn bigger in the sheet, so it gets more. */
const POSE_HEIGHT: Record<string, number> = { Pose1: 290, Pose2: 290, Pose3: 290, Pose4: 295, Pose5: 320 };
/** The black sun sits this far down from the top of every pose (fraction of its height). */
const CORE_FROM_TOP = 0.26;
const METEORS = ["Meteor1", "Meteor2", "Meteor3", "Meteor4", "MeteorSmall"];

type Pose = "Pose1" | "Pose2" | "Pose3" | "Pose4" | "Pose5";

/** Sprite bullet from the eclipse sheet. */
const art = (name: string, scale: number, extra: Partial<BulletSprite> = {}): BulletSprite => ({ sheet: "eclipse", anim: name, scale, ...extra });

/**
 * Final boss: a robed figure crowned by a black sun. Art: art/eclipse_heart_sheet.png
 * (cut into public/assets/sprites/eclipse.png by tools/build_spritesheets.py).
 *
 * Attacks: rings, aimed stars while drifting, a broken sweeping beam, meteors, lances that drop
 * from the sky, boomerang crescent blades, spikes that erupt from floor portals, and a vortex
 * that pulls you in before it bursts.
 */
export class EclipseHeart extends Boss {
  protected phases: Phase[];
  private art = new Sprite();
  private basePose: Pose = "Pose1";
  private poseHeight = 300;
  private time = 0;
  private deathFx = false;

  private driftTo = 0;
  private sweepDir = 1;
  private beams = 1;
  /** Live meteors (burst into flames on the floor) and boomerang blades (pulled back to the boss). */
  private meteorsLive: Bullet[] = [];
  private blades: { b: Bullet; ax: number; ay: number }[] = [];
  private targets: number[] = [];
  private vortex = { x: 0, y: 0 };
  private vortexHit?: Bullet;

  constructor(bullets: BulletPool, player: Player) {
    super("Eclipse Heart", 480, 170, 250, bullets, player);
    this.position.set(GAME_WIDTH / 2, FLOAT_Y);
    this.body.visible = false; // placeholder box only kept for the hit-flash timing
    this.addChild(this.art);
    this.setPose("Pose1");

    this.phases = [
      {
        name: "Phase 1",
        untilHpFraction: 0.7,
        attacks: [this.pulseRings, this.drift, this.lanceDrop, this.sweep, this.drift],
        restTime: 0.9,
      },
      {
        name: "Phase 2",
        untilHpFraction: 0.35,
        attacks: [this.meteors, this.crescents, this.drift, this.umbralSpikes, this.sweep, this.pulseRings],
        restTime: 0.7,
      },
      {
        name: "Phase 3",
        untilHpFraction: 0,
        attacks: [this.voidRift, this.sweep, this.meteors, this.crescents, this.umbralSpikes, this.lanceDrop, this.drift],
        restTime: 0.5,
      },
    ];
  }

  private get core() {
    return { x: this.x, y: this.y - this.poseHeight * (1 - CORE_FROM_TOP) };
  }

  private setPose(pose: Pose): void {
    const tex = frame("eclipse", pose);
    this.art.texture = tex;
    this.art.anchor.set(0.5, 1);
    this.poseHeight = POSE_HEIGHT[pose];
    this.art.scale.set(this.poseHeight / tex.height);
  }

  override get hitbox() {
    const h = this.poseHeight * 0.88;
    return { x: this.x - this.bodyW / 2, y: this.y - h, w: this.bodyW, h };
  }

  override update(dt: number): void {
    super.update(dt);
    this.time += dt;

    this.art.y = Math.sin(this.time * 2) * 6; // float bob
    this.art.alpha = this.body.alpha; // hit flash
    this.updateMeteors();
    this.updateBlades(dt);

    if (this.isDead && !this.deathFx) {
      this.deathFx = true;
      this.fx.still(frame("eclipse", "Rift"), this.x, this.y + 20, { life: 1.6, fadeOut: 0.8, scaleFrom: 0.6, scaleTo: 1.4 });
      this.fx.still(frame("eclipse", "Smoke2"), this.x, GROUND_Y + 10, { life: 1.4, fadeOut: 0.7, scaleFrom: 0.8, scaleTo: 1.3 });
      this.art.visible = false;
    }
  }

  /** Casting poses are held for one attack, then it goes back to the phase's idle pose. */
  protected override onAttackEnd(): void {
    this.setPose(this.basePose);
  }

  // ---------------------------------------------------------------- attacks

  /** Three rings of small eclipses, each rotated a bit. Every 4th one is parryable. */
  private pulseRings: Attack = (_dt, t) => {
    if (this.justStarted) this.setPose("Pose2");
    const done = this.fireEvery(t, 0.45, 3, (i) => {
      const n = 16;
      for (let k = 0; k < n; k++) {
        const a = i * 0.2 + (k / n) * Math.PI * 2;
        this.bullets.spawn(this.core.x, this.core.y, Math.cos(a) * 280, Math.sin(a) * 280, {
          radius: 11,
          parryable: k % 4 === 0,
          sprite: art("OrbSmall", 0.32),
        });
      }
    });
    return done && t > 1.2;
  };

  /** Glide sideways while throwing spinning stars at the player. */
  private drift: Attack = (_dt, t) => {
    if (this.justStarted) this.driftTo = 200 + Math.random() * (GAME_WIDTH - 400);
    const p = Math.min(t / 1.6, 1);
    const e = p * p * (3 - 2 * p);
    this.x = this.startX + (this.driftTo - this.startX) * e;
    this.y = FLOAT_Y + Math.sin(p * Math.PI * 2) * 20;
    this.fireEvery(t, 0.4, 4, (i) => {
      const c = this.core;
      const tg = this.target;
      const a = Math.atan2(tg.y - c.y, tg.x - c.x);
      this.bullets.spawn(c.x, c.y, Math.cos(a) * 480, Math.sin(a) * 480, {
        radius: 12,
        parryable: i === 3,
        sprite: art("StarGold", 0.36, { spin: 8 }),
      });
    });
    return p >= 1;
  };

  /**
   * A broken beam sweeps across the floor. It fires in bursts with gaps:
   * slip through a gap or dash through it. In phase 3 a mirrored second beam joins in.
   */
  private sweep: Attack = (_dt, t) => {
    const duration = 2.4;
    const interval = 0.035;
    if (this.justStarted) {
      this.setPose("Pose4");
      this.sweepDir = this.player.x < this.x ? 1 : -1; // start on the far side
    }
    this.fireEvery(t, interval, Math.round(duration / interval), (i) => {
      if (i % 9 >= 5) return; // gap
      const p = (i * interval) / duration;
      const a0 = this.sweepDir > 0 ? 0.2 : Math.PI - 0.2;
      const angle = a0 + this.sweepDir * p * (Math.PI - 0.4);
      for (let b = 0; b < this.beams; b++) {
        const a = b === 0 ? angle : Math.PI - angle; // second beam mirrors the first
        this.bullets.spawn(this.core.x, this.core.y, Math.cos(a) * 600, Math.sin(a) * 600, {
          radius: 9,
          sprite: art("Star", 0.42, { spin: 10 }),
        });
      }
    });
    return t > duration + 0.3;
  };

  /** Flaming meteors fall from the sky and burst on the floor. Every 4th one is parryable. */
  private meteors: Attack = (_dt, t) => {
    if (this.justStarted) this.setPose("Pose3");
    const count = this.beams > 1 ? 14 : 10;
    const done = this.fireEvery(t, 0.18, count, (i) => {
      const x = 40 + Math.random() * (GAME_WIDTH - 80);
      const name = METEORS[Math.floor(Math.random() * METEORS.length)];
      const b = this.bullets.spawn(x, -40, (Math.random() - 0.5) * 120, 60, {
        radius: 18,
        gravity: 650,
        parryable: i % 4 === 3,
        sprite: art(name, 0.5, { orient: false }),
      });
      this.meteorsLive.push(b);
    });
    return done && t > count * 0.18 + 0.6;
  };

  private updateMeteors(): void {
    this.meteorsLive = this.meteorsLive.filter((b) => {
      if (b.destroyed || b.dead) return false;
      if (b.y < GROUND_Y - 12) return true;
      b.dead = true;
      this.fx.still(frame("eclipse", "MeteorImpact"), b.x, GROUND_Y + 6, { life: 0.5, fadeOut: 0.3, scaleFrom: 0.35, scaleTo: 0.55 });
      return false;
    });
  }

  /**
   * NEW: lances appear in the sky above the player one after another, hang for a moment, then drop.
   * The last one is parryable.
   */
  private lanceDrop: Attack = (_dt, t) => {
    const count = this.beams > 1 ? 5 : 4;
    const gap = 0.35;
    const hang = 0.6;
    if (this.justStarted) {
      this.setPose("Pose3");
      this.targets = [];
    }
    // Mark a new spot every `gap` seconds.
    while (this.targets.length < count && t >= this.targets.length * gap) {
      const x = Math.max(40, Math.min(GAME_WIDTH - 40, this.player.x));
      this.targets.push(x);
      this.fx.still(frame("eclipse", "Lance"), x, 90, { life: hang, fadeIn: 0.2, rotation: Math.PI / 2, scaleFrom: 0.35, scaleTo: 0.45, alpha: 0.75 });
    }
    this.fireEvery(t - hang, gap, count, (i) => {
      const x = this.targets[i];
      const parryable = i === count - 1;
      // The art is long, so a second hidden hitbox covers the tip ahead of the center.
      this.bullets.spawn(x, 120, 0, 1300, { radius: 14, parryable, sprite: art("Lance", 0.45) });
      this.bullets.spawn(x, 170, 0, 1300, { radius: 12, hidden: true });
    });
    return this.count >= count && t > hang + (count - 1) * gap + 0.5;
  };

  /**
   * NEW: crescent blades fly out at the player, slow down, and come back like boomerangs.
   * The second blade is parryable.
   */
  private crescents: Attack = (_dt, t) => {
    if (this.justStarted) this.setPose("Pose4");
    const count = this.beams > 1 ? 3 : 2;
    const done = this.fireEvery(t, 0.4, count, (i) => {
      const c = this.core;
      const tg = this.target;
      const a = Math.atan2(tg.y - c.y, tg.x - c.x) + (i - (count - 1) / 2) * 0.35;
      const speed = 820;
      const b = this.bullets.spawn(c.x, c.y, Math.cos(a) * speed, Math.sin(a) * speed, {
        radius: 24,
        parryable: i === 1,
        sprite: art(i % 2 ? "BladeA" : "BladeBig", 0.72, { spin: -14 }),
      });
      // Constant pull back toward where it was thrown from: reverses after ~0.9s.
      const pull = speed / 0.9;
      this.blades.push({ b, ax: -Math.cos(a) * pull, ay: -Math.sin(a) * pull });
    });
    return done && t > 2.4;
  };

  private updateBlades(dt: number): void {
    this.blades = this.blades.filter(({ b, ax, ay }) => {
      if (b.destroyed || b.dead) return false;
      b.vx += ax * dt;
      b.vy += ay * dt;
      return true;
    });
  }

  /**
   * NEW: dark portals open under the player and to both sides, then spikes erupt from them.
   * Jump or dash out of the marked spots.
   */
  private umbralSpikes: Attack = (_dt, t) => {
    const warn = 0.85;
    if (this.justStarted) {
      this.setPose("Pose2");
      const px = this.player.x;
      const offsets = this.beams > 1 ? [-480, -240, 0, 240, 480] : [-300, 0, 300];
      this.targets = offsets.map((d) => Math.max(70, Math.min(GAME_WIDTH - 70, px + d)));
      for (const x of this.targets) {
        this.fx.still(frame("eclipse", "Portal"), x, GROUND_Y + 8, { life: warn + 0.1, fadeIn: 0.2, scaleFrom: 0.3, scaleTo: 0.6 });
      }
    }
    this.fireEvery(t - warn, 1, 1, () => {
      for (const x of this.targets) {
        this.fx.still(frame("eclipse", "SpikesWide"), x, GROUND_Y + 6, { life: 0.6, fadeOut: 0.3, scaleFrom: 0.55, scaleTo: 0.65 });
        for (let k = -2; k <= 2; k++) {
          for (const h of [20, 60, 100]) {
            this.bullets.spawn(x + k * 22, GROUND_Y - h, 0, 0, { radius: 16, hidden: true, life: 0.4 });
          }
        }
      }
    });
    return t > warn + 0.6;
  };

  /**
   * NEW: a vortex opens and drags the player toward it, then bursts into a ring of void orbs.
   * Touching the vortex itself hurts.
   */
  private voidRift: Attack = (dt, t) => {
    const life = 2.4;
    if (this.justStarted) {
      this.setPose("Pose5");
      // Open it on the far side from the player so the pull is felt.
      const x = this.player.x < GAME_WIDTH / 2 ? 760 + Math.random() * 300 : 220 + Math.random() * 300;
      this.vortex = { x, y: GROUND_Y - 150 };
      this.fx.still(frame("eclipse", "Vortex"), x, this.vortex.y, { life, fadeIn: 0.3, fadeOut: 0.2, scaleFrom: 0.55, scaleTo: 0.95, spin: 3 });
      this.vortexHit = undefined;
    }
    // Invisible hitbox on the vortex. Bullets die when they hit (or are dashed through), so keep it alive.
    if (t < life && (!this.vortexHit || this.vortexHit.dead || this.vortexHit.destroyed)) {
      this.vortexHit = this.bullets.spawn(this.vortex.x, this.vortex.y, 0, 0, { radius: 46, hidden: true, life: life - t });
    }
    if (t < life && !this.player.isDead) {
      const dir = Math.sign(this.vortex.x - this.player.x);
      this.player.x += dir * Math.min(150 * dt, Math.abs(this.vortex.x - this.player.x));
    }
    this.fireEvery(t - life, 1, 1, () => {
      const n = this.beams > 1 ? 16 : 12;
      for (let k = 0; k < n; k++) {
        const a = (k / n) * Math.PI * 2;
        this.bullets.spawn(this.vortex.x, this.vortex.y, Math.cos(a) * 300, Math.sin(a) * 300, {
          radius: 12,
          parryable: k % 4 === 0,
          sprite: art("VoidOrb", 0.32),
        });
      }
      this.fx.still(frame("eclipse", "Smoke1"), this.vortex.x, this.vortex.y + 60, { life: 0.7, fadeOut: 0.5, scaleFrom: 0.5, scaleTo: 0.8 });
    });
    return t > life + 0.4;
  };

  protected override onPhaseChange(index: number): void {
    this.y = FLOAT_Y;
    this.beams = index >= 2 ? 2 : 1;
    this.basePose = index >= 2 ? "Pose5" : "Pose1";
    this.setPose(this.basePose);
    this.fx.still(frame("eclipse", "Rift"), this.x, this.y + 10, { life: 0.9, fadeIn: 0.1, fadeOut: 0.5, scaleFrom: 0.8, scaleTo: 1.3 });
    this.fx.still(frame("eclipse", "Smoke2"), this.x, this.y + 30, { life: 0.8, fadeOut: 0.5, scaleFrom: 0.6, scaleTo: 1 });
  }
}
