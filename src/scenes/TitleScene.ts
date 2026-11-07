import { Text } from "pixi.js";
import { BOSSES } from "../bosses";
import { COLORS, GAME_HEIGHT, GAME_WIDTH } from "../config";
import { Scene } from "../core/Scene";
import { BossFightScene } from "./BossFightScene";
import { SettingsScene } from "./SettingsScene";

/** Title + boss select + settings. TODO(ui): real logo, menu art, music. */
export class TitleScene extends Scene {
  private selected = 0;
  private menu = new Text({ text: "", style: { fill: COLORS.text, fontSize: 28, align: "center" } });
  private controls = new Text({ text: "", style: { fill: COLORS.text, fontSize: 18, align: "center" } });

  /** Menu entries: one per boss, then Settings. */
  private get items(): string[] {
    return [...BOSSES.map((b) => b.name), "Settings"];
  }

  override enter(): void {
    const title = new Text({
      text: "UNTITLED BOSS RUSH",
      style: { fill: COLORS.text, fontSize: 72, fontWeight: "bold" },
    });
    title.anchor.set(0.5);
    title.position.set(GAME_WIDTH / 2, 180);

    this.controls.anchor.set(0.5);
    this.controls.position.set(GAME_WIDTH / 2, GAME_HEIGHT - 60);

    this.menu.anchor.set(0.5, 0);
    this.menu.position.set(GAME_WIDTH / 2, 320);
    this.addChild(title, this.menu, this.controls);

    // Show the player's actual (possibly rebound) controls.
    const k = (a: Parameters<typeof this.game.input.labelFor>[0]) => this.game.input.labelFor(a);
    this.controls.text =
      `Move: ${k("left")} | ${k("right")}   Crouch: ${k("down")}   Jump: ${k("jump")}   Parry: jump again in mid-air (green shots)\n` +
      `Shoot: ${k("shoot")}   Dash: ${k("dash")}   Lock aim: ${k("lock")}   Super: ${k("special")} (when the meter is full)`;
  }

  update(): void {
    const input = this.game.input;
    const n = this.items.length;
    if (input.menuPressed("up")) this.selected = (this.selected - 1 + n) % n;
    if (input.menuPressed("down")) this.selected = (this.selected + 1) % n;
    if (input.menuPressed("confirm")) {
      if (this.selected < BOSSES.length) this.game.changeScene(new BossFightScene(this.game, this.selected));
      else this.game.changeScene(new SettingsScene(this.game));
    }

    this.menu.text =
      this.items.map((name, i) => (i === this.selected ? `> ${name} <` : name)).join("\n") + "\n\nEnter to select";
  }
}
