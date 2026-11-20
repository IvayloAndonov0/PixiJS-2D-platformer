import { AnimatedSprite, Container, Graphics, Sprite } from "pixi.js";
import { anim } from "../assets";
import { COLORS, DEBUG_HITBOXES, GAME_HEIGHT, GAME_WIDTH, PLANE, PLAYER, SHADOW_DASH, SUPER, WEAPONS } from "../config";
import type { Input } from "../core/Input";
import { type CharmId, DEFAULT_LOADOUT, type Loadout, type WeaponId } from "../core/Upgrades";
import type { BulletPool } from "../systems/BulletPool";
import type { Effects } from "../systems/Effects";
import type { Rect } from "../systems/collision";
import type { Fighter } from "./Fighter";

const BODY = 0xd8504a;
const BODY_DARK = 0x9c3530;
const WING = 0xf2e3c6;
const TRIM = 0x3e2723;

/**
 * The player in a small propeller plane (plane levels). Position (x, y) is the plane's center.
 *  - fly in 8 directions (no gravity), always shooting forward (right)
 *  - Jump: parry (the plane flashes green; touch a parryable bullet to parry it)
 *  - Dash: barrel roll in the direction you're steering (vulnerable unless Shadow Dash is equipped)
 *  - Special: big piercing shot when the super meter is full
 *  - uses the shop loadout like the ground player (weapons, Extra Heart, Shadow Dash)
 */
export class Plane extends Container implements Fighter {
  vx = 0;
  vy = 0;
  maxHp = PLAYER.maxHp;
  hp = PLAYER.maxHp;
  meter = 0;
  supersUsed = 0;
  minX = 0;
  aimTarget?: () => { x: number; y: number } | undefined;

  private art = new Container(); // everything that rolls / tilts
  private propeller = new Graphics();
  private pilot: AnimatedSprite;
  private debugBox = new Graphics();

  private weapons: [WeaponId, WeaponId | null] = [...DEFAULT_LOADOUT.weapons];
  private weaponIndex = 0;
  private charm: CharmId | null = null;

  private fireTimer = 0;
  private invulnTimer = 0;
  private hurtTimer = 0;
  private parryTimer = 0;
  private parryCooldown = 0;
  private rollTimer = 0;
  private rollCooldown = 0;
  private rollDir = { x: 1, y: 0 };
  private deathTime = 0;
  private time = 0;
  private trailTimer = 0;
  private afterimages: Graphics[] = [];

  constructor(
    private input: Input,
    private bullets: BulletPool,
    private fx?: Effects,
  ) {
    super();
    // The pilot sits in the cockpit: the hero's idle animation, small, with the fuselage drawn over its legs.
    this.pilot = new AnimatedSprite({ textures: anim("player", "Idle"), updateAnchor: true });
    this.pilot.scale.set(0.34);
    this.pilot.position.set(2, 2);
    this.pilot.animationSpeed = 8 / 60;
    this.pilot.play();
    this.art.addChild(this.pilot, drawPlane(), this.propeller);
    this.propeller.position.set(50, 2);
    this.addChild(this.art);
    if (DEBUG_HITBOXES) this.addChild(this.debugBox);
    this.position.set(200, GAME_HEIGHT / 2);
  }

  // ---------------------------------------------------------------- Fighter

  equip(lo: Loadout): void {
    this.weapons = [lo.weapons[0], lo.weapons[1]];
    this.weaponIndex = 0;
    this.charm = lo.charm;
    this.maxHp = PLAYER.maxHp + (lo.charm === "heart" ? 1 : 0);
    this.hp = this.maxHp;
  }

  /** Planes start mid-air on the left of the screen. */
  spawnAt(x: number): void {
    this.position.set(x, GAME_HEIGHT * 0.45);
  }

  get weapon(): WeaponId {
    return this.weapons[this.weaponIndex] ?? this.weapons[0];
  }

  get hasSecondWeapon(): boolean {
    return this.weapons[1] !== null;
  }

  get hitbox(): Rect {
    return { x: this.x - PLANE.hitW / 2, y: this.y - PLANE.hitH / 2, w: PLANE.hitW, h: PLANE.hitH };
  }

  /** Bigger box used only to catch parryable bullets. */
  get parryBox(): Rect {
    return { x: this.x - 60, y: this.y - 45, w: 120, h: 90 };
  }

  get isParrying(): boolean {
    return this.parryTimer > 0;
  }

  get isPhasing(): boolean {
    return this.rollTimer > 0 && this.charm === "shadow";
  }

  get isInvulnerable(): boolean {
    return this.invulnTimer > 0 || this.isPhasing || (this.rollTimer > 0 && PLAYER.dashInvulnerable);
  }

  get isDead(): boolean {
    return this.hp <= 0;
  }

  get deathFinished(): boolean {
    return this.isDead && this.deathTime >= PLANE.deathDuration;
  }

  get superReady(): boolean {
    return this.meter >= SUPER.max;
  }

  addMeter(amount: number): void {
    this.meter = Math.min(SUPER.max, this.meter + amount);
  }

  takeHit(): void {
    if (this.isInvulnerable || this.isDead) return;
    this.hp = Math.max(0, this.hp - 1);
    this.invulnTimer = PLAYER.invulnTime;
    this.hurtTimer = 0.25;
    if (this.isDead) {
      this.deathTime = 0;
      this.rollTimer = 0;
      this.parryTimer = 0;
      this.vy = -200;
      this.fx?.spawn("fx", "Smoke", this.x, this.y, { scale: 1 });
    }
    // TODO(audio): hit sound
  }

  onParry(): void {
    this.parryTimer = 0;
    this.parryCooldown = 0; // allow chaining parries
    this.addMeter(SUPER.perParry);
    // TODO(audio): parry sound
  }

  // ---------------------------------------------------------------- update

  update(dt: number): void {
    this.time += dt;
    this.updateAfterimages(dt);
    if (this.isDead) return this.updateDeath(dt);

    const input = this.input;
    this.fireTimer = Math.max(0, this.fireTimer - dt);
    this.invulnTimer = Math.max(0, this.invulnTimer - dt);
    this.hurtTimer = Math.max(0, this.hurtTimer - dt);
    this.parryTimer = Math.max(0, this.parryTimer - dt);
    this.parryCooldown = Math.max(0, this.parryCooldown - dt);
    this.rollTimer = Math.max(0, this.rollTimer - dt);
    this.rollCooldown = Math.max(0, this.rollCooldown - dt);

    let ax = input.axisX();
    let ay = input.axisY();
    const len = Math.hypot(ax, ay);
    if (len > 0) {
      ax /= len;
      ay /= len;
    }

    // --- Barrel roll (Dash) ---
    if (input.wasPressed("dash") && this.rollCooldown === 0) {
      this.rollTimer = PLANE.rollDuration;
      this.rollCooldown = PLANE.rollCooldown;
      this.rollDir = len > 0 ? { x: ax, y: ay } : { x: 1, y: 0 };
    }

    // --- Parry (Jump) ---
    if (input.wasPressed("jump") && this.parryCooldown === 0) {
      this.parryTimer = PLAYER.parryWindow;
      this.parryCooldown = PLANE.parryCooldown;
    }

    // --- Move: ease toward the stick direction, no gravity ---
    if (this.rollTimer > 0) {
      this.vx = this.rollDir.x * PLANE.rollSpeed;
      this.vy = this.rollDir.y * PLANE.rollSpeed;
    } else {
      const k = Math.min(1, PLANE.accel * dt);
      this.vx += (ax * PLANE.speed - this.vx) * k;
      this.vy += (ay * PLANE.speed - this.vy) * k;
    }
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    const m = PLANE.margin;
    this.x = Math.max(this.minX + m + 20, Math.min(GAME_WIDTH - m - 20, this.x));
    this.y = Math.max(m, Math.min(GAME_HEIGHT - m, this.y));

    // --- Switch weapon ---
    if (input.wasPressed("swap") && this.hasSecondWeapon) {
      this.weaponIndex = 1 - this.weaponIndex;
      this.fireTimer = Math.max(this.fireTimer, 0.1);
    }

    // --- Special / shoot (not mid-roll) ---
    if (this.rollTimer === 0) {
      if (input.wasPressed("special") && this.superReady) this.fireSpecial();
      if (input.isDown("shoot") && this.fireTimer === 0) this.shoot();
    }

    this.updateVisuals();
  }

  // ---------------------------------------------------------------- shooting

  private get nose(): { x: number; y: number } {
    return { x: this.x + 54, y: this.y + 4 };
  }

  private shoot(): void {
    const { x, y } = this.nose;
    switch (this.weapon) {
      case "blaster":
        this.fireTimer = 1 / PLANE.fireRate;
        // Alternate slightly up/down so the stream looks like twin guns.
        this.bullets.spawn(x, y + (Math.floor(this.time * PLANE.fireRate) % 2 ? -5 : 5), PLANE.bulletSpeed, 0, {
          sprite: { sheet: "fx", anim: "Card", scale: 0.55 },
        });
        break;
      case "spread": {
        const w = WEAPONS.spread;
        this.fireTimer = 1 / w.fireRate;
        for (const a of w.angles) {
          this.bullets.spawn(x, y, Math.cos(a) * w.speed, Math.sin(a) * w.speed, {
            damage: w.damage,
            radius: w.radius,
            color: 0xffb74d,
            life: w.range / w.speed,
          });
        }
        break;
      }
      case "homing": {
        const w = WEAPONS.homing;
        this.fireTimer = 1 / w.fireRate;
        this.bullets.spawn(x, y, w.speed, 0, {
          damage: w.damage,
          radius: w.radius,
          color: 0xb388ff,
          life: w.life,
          homing: { target: () => this.aimTarget?.(), turnRate: w.turnRate },
        });
        break;
      }
    }
    // TODO(audio): shoot sound
  }

  private fireSpecial(): void {
    this.meter = 0;
    this.supersUsed++;
    this.invulnTimer = Math.max(this.invulnTimer, SUPER.invulnTime);
    this.fx?.spawn("super", "SuperCircle", this.x, this.y + 40, { scale: 0.8, fps: 14 });
    const { x, y } = this.nose;
    this.bullets.spawn(x, y, SUPER.speed, 0, {
      radius: SUPER.radius,
      damage: SUPER.damage,
      piercing: true,
      sprite: { sheet: "super", anim: "Vortex", scale: 1.1, spin: 14 },
    });
  }

  // ---------------------------------------------------------------- visuals

  private updateVisuals(): void {
    // Propeller: a blade that squashes as it spins.
    const s = Math.cos(this.time * 60);
    this.propeller.clear().ellipse(0, 0, 4, 26 * Math.abs(s) + 3).fill({ color: 0x2b2118, alpha: 0.75 }).circle(0, 0, 5).fill(TRIM);

    // Tilt with vertical speed; barrel roll squashes the plane through a full turn.
    this.art.rotation = (this.vy / PLANE.speed) * 0.25;
    if (this.rollTimer > 0) {
      const p = 1 - this.rollTimer / PLANE.rollDuration;
      this.art.scale.y = Math.cos(p * Math.PI * 2);
    } else {
      this.art.scale.y = 1;
    }
    // Bob gently in the air.
    this.art.y = Math.sin(this.time * 5) * 2;

    const tint = this.isParrying ? COLORS.parryable : this.isPhasing ? SHADOW_DASH.tint : this.hurtTimer > 0 ? 0xff8a80 : 0xffffff;
    for (const c of this.art.children) (c as Sprite | Graphics).tint = tint;
    this.alpha = this.invulnTimer > 0 && Math.floor(this.invulnTimer * 20) % 2 === 0 ? 0.35 : 1;
    if (this.isPhasing) this.alpha = SHADOW_DASH.alpha;

    if (DEBUG_HITBOXES) {
      const h = this.hitbox;
      this.debugBox.clear().rect(-h.w / 2, -h.h / 2, h.w, h.h).stroke({ color: 0x00ff00, width: 2 });
    }
  }

  /** Shadow Dash trail: fading dark plane silhouettes. */
  private updateAfterimages(dt: number): void {
    if (this.isPhasing && this.parent) {
      this.trailTimer -= dt;
      if (this.trailTimer <= 0) {
        this.trailTimer = SHADOW_DASH.trailEvery;
        const ghost = drawPlane();
        ghost.position.copyFrom(this.position);
        ghost.rotation = this.art.rotation;
        ghost.scale.y = this.art.scale.y;
        ghost.tint = SHADOW_DASH.tint;
        ghost.alpha = 0.6;
        this.parent.addChildAt(ghost, this.parent.getChildIndex(this));
        this.afterimages.push(ghost);
      }
    }
    for (let i = this.afterimages.length - 1; i >= 0; i--) {
      const g = this.afterimages[i];
      g.alpha -= (0.6 / SHADOW_DASH.trailLife) * dt;
      if (g.alpha <= 0) {
        g.destroy();
        this.afterimages.splice(i, 1);
      }
    }
  }

  /** Shot down: spin and fall off the bottom of the screen, trailing smoke. */
  private updateDeath(dt: number): void {
    this.deathTime += dt;
    this.alpha = 1;
    this.vy += 900 * dt;
    this.x += 60 * dt;
    this.y = Math.min(GAME_HEIGHT + 200, this.y + this.vy * dt);
    this.art.rotation += 6 * dt;
    this.propeller.visible = false;
    this.trailTimer -= dt;
    if (this.trailTimer <= 0 && this.y < GAME_HEIGHT + 50) {
      this.trailTimer = 0.12;
      this.fx?.spawn("fx", "Smoke", this.x, this.y, { scale: 0.6 });
    }
  }
}

/** The plane body, facing right, centered on (0, 0). TODO(art): plane sprite. */
function drawPlane(): Graphics {
  return (
    new Graphics()
      // far wing (behind the body)
      .roundRect(-18, -8, 40, 10, 5)
      .fill(BODY_DARK)
      // tail fin + tailplane
      .poly([-46, -2, -58, -26, -42, -24, -30, -4])
      .fill(BODY)
      .stroke({ color: TRIM, width: 2 })
      .roundRect(-60, 0, 26, 8, 4)
      .fill(BODY_DARK)
      // fuselage
      .ellipse(0, 4, 50, 16)
      .fill(BODY)
      .stroke({ color: TRIM, width: 2.5 })
      .rect(-30, 6, 70, 4)
      .fill({ color: 0xffffff, alpha: 0.35 })
      // cockpit rim (the pilot sits behind it)
      .roundRect(-12, -12, 30, 8, 4)
      .fill(TRIM)
      // near wing
      .roundRect(-22, 8, 52, 12, 6)
      .fill(WING)
      .stroke({ color: TRIM, width: 2 })
      // nose cone
      .ellipse(46, 3, 7, 11)
      .fill(COLORS.superBarFull)
      .stroke({ color: TRIM, width: 2 })
  );
}
