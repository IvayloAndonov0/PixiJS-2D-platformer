import { Text } from "pixi.js";
import { BOSSES } from "../bosses";
import { COLORS, GAME_HEIGHT, GAME_WIDTH } from "../config";
import type { Game } from "../core/Game";
import { type FightResult, formatTime, gradeOf, recordResult, scoreOf } from "../core/Progress";
import { Scene } from "../core/Scene";
import { MenuList } from "../ui/MenuList";
import { BossFightScene } from "./BossFightScene";
import { MapScene } from "./MapScene";

/** Win / lose screen: grade on a win, boss progress on a loss. Saves the attempt. */
export class ResultScene extends Scene {
  private menu!: MenuList;

  constructor(
    game: Game,
    private bossIndex: number,
    private result: FightResult,
  ) {
    super(game);
  }

  override enter(): void {
    const r = this.result;
    const newBest = recordResult(BOSSES[this.bossIndex].name, r);

    const heading = new Text({
      text: r.won ? "KNOCKOUT!" : "YOU DIED",
      style: { fill: COLORS.text, fontSize: 64, fontWeight: "bold" },
    });
    heading.anchor.set(0.5);
    heading.position.set(GAME_WIDTH / 2, 110);

    const big = new Text({
      text: r.won ? gradeOf(scoreOf(r)) : `${Math.floor(r.bossDamage * 100)}%`,
      style: { fill: COLORS.superBarFull, fontSize: 96, fontWeight: "bold" },
    });
    big.anchor.set(0.5);
    big.position.set(GAME_WIDTH / 2, 225);

    const statsText = r.won
      ? `Time ${formatTime(r.time)}  (par ${formatTime(r.parTime)})    HP ${r.hpLeft}/${r.maxHp}    Parries ${r.parries}`
      : `of the boss's health taken    Time ${formatTime(r.time)}    Parries ${r.parries}`;
    const stats = new Text({ text: statsText, style: { fill: COLORS.text, fontSize: 22 } });
    stats.anchor.set(0.5);
    stats.position.set(GAME_WIDTH / 2, 300);

    const best = new Text({ text: newBest ? "NEW BEST!" : "", style: { fill: COLORS.parryable, fontSize: 26, fontWeight: "bold" } });
    best.anchor.set(0.5);
    best.position.set(GAME_WIDTH / 2, 340);

    this.menu = new MenuList([
      { label: "Retry", onSelect: () => this.retry() },
      { label: "Back to map", onSelect: () => this.toMap() },
    ]);
    this.menu.position.set(GAME_WIDTH / 2, 390);

    const hint = new Text({ text: "Enter / Click: select    Esc: map", style: { fill: COLORS.text, fontSize: 18 } });
    hint.anchor.set(0.5, 0);
    hint.position.set(GAME_WIDTH / 2, Math.min(GAME_HEIGHT - 40, this.menu.y + this.menu.height + 20));
    this.addChild(heading, big, stats, best, this.menu, hint);
  }

  update(): void {
    if (this.game.input.menuPressed("back")) return this.toMap();
    this.menu.update(this.game.input);
  }

  private retry(): void {
    this.game.changeScene(new BossFightScene(this.game, this.bossIndex));
  }

  private toMap(): void {
    this.game.changeScene(new MapScene(this.game));
  }
}
