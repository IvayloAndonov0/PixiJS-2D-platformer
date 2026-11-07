import { Text } from "pixi.js";
import { COLORS, GAME_HEIGHT, GAME_WIDTH } from "../config";
import { Scene } from "../core/Scene";
import { MenuList } from "../ui/MenuList";
import { FileSelectScene } from "./FileSelectScene";
import { SettingsScene } from "./SettingsScene";

/** Title: Play (-> file select -> overworld map) and Settings. TODO(ui): real logo, menu art, music. */
export class TitleScene extends Scene {
  private menu!: MenuList;
  private controls = new Text({ text: "", style: { fill: COLORS.text, fontSize: 18, align: "center" } });

  override enter(): void {
    const title = new Text({
      text: "UNTITLED BOSS RUSH",
      style: { fill: COLORS.text, fontSize: 72, fontWeight: "bold" },
    });
    title.anchor.set(0.5);
    title.position.set(GAME_WIDTH / 2, 180);

    this.controls.anchor.set(0.5);
    this.controls.position.set(GAME_WIDTH / 2, GAME_HEIGHT - 60);

    this.menu = new MenuList([
      { label: "Play", onSelect: () => this.game.changeScene(new FileSelectScene(this.game)) },
      { label: "Settings", onSelect: () => this.game.changeScene(new SettingsScene(this.game)) },
    ]);
    this.menu.position.set(GAME_WIDTH / 2, 300);

    const hint = new Text({ text: "Enter / Click to select", style: { fill: COLORS.text, fontSize: 18 } });
    hint.anchor.set(0.5, 0);
    hint.position.set(GAME_WIDTH / 2, this.menu.y + this.menu.height + 20);
    this.addChild(title, this.menu, hint, this.controls);

    // Show the player's actual (possibly rebound) controls.
    const k = (a: Parameters<typeof this.game.input.labelFor>[0]) => this.game.input.labelFor(a);
    this.controls.text =
      `Move: ${k("left")} | ${k("right")}   Crouch: ${k("down")}   Jump: ${k("jump")}   Parry: jump again in mid-air (green shots)\n` +
      `Shoot: ${k("shoot")}   Dash: ${k("dash")}   Lock aim: ${k("lock")}   Super: ${k("special")} (when the meter is full)`;
  }

  update(): void {
    this.menu.update(this.game.input);
  }
}
