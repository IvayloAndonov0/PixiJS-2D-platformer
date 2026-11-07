import { Text } from "pixi.js";
import { COLORS, GAME_HEIGHT, GAME_WIDTH } from "../config";
import type { Game } from "../core/Game";
import { Scene } from "../core/Scene";
import { BossFightScene } from "./BossFightScene";
import { TitleScene } from "./TitleScene";

/** Win / lose screen. TODO(ui): grade (A/B/C), stats, nicer layout. */
export class ResultScene extends Scene {
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
      text: `${this.won ? "KNOCKOUT!" : "YOU DIED"}\n\nTime: ${this.time.toFixed(1)}s\n\nEnter: retry    Esc: title`,
      style: { fill: COLORS.text, fontSize: 48, align: "center", fontWeight: "bold" },
    });
    text.anchor.set(0.5);
    text.position.set(GAME_WIDTH / 2, GAME_HEIGHT / 2);
    this.addChild(text);
  }

  update(): void {
    const input = this.game.input;
    if (input.menuPressed("confirm")) this.game.changeScene(new BossFightScene(this.game, this.bossIndex));
    else if (input.menuPressed("back")) this.game.changeScene(new TitleScene(this.game));
  }
}
