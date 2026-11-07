import { Text } from "pixi.js";
import { COLORS, GAME_HEIGHT, GAME_WIDTH } from "../config";
import type { Game } from "../core/Game";
import { Scene } from "../core/Scene";
import { MenuList } from "../ui/MenuList";
import { BossFightScene } from "./BossFightScene";
import { TitleScene } from "./TitleScene";

/** Win / lose screen. TODO(ui): grade (A/B/C), stats, nicer layout. */
export class ResultScene extends Scene {
  private menu!: MenuList;

  constructor(
    game: Game,
    private won: boolean,
    private time: number,
    private bossIndex: number,
  ) {
    super(game);
  }

  override enter(): void {
    const text = new Text({
      text: `${this.won ? "KNOCKOUT!" : "YOU DIED"}\n\nTime: ${this.time.toFixed(1)}s`,
      style: { fill: COLORS.text, fontSize: 48, align: "center", fontWeight: "bold" },
    });
    text.anchor.set(0.5);
    text.position.set(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 110);

    this.menu = new MenuList([
      { label: "Retry", onSelect: () => this.retry() },
      { label: "Title", onSelect: () => this.toTitle() },
    ]);
    this.menu.position.set(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 30);

    const hint = new Text({ text: "Enter / Click: select    Esc: title", style: { fill: COLORS.text, fontSize: 18 } });
    hint.anchor.set(0.5, 0);
    hint.position.set(GAME_WIDTH / 2, this.menu.y + this.menu.height + 20);
    this.addChild(text, this.menu, hint);
  }

  update(): void {
    if (this.game.input.menuPressed("back")) return this.toTitle();
    this.menu.update(this.game.input);
  }

  private retry(): void {
    this.game.changeScene(new BossFightScene(this.game, this.bossIndex));
  }

  private toTitle(): void {
    this.game.changeScene(new TitleScene(this.game));
  }
}
