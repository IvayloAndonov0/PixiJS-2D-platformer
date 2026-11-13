import { Container, Graphics, Text } from "pixi.js";
import { COLORS, GAME_WIDTH, SUPER } from "../config";
import type { Input } from "../core/Input";
import { itemById } from "../core/Upgrades";
import type { Player } from "../entities/Player";
import type { Boss } from "../entities/bosses/Boss";

/** Player HP + super meter + weapon (bottom-left) and boss health bar (top). */
export class HUD extends Container {
  private hpText = new Text({ text: "", style: { fill: COLORS.text, fontSize: 28, fontWeight: "bold" } });
  private superBar = new Graphics();
  private superText = new Text({ text: "", style: { fill: COLORS.text, fontSize: 16, fontWeight: "bold" } });
  private weaponText = new Text({ text: "", style: { fill: COLORS.text, fontSize: 18, fontWeight: "bold" } });
  private bossBar = new Graphics();
  private bossName = new Text({ text: "", style: { fill: COLORS.text, fontSize: 20 } });
  private time = 0;
  /** Hidden during the parkour, shown once the arena locks. */
  showBoss = true;

  constructor(
    private player: Player,
    private boss: Boss,
    private input: Input,
  ) {
    super();
    this.hpText.position.set(24, 666);
    this.superText.position.set(150, 652);
    this.bossName.position.set(GAME_WIDTH / 2, 12);
    this.bossName.anchor.set(0.5, 0);
    this.weaponText.position.set(400, 672);
    this.addChild(this.hpText, this.superBar, this.superText, this.weaponText, this.bossBar, this.bossName);
  }

  update(dt: number): void {
    this.time += dt;
    this.hpText.text = `HP ${Math.max(0, this.player.hp)}/${this.player.maxHp}`;
    const weapon = itemById(this.player.weapon).name;
    this.weaponText.text = this.player.hasSecondWeapon
      ? `${weapon}  (${this.input.labelFor("swap")}: switch)`
      : weapon;
    this.bossName.text = `${this.boss.displayName} — ${this.boss.phase.name}`;
    this.bossBar.visible = this.bossName.visible = this.showBoss;

    // --- Boss health ---
    const bw = 600;
    const bx = (GAME_WIDTH - bw) / 2;
    this.bossBar
      .clear()
      .rect(bx, 42, bw, 14)
      .fill(0x000000)
      .rect(bx, 42, bw * (this.boss.hp / this.boss.maxHp), 14)
      .fill(COLORS.bossBar);

    // --- Super meter: pulses when full ---
    const sw = 220;
    const sx = 150;
    const sy = 674;
    const ready = this.player.superReady;
    this.superBar
      .clear()
      .rect(sx - 2, sy - 2, sw + 4, 22)
      .fill(0x000000)
      .rect(sx, sy, sw * (this.player.meter / SUPER.max), 18)
      .fill(ready ? COLORS.superBarFull : COLORS.superBar);
    this.superBar.alpha = ready ? 0.75 + 0.25 * Math.sin(this.time * 10) : 1;
    this.superText.text = ready ? `SUPER READY! (${this.input.labelFor("special")})` : "SUPER";
  }
}
