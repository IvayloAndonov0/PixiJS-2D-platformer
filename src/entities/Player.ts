import { AnimatedSprite, Container, Graphics } from "pixi.js";
import { anim } from "../assets";
import { BULLET, COLORS, DEBUG_HITBOXES, GAME_HEIGHT, GAME_WIDTH, GROUND_Y, PLAYER, SUPER } from "../config";
import type { Input } from "../core/Input";
import type { BulletPool } from "../systems/BulletPool";
import type { Effects } from "../systems/Effects";
import type { Rect } from "../systems/collision";
import type { Terrain } from "../level/Terrain";
import type { Platform } from "./Platform";

/** Player animation name in assets/sprites/player.json -> playback settings. */
const ANIMS = {
  Idle: { fps: 10, loop: true },
  Run: { fps: 14, loop: true },
  Dash: { fps: 30, loop: false },
  JumpRise: { fps: 10, loop: false },
  JumpFall: { fps: 10, loop: false },
  Land: { fps: 24, loop: false },
  Crouch: { fps: 10, loop: true },
  Shoot: { fps: 16, loop: true },
  Hurt: { fps: 12, loop: false },
  Death: { fps: 6, loop: false },
  Ghost: { fps: 8, loop: true },
} as const;
type AnimName = keyof typeof ANIMS;

/**
 * Run-and-gun player:
 *  - move, variable-height jump, dash (invulnerable while dashing)
 *  - crouch: hold Down on the floor (shorter hitbox, can't walk, shoots low)
 *  - one-way platforms: jump up through them, press Down while standing on one to drop through
 *  - shoot in 8 directions, hold "lock" to aim in place
 *  - parry: press Jump again in mid-air to parry parryable projectiles (bounces you up, fills super meter)
 *  - special: when the super meter is full, press Special for a big piercing shot
 * Position (x, y) is the bottom-center of the feet.
 */
export class Player extends Container {
  vx = 0;
  vy = 0;
  hp = PLAYER.maxHp;
  facing: 1 | -1 = 1;
  onGround = true;
  crouching = false;
  /** Super meter, 0..SUPER.max */
  meter = 0;

  private sprite: AnimatedSprite;
  private currentAnim?: AnimName;
  private debugBox = new Graphics();

  private dashTimer = 0;
  private dashCooldown = 0;
  private invulnTimer = 0;
  private fireTimer = 0;
  private parryTimer = 0;
  private hurtTimer = 0;
  private landTimer = 0;
  /** One parry attempt per jump. Refreshed on landing or after a successful parry. */
  private canParry = true;
  /** Seconds since HP hit 0. */
  private deathTime = 0;
  /** Platform we're currently standing on (null = floor or airborne). */
  private standingOn: Platform | null = null;
  /** Platform we just dropped through; ignored until dropTimer runs out. */
  private droppingThrough: Platform | null = null;
  private dropTimer = 0;
  /** True while being launched back up out of a pit (ignores jump-cut until the apex). */
  private pitBounce = false;

  /** Horizontal movement limits. The fight scene moves minX to lock the player into the arena. */
  minX = 0;
  maxX = GAME_WIDTH;

  constructor(
    private input: Input,
    private bullets: BulletPool,
    private terrain?: Terrain,
    private fx?: Effects,
  ) {
    super();
    this.sprite = new AnimatedSprite({ textures: anim("player", "Idle"), updateAnchor: true });
    this.sprite.scale.set(PLAYER.spriteScale);
    this.addChild(this.sprite);
    if (DEBUG_HITBOXES) this.addChild(this.debugBox);
    this.position.set(200, GROUND_Y);
    this.play("Idle");
  }

  /** Place the player on the floor at `x`. */
  spawnAt(x: number): void {
    this.position.set(x, GROUND_Y);
  }

  get bodyHeight(): number {
    return this.crouching ? PLAYER.crouchHeight : PLAYER.height;
  }

  get hitbox(): Rect {
    // Slightly smaller than the sprite feels fairer to the player.
    const w = PLAYER.width * 0.7;
    const h = this.bodyHeight * 0.8;
    return { x: this.x - w / 2, y: this.y - h, w, h };
  }

  /** Bigger box used only to catch parryable bullets. */
  get parryBox(): Rect {
    const w = PLAYER.width * 1.4;
    const h = PLAYER.height * 1.2;
    return { x: this.x - w / 2, y: this.y - h, w, h };
  }

  get isParrying(): boolean {
    return this.parryTimer > 0;
  }

  get isDead(): boolean {
    return this.hp <= 0;
  }

  /** True once the death animation has fully played out. */
  get deathFinished(): boolean {
    return this.isDead && this.deathTime >= PLAYER.deathDuration;
  }

  get isInvulnerable(): boolean {
    return this.invulnTimer > 0 || this.dashTimer > 0;
  }

  get superReady(): boolean {
    return this.meter >= SUPER.max;
  }

  addMeter(amount: number): void {
    this.meter = Math.min(SUPER.max, this.meter + amount);
  }

  takeHit(): void {
    if (this.isInvulnerable || this.isDead) return;
    this.applyDamage();
  }

  /** Lose 1 HP and start i-frames, ignoring current invulnerability. */
  private applyDamage(): void {
    this.hp = Math.max(0, this.hp - 1);
    this.invulnTimer = PLAYER.invulnTime;
    this.hurtTimer = 0.25;
    if (this.isDead) this.startDeath();
    // TODO(audio): hit sound   TODO(fx): screen shake
  }

  /** Called by the fight scene when a parryable bullet touches the parry box. */
  onParry(): void {
    this.parryTimer = 0;
    this.canParry = true; // allow chaining parries
    this.vy = -PLAYER.parryBounce;
    this.addMeter(SUPER.perParry);
    // TODO(audio): parry sound
  }

  update(dt: number): void {
    if (this.isDead) {
      this.updateDeath(dt);
      return;
    }
    const input = this.input;
    this.dashTimer = Math.max(0, this.dashTimer - dt);
    this.dashCooldown = Math.max(0, this.dashCooldown - dt);
    this.invulnTimer = Math.max(0, this.invulnTimer - dt);
    this.fireTimer = Math.max(0, this.fireTimer - dt);
    this.parryTimer = Math.max(0, this.parryTimer - dt);
    this.hurtTimer = Math.max(0, this.hurtTimer - dt);
    this.landTimer = Math.max(0, this.landTimer - dt);

    const ax = input.axisX();
    if (ax !== 0) this.facing = ax > 0 ? 1 : -1;
    const locked = input.isDown("lock");

    // --- Drop through a one-way platform: press Down while standing on one ---
    if (this.standingOn && input.wasPressed("down") && this.dashTimer === 0) {
      this.droppingThrough = this.standingOn;
      this.dropTimer = PLAYER.dropThroughTime;
      this.standingOn = null;
      this.onGround = false;
      this.y += 2; // nudge below the surface so we don't re-land this frame
    }

    // --- Crouch: only on the real floor (on platforms, Down drops through instead) ---
    this.crouching = this.onGround && !this.standingOn && this.dashTimer === 0 && !locked && input.isDown("down");

    // --- Dash ---
    if (input.wasPressed("dash") && this.dashCooldown === 0) {
      this.dashTimer = PLAYER.dashDuration;
      this.dashCooldown = PLAYER.dashCooldown;
      this.crouching = false;
      this.fx?.spawn("fx", "Smoke", this.x - this.facing * 30, this.y - 20, { scale: 0.6 });
    }

    if (this.dashTimer > 0) {
      this.vx = this.facing * PLAYER.dashSpeed;
      if (!this.pitBounce) this.vy = 0; // dash hangs in the air (but doesn't cancel a pit launch)
    } else {
      this.vx = locked || this.crouching ? 0 : ax * PLAYER.speed;

      if (input.wasPressed("jump")) {
        if (this.onGround) {
          // --- Jump (variable height: release early to cut it short) ---
          this.vy = -PLAYER.jumpVelocity;
          this.onGround = false;
          this.standingOn = null;
          this.crouching = false;
        } else if (this.canParry) {
          // --- Parry: second jump press in mid-air ---
          this.parryTimer = PLAYER.parryWindow;
          this.canParry = false;
        }
      }
      if (this.pitBounce && this.vy >= 0) this.pitBounce = false;
      if (!input.isDown("jump") && this.vy < 0 && !this.isParrying && !this.pitBounce) this.vy *= 0.5;

      this.vy = Math.min(this.vy + PLAYER.gravity * dt, PLAYER.maxFallSpeed);
    }

    // --- Integrate ---
    const prevX = this.x;
    const prevY = this.y;
    const wasOnGround = this.onGround;
    const fallSpeed = this.vy;
    if (this.standingOn) this.x += this.standingOn.deltaX; // ride moving platforms
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    const half = PLAYER.width / 2;
    this.x = Math.max(this.minX + half, Math.min(this.maxX - half, this.x));

    const footHalf = PLAYER.width * 0.35;
    const terrain = this.terrain;

    // Inside a pit: the pit walls are solid, don't slide into the floor from the side.
    if (this.y > GROUND_Y + 2 && terrain?.floorUnder(this.x, footHalf)) this.x = prevX;

    this.dropTimer = Math.max(0, this.dropTimer - dt);
    if (this.dropTimer === 0) this.droppingThrough = null;

    // Walked off the edge of a platform, or off the floor into a pit?
    if (this.standingOn && !this.standingOn.spans(this.x, footHalf)) {
      this.standingOn = null;
      this.onGround = false;
    }
    const floorHere = !terrain || terrain.floorUnder(this.x, footHalf);
    if (this.onGround && !this.standingOn && !floorHere) this.onGround = false;

    if (this.standingOn) {
      this.y = this.standingOn.top;
      this.vy = 0;
    } else if (this.y >= GROUND_Y && prevY <= GROUND_Y + 2 && floorHere) {
      this.land(GROUND_Y, null);
    } else if (this.vy >= 0) {
      // One-way platforms: only land when moving down and our feet crossed the top this frame.
      for (const p of terrain?.platforms ?? []) {
        if (p === this.droppingThrough) continue;
        if (prevY <= p.top - p.deltaY + 2 && this.y >= p.top && p.spans(this.x, footHalf)) {
          this.land(p.top, p);
          break;
        }
      }
    }

    if (this.onGround) this.pitBounce = false;
    if (this.y > GAME_HEIGHT + PLAYER.height && this.vy > 0) this.fellInPit();
    if (!wasOnGround && this.onGround && fallSpeed > 300) {
      this.landTimer = 0.15;
      this.fx?.spawn("fx", "Smoke", this.x, this.y - 12, { scale: 0.5, fps: 20 });
    }

    // --- Special ---
    if (input.wasPressed("special") && this.superReady && this.dashTimer === 0) {
      this.fireSpecial();
    }

    // --- Shoot ---
    if (input.isDown("shoot") && this.fireTimer === 0 && this.dashTimer === 0) {
      this.fireTimer = 1 / PLAYER.fireRate;
      this.shoot();
    }

    this.updateVisuals();
  }

  // ---------------------------------------------------------------- visuals

  private play(name: AnimName): void {
    if (this.currentAnim === name) return;
    this.currentAnim = name;
    const cfg = ANIMS[name];
    this.sprite.textures = anim("player", name);
    this.sprite.animationSpeed = cfg.fps / 60;
    this.sprite.loop = cfg.loop;
    this.sprite.gotoAndPlay(0);
  }

  /** Pick the animation that matches the current state. Order = priority. */
  private updateVisuals(): void {
    const shooting = this.input.isDown("shoot");
    if (this.dashTimer > 0) this.play("Dash");
    else if (this.hurtTimer > 0) this.play("Hurt");
    else if (!this.onGround) this.play(this.vy < 0 && !this.isParrying ? "JumpRise" : "JumpFall");
    else if (this.crouching) this.play("Crouch");
    else if (this.vx !== 0) this.play("Run");
    else if (this.landTimer > 0) this.play("Land");
    else if (shooting) this.play("Shoot");
    else this.play("Idle");

    // TODO(art): dedicated parry frames. For now: tint during the parry window.
    this.sprite.tint = this.isParrying ? COLORS.parryable : 0xffffff;
    this.alpha = this.invulnTimer > 0 && Math.floor(this.invulnTimer * 20) % 2 === 0 ? 0.35 : 1;
    this.scale.x = this.facing;

    if (DEBUG_HITBOXES) {
      // Hitbox is symmetric around x, so local space is the same for both facings.
      const h = this.hitbox;
      this.debugBox.clear().rect(-h.w / 2, -h.h, h.w, h.h).stroke({ color: 0x00ff00, width: 2 });
    }
  }

  // ---------------------------------------------------------------- death

  private startDeath(): void {
    this.deathTime = 0;
    this.dashTimer = 0;
    this.parryTimer = 0;
    this.crouching = false;
    this.standingOn = null; // the body falls through platforms to the floor
    this.invulnTimer = 0;
    this.alpha = 1;
    this.sprite.tint = 0xffffff;
    // Knocked up and backwards.
    this.vx = -this.facing * 220;
    this.vy = -700;
    this.onGround = false;
    this.play("Death");
    // TODO(audio): death sound
  }

  /** Knocked back -> falls and lies on the floor -> ghost floats up and fades out. */
  private updateDeath(dt: number): void {
    this.deathTime += dt;
    const ghostStart = PLAYER.deathDuration * 0.55;

    if (this.deathTime < ghostStart) {
      this.vy = Math.min(this.vy + PLAYER.gravity * dt, PLAYER.maxFallSpeed);
      this.x += this.vx * dt;
      this.y += this.vy * dt;
      const half = PLAYER.width / 2;
      this.x = Math.max(this.minX + half, Math.min(this.maxX - half, this.x));
      if (this.y >= GROUND_Y) {
        this.y = GROUND_Y;
        this.vy = 0;
        this.vx *= 0.8;
      }
    } else {
      this.play("Ghost");
      const p = Math.min((this.deathTime - ghostStart) / (PLAYER.deathDuration - ghostStart), 1);
      this.y -= 90 * dt;
      this.alpha = 1 - p;
    }
  }

  /**
   * Lose 1 HP and get launched back up out of the pit, keeping horizontal momentum
   * (no teleport). Pits always hurt, even mid-dash or right after another hit.
   */
  private fellInPit(): void {
    // Launch high enough to peak PLAYER.pitBounceHeight px above the floor, so the player can steer onto a ledge.
    const rise = this.y - (GROUND_Y - PLAYER.pitBounceHeight);
    this.vy = -Math.sqrt(2 * PLAYER.gravity * rise);
    this.pitBounce = true;
    this.standingOn = null;
    this.onGround = false;
    this.canParry = true;
    this.parryTimer = 0;
    this.applyDamage();
    // TODO(audio): fall sound
  }

  // ---------------------------------------------------------------- landing / shooting

  private land(y: number, platform: Platform | null): void {
    this.y = y;
    this.vy = 0;
    this.onGround = true;
    this.standingOn = platform;
    this.canParry = true;
    this.parryTimer = 0;
  }

  /** Where bullets come out, roughly at the throwing hand. */
  private muzzle(): { x: number; y: number } {
    return { x: this.x + this.facing * PLAYER.width * 0.6, y: this.y - this.bodyHeight * 0.6 };
  }

  private aimDirection(): { dx: number; dy: number } {
    let dx = this.input.axisX();
    let dy = this.input.axisY();
    if (this.crouching) {
      dx = this.facing; // crouch always shoots straight ahead, low
      dy = 0;
    }
    if (dy > 0 && this.onGround) dy = 0; // can't shoot into the floor
    if (dx === 0 && dy === 0) dx = this.facing;
    const len = Math.hypot(dx, dy);
    return { dx: dx / len, dy: dy / len };
  }

  private shoot(): void {
    const { x, y } = this.muzzle();
    const { dx, dy } = this.aimDirection();
    this.bullets.spawn(x, y, dx * BULLET.speed, dy * BULLET.speed, { sprite: { sheet: "fx", anim: "Card", scale: 0.55 } });
    // TODO(audio): shoot sound
  }

  private fireSpecial(): void {
    this.meter = 0;
    this.invulnTimer = Math.max(this.invulnTimer, SUPER.invulnTime);
    this.fx?.spawn("super", "SuperCircle", this.x, this.y, { scale: 0.9, fps: 14 });
    const { x, y } = this.muzzle();
    const { dx, dy } = this.aimDirection();
    this.bullets.spawn(x, y, dx * SUPER.speed, dy * SUPER.speed, {
      radius: SUPER.radius,
      damage: SUPER.damage,
      piercing: true,
      sprite: { sheet: "super", anim: "Vortex", scale: 1.1, spin: 14 },
    });
    // TODO(fx): screen flash   TODO(audio): special sound
  }
}
