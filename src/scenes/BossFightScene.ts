import { Container, Graphics, Text } from "pixi.js";
import { playMusic, stopMusic } from "../audio";
import { BOSSES } from "../bosses";
import { COLORS, GAME_HEIGHT, GAME_WIDTH, GROUND_Y, PLAYER, SUPER } from "../config";
import type { Game } from "../core/Game";
import { Scene } from "../core/Scene";
import { Player } from "../entities/Player";
import type { Boss } from "../entities/bosses/Boss";
import { Background, GROUND_COLORS } from "../level/Background";
import { Terrain } from "../level/Terrain";
import { BulletPool } from "../systems/BulletPool";
import { Effects } from "../systems/Effects";
import { circleRect, rectsOverlap } from "../systems/collision";
import { HUD } from "../ui/HUD";
import { MenuList } from "../ui/MenuList";
import { loadout } from "../core/Upgrades";
import { ResultScene } from "./ResultScene";
import { MapScene } from "./MapScene";

/** Player x that triggers the arena lock (the arena spans x 0..GAME_WIDTH). */
const ARENA_LOCK_X = 140;
/** Where the camera keeps the player horizontally during parkour (fraction of screen width). */
const CAMERA_LEAD = 0.35;

/**
 * Parkour run (optional) -> boss arena.
 *
 * World layout: the parkour lives at negative x and the arena at 0..GAME_WIDTH, so boss code
 * can keep using plain screen coordinates. The camera follows the player through the parkour.
 * Once the player passes ARENA_LOCK_X a gate slams shut behind them, the camera locks onto the
 * arena, and the boss wakes up.
 */
export class BossFightScene extends Scene {
  private world = new Container();
  private background: Background;
  private playerBullets = new BulletPool("player");
  private bossBullets = new BulletPool("boss");
  private fx = new Effects();
  private terrain: Terrain;
  private player: Player;
  private boss: Boss;
  private hud: HUD;
  private gate = new Graphics();
  private banner: Text;
  private paused = false;
  private pauseOverlay = new Container();
  private pauseMenu!: MenuList;
  private pauseHint!: Text;

  private cameraX = 0;
  private locked = false;
  private gateDrop = 0; // 0..1 animation of the gate falling
  private bannerTimer = 0;
  private elapsed = 0;
  private endTimer = 0;
  /** Successful parries this fight (counts toward the grade). */
  private parries = 0;
  /** Seconds of remaining hit-stop (gameplay frozen). */
  private hitStop = 0;
  /** Full-screen white flash for parries / death. */
  private flash = new Graphics().rect(0, 0, GAME_WIDTH, GAME_HEIGHT).fill(0xffffff);

  constructor(
    game: Game,
    private bossIndex: number,
    /** Skip the parkour and start locked in the arena (dev shortcut). */
    skipIntro = false,
  ) {
    super(game);
    const entry = BOSSES[bossIndex];
    const intro = skipIntro ? undefined : entry.intro;
    const theme = entry.background ?? "hills";
    this.background = new Background(theme);

    this.terrain = new Terrain({
      floor: [...(intro?.floor ?? []), [0, GAME_WIDTH]],
      platforms: [...(intro?.platforms ?? []), ...entry.platforms],
      spikes: intro?.spikes ?? [],
      colors: GROUND_COLORS[theme],
    });

    this.player = new Player(game.input, this.playerBullets, this.terrain, this.fx);
    this.player.equip(loadout()); // shop weapons + charm from the current save file
    this.boss = entry.create(this.bossBullets, this.player);
    this.boss.fx = this.fx;
    this.player.aimTarget = () => {
      if (!this.locked || this.boss.isDead) return undefined; // homing shots fly straight during the parkour
      const h = this.boss.hitbox;
      return { x: h.x + h.w / 2, y: h.y + h.h / 2 };
    };
    this.hud = new HUD(this.player, this.boss, game.input);

    // Signs along the parkour
    const signs = (intro?.signs ?? []).map((s) => {
      const t = new Text({ text: s.text, style: { fill: COLORS.text, fontSize: 22, fontWeight: "bold", align: "center" } });
      t.position.set(s.x, s.y);
      return t;
    });

    // Gate at the arena entrance (drawn closed, animated down when the lock triggers)
    const themeColors = GROUND_COLORS[theme];
    this.gate.rect(-14, 0, 28, GROUND_Y).fill(themeColors.gate ?? COLORS.gate).rect(-14, 0, 28, GROUND_Y).stroke({ color: 0x000000, width: 3 });
    for (let y = 40; y < GROUND_Y; y += 60) this.gate.rect(-14, y, 28, 8).fill(themeColors.gateBand ?? 0x5d4037);
    this.gate.visible = false;

    this.banner = new Text({ text: "FIGHT!", style: { fill: COLORS.text, fontSize: 96, fontWeight: "bold", stroke: { color: 0x000000, width: 8 } } });
    this.banner.anchor.set(0.5);
    this.banner.position.set(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 60);
    this.banner.visible = false;

    this.buildPauseOverlay();
    this.flash.alpha = 0;

    // World draw order: back to front. World scrolls with the camera; the rest is screen-space.
    this.world.addChild(this.terrain, ...signs, this.gate, this.boss, this.player, this.playerBullets, this.bossBullets, this.fx);
    this.addChild(this.background, this.world, this.flash, this.hud, this.banner, this.pauseOverlay);

    if (intro) {
      this.player.spawnAt(intro.start);
      this.player.minX = this.terrain.left;
      this.cameraX = this.cameraTarget();
      this.hud.showBoss = false;
    } else {
      this.player.spawnAt(200);
      this.lockArena(true);
    }
    this.applyCamera();
  }

  override enter(): void {
    // Parkour music until the arena locks (lockArena switches to the boss track). No intro = straight to boss music.
    const music = BOSSES[this.bossIndex].music;
    if (this.locked) this.playBossMusic();
    else if (music?.parkour) playMusic(music.parkour);
    else stopMusic();
  }

  override exit(): void {
    stopMusic();
  }

  private playBossMusic(): void {
    const boss = BOSSES[this.bossIndex].music?.boss;
    if (boss) playMusic(boss);
    else stopMusic();
  }

  update(dt: number): void {
    const input = this.game.input;
    if (input.wasPressed("pause") && this.endTimer === 0) this.setPaused(!this.paused);
    if (this.paused) {
      if (input.menuPressed("clear")) this.quitToMap();
      else this.pauseMenu.update(input);
      return;
    }

    this.fx.tickShake(dt);
    this.position.set(Math.round(this.fx.shakeX), Math.round(this.fx.shakeY));

    // Screen flash fades in real time, even during hit-stop.
    this.flash.alpha = Math.max(0, this.flash.alpha - dt * 4);

    // Hit-stop: freeze all gameplay for a moment (parries, death).
    if (this.hitStop > 0) {
      this.hitStop -= dt;
      return;
    }

    const wasDead = this.player.isDead;
    const over = this.player.isDead || this.boss.isDead;
    if (this.locked && !over) this.elapsed += dt;

    this.terrain.update(dt);
    this.fx.update(dt);
    this.background.tick(dt);
    this.player.update(dt);
    if (this.locked) this.boss.update(dt); // boss sleeps until you enter the arena
    this.playerBullets.update(dt, this.cameraX);
    this.bossBullets.update(dt, this.cameraX);
    this.handleCollisions();
    this.hud.update(dt);

    if (!this.locked && this.player.x >= ARENA_LOCK_X && !this.player.isDead) this.lockArena(false);
    this.updateGateAndBanner(dt);
    this.updateCamera(dt);

    // Freeze on the killing blow so the death reads.
    if (!wasDead && this.player.isDead) this.freeze(PLAYER.deathFreeze, 0.5);

    // Lose: wait for the full death animation. Win: short delay so the final hit reads.
    if (this.player.isDead || this.boss.isDead) {
      this.endTimer += dt;
      const done = this.player.isDead ? this.player.deathFinished : this.endTimer > 1.5;
      if (done) {
        const won = !this.player.isDead;
        this.game.changeScene(
          new ResultScene(this.game, this.bossIndex, {
            won,
            time: this.elapsed,
            hpLeft: this.player.hp,
            maxHp: this.player.maxHp,
            parries: this.parries,
            supers: this.player.supersUsed,
            bossDamage: won ? 1 : 1 - Math.max(0, this.boss.hp) / this.boss.maxHp,
            parTime: BOSSES[this.bossIndex].parTime ?? 90,
          }),
        );
      }
    }
  }

  // ---------------------------------------------------------------- arena lock & camera

  /** Close the gate behind the player and start the fight. */
  private lockArena(instant: boolean): void {
    this.locked = true;
    this.player.minX = 0; // can't go back left of the arena
    this.gate.visible = true;
    this.gateDrop = instant ? 1 : 0;
    this.hud.showBoss = true;
    this.playBossMusic();
    this.background.explodeSun(instant);
    if (!instant) {
      this.bannerTimer = 1.6;
      this.fx.spawn("fx", "Smoke", 0, GROUND_Y - 20, { scale: 1.2 });
      // TODO(audio): gate slam + boss intro sting
    }
  }

  private updateGateAndBanner(dt: number): void {
    if (this.gate.visible && this.gateDrop < 1) {
      this.gateDrop = Math.min(1, this.gateDrop + dt * 4);
      // Slides down from above and lands with a little bounce.
      const t = this.gateDrop;
      const ease = 1 - Math.pow(1 - t, 3);
      this.gate.y = -GROUND_Y * (1 - ease);
    }
    this.bannerTimer = Math.max(0, this.bannerTimer - dt);
    this.banner.visible = this.bannerTimer > 0;
    if (this.banner.visible) {
      const age = 1.6 - this.bannerTimer;
      this.banner.scale.set(age < 0.15 ? 2 - age / 0.15 : 1);
      this.banner.alpha = Math.min(1, this.bannerTimer / 0.3);
    }
  }

  private cameraTarget(): number {
    if (this.locked) return 0;
    const target = this.player.x - GAME_WIDTH * CAMERA_LEAD;
    return Math.max(this.terrain.left, Math.min(0, target));
  }

  private updateCamera(dt: number): void {
    // Smooth follow; a bit faster during parkour so fast moves don't leave the screen.
    const k = Math.min(1, dt * (this.locked ? 4 : 10));
    this.cameraX += (this.cameraTarget() - this.cameraX) * k;
    if (Math.abs(this.cameraX) < 0.5 && this.locked) this.cameraX = 0;
    this.applyCamera();
  }

  private applyCamera(): void {
    this.world.x = -Math.round(this.cameraX);
    this.background.update(this.cameraX);
  }

  /** Freeze gameplay for `seconds` and flash the screen white at `flashAlpha`. */
  private freeze(seconds: number, flashAlpha: number): void {
    this.hitStop = Math.max(this.hitStop, seconds);
    this.flash.alpha = Math.max(this.flash.alpha, flashAlpha);
  }

  // ---------------------------------------------------------------- collisions

  private handleCollisions(): void {
    const playerBox = this.player.hitbox;

    // Spikes
    for (const s of this.terrain.spikes) {
      if (rectsOverlap(playerBox, s)) this.player.takeHit();
    }

    if (!this.locked) return; // boss can't be hurt (or hurt you) before the fight starts
    const bossBox = this.boss.hitbox;

    for (const b of this.playerBullets.bullets) {
      if (b.dead || b.hasHit || !circleRect(b.hitbox, bossBox)) continue;
      this.boss.takeDamage(b.damage);
      if (b.piercing) {
        b.hasHit = true; // special keeps flying but only hits once
      } else {
        b.dead = true;
        this.player.addMeter(SUPER.perHit);
      }
      this.fx.spawn("fx", "Spark", b.x, b.y, { scale: b.piercing ? 1.5 : 0.6, fps: 30 });
    }

    if (this.boss.isDead) return;

    const parryBox = this.player.parryBox;
    for (const b of this.bossBullets.bullets) {
      if (b.dead) continue;
      // Parry check first: parryable bullets touching the parry box while parrying are deflected.
      if (b.parryable && this.player.isParrying && circleRect(b.hitbox, parryBox)) {
        b.dead = true;
        this.player.onParry();
        this.parries++;
        this.freeze(PLAYER.parryFreeze, 0.35);
        this.fx.spawn("fx", "Ring", b.x, b.y, { fps: 12 });
        continue;
      }
      if (circleRect(b.hitbox, playerBox)) {
        if (this.player.isPhasing) continue; // Shadow Dash: bullets pass straight through
        b.dead = true;
        this.player.takeHit();
      }
    }

    // Contact damage
    if (rectsOverlap(playerBox, bossBox)) this.player.takeHit();
  }

  // ---------------------------------------------------------------- pause menu

  private buildPauseOverlay(): void {
    const dim = new Graphics().rect(0, 0, GAME_WIDTH, GAME_HEIGHT).fill({ color: 0x000000, alpha: 0.5 });
    dim.eventMode = "static"; // swallow clicks so they don't reach anything underneath
    const title = new Text({ text: "PAUSED", style: { fill: COLORS.text, fontSize: 64, fontWeight: "bold" } });
    title.anchor.set(0.5);
    title.position.set(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 120);
    this.pauseMenu = new MenuList([
      { label: "Resume", onSelect: () => this.setPaused(false) },
      { label: "Quit to map", onSelect: () => this.quitToMap() },
    ]);
    this.pauseMenu.position.set(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 40);
    this.pauseHint = new Text({ text: "", style: { fill: COLORS.text, fontSize: 18, align: "center" } });
    this.pauseHint.anchor.set(0.5, 0);
    this.pauseHint.position.set(GAME_WIDTH / 2, this.pauseMenu.y + this.pauseMenu.height + 20);
    this.pauseOverlay.addChild(dim, title, this.pauseMenu, this.pauseHint);
    this.pauseOverlay.visible = false;
  }

  private setPaused(paused: boolean): void {
    this.paused = paused;
    this.pauseOverlay.visible = paused;
    if (paused) {
      this.pauseMenu.selected = 0;
      this.pauseHint.text = `Enter / Click: select    ${this.game.input.labelFor("pause")}: resume    Backspace: quit`;
    }
  }

  private quitToMap(): void {
    this.game.changeScene(new MapScene(this.game));
  }
}
