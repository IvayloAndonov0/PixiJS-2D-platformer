import { SFX, stopSfx } from "../audio";
import { Container, Graphics, Text } from "pixi.js";
import { BOSSES } from "../bosses";
import { COLORS, GAME_HEIGHT, GAME_WIDTH } from "../config";
import type { Game } from "../core/Game";
import { type FightResult, type ScoreLine, formatTime, gradeOf, recordResult, scoreBreakdown, scoreOf } from "../core/Progress";
import { Scene } from "../core/Scene";
import { MenuList } from "../ui/MenuList";
import { BossFightScene } from "./BossFightScene";
import { MapScene } from "./MapScene";

// Rating tally timing (seconds)
const FIRST_ROW = 0.5;
const ROW_GAP = 0.5;
const COUNT_TIME = 0.35;
const STAMP_TIME = 0.25;

// Score panel layout
const PANEL_X = 170;
const PANEL_W = 600;
const ROW_Y = 170;
const ROW_H = 58;

interface Row {
  line: ScoreLine;
  view: Container;
  points: Text;
  bar: Graphics;
  /** When this row appears (seconds since the screen opened). */
  at: number;
}

/**
 * Win: rating screen. Each category tallies up one at a time, then the grade stamps in.
 * Enter / click skips the tally. Loss: how much of the boss's health was taken.
 * Saves the attempt either way.
 */
export class ResultScene extends Scene {
  private menu!: MenuList;
  private hint!: Text;
  private time = 0;
  private done = false;

  private rows: Row[] = [];
  private total?: { text: Text; at: number; value: number };
  private stamp?: { view: Container; at: number };
  private newBest?: Text;

  constructor(
    game: Game,
    private bossIndex: number,
    private result: FightResult,
  ) {
    super(game);
  }

  /** Any key / click on this screen cuts the death sound short. */
  private stopDeathSound = () => stopSfx(SFX.death);

  override enter(): void {
    window.addEventListener("keydown", this.stopDeathSound);
    window.addEventListener("pointerdown", this.stopDeathSound);
    const r = this.result;
    const improved = recordResult(BOSSES[this.bossIndex].name, r);

    this.menu = new MenuList([
      { label: "Retry", onSelect: () => this.retry() },
      { label: "Back to map", onSelect: () => this.toMap() },
    ]);
    this.hint = new Text({ text: "Enter / Click: select    Esc: map", style: { fill: COLORS.text, fontSize: 18 } });
    this.hint.anchor.set(0.5, 1);
    this.hint.position.set(GAME_WIDTH / 2, GAME_HEIGHT - 14);

    if (r.won) this.buildRating(improved);
    else this.buildLoss(improved);
    this.addChild(this.menu, this.hint);
    this.setDone(!r.won);
  }

  override exit(): void {
    window.removeEventListener("keydown", this.stopDeathSound);
    window.removeEventListener("pointerdown", this.stopDeathSound);
    stopSfx(SFX.death);
  }

  update(dt: number): void {
    const input = this.game.input;
    if (!this.done) {
      this.time += dt;
      if (input.menuPressed("confirm") || input.menuPressed("back")) this.time = Infinity; // skip the tally
      this.animate();
      return;
    }
    if (input.menuPressed("back")) return this.toMap();
    this.menu.update(input);
  }

  // ---------------------------------------------------------------- win: rating

  private buildRating(improved: boolean): void {
    const r = this.result;
    // Click anywhere to skip the tally.
    const skip = new Graphics().rect(0, 0, GAME_WIDTH, GAME_HEIGHT).fill({ color: 0x000000, alpha: 0 });
    skip.eventMode = "static";
    skip.on("pointertap", () => !this.done && (this.time = Infinity));
    this.addChild(skip);

    const heading = new Text({ text: "KNOCKOUT!", style: { fill: COLORS.text, fontSize: 64, fontWeight: "bold" } });
    heading.anchor.set(0.5);
    heading.position.set(GAME_WIDTH / 2, 70);
    const sub = new Text({ text: "RATING", style: { fill: COLORS.superBarFull, fontSize: 22, fontWeight: "bold", letterSpacing: 6 } });
    sub.anchor.set(0.5);
    sub.position.set(GAME_WIDTH / 2, 120);

    const panel = new Graphics()
      .roundRect(PANEL_X - 24, ROW_Y - 18, PANEL_W + 48, ROW_H * 5 + 40, 16)
      .fill({ color: 0x000000, alpha: 0.3 })
      .stroke({ color: 0x6d5a45, width: 2 });
    this.addChild(panel, heading, sub);

    scoreBreakdown(r).forEach((line, i) => {
      const y = ROW_Y + i * ROW_H;
      const view = new Container();
      view.position.set(PANEL_X, y);
      const label = new Text({ text: line.label, style: { fill: COLORS.text, fontSize: 26, fontWeight: "bold" } });
      const value = new Text({ text: line.value, style: { fill: COLORS.text, fontSize: 22 } });
      value.position.set(170, 3);
      const bar = new Graphics();
      bar.position.set(330, 12);
      const points = new Text({ text: "", style: { fill: COLORS.superBarFull, fontSize: 24, fontWeight: "bold" } });
      points.anchor.set(1, 0);
      points.position.set(PANEL_W, 1);
      view.addChild(label, value, bar, points);
      view.visible = false;
      this.addChild(view);
      this.rows.push({ line, view, points, bar, at: FIRST_ROW + i * ROW_GAP });
    });

    const totalY = ROW_Y + this.rows.length * ROW_H + 6;
    const divider = new Graphics().rect(PANEL_X, totalY - 10, PANEL_W, 2).fill(0x6d5a45);
    const totalLabel = new Text({ text: "Total", style: { fill: COLORS.text, fontSize: 28, fontWeight: "bold" } });
    totalLabel.position.set(PANEL_X, totalY);
    const totalText = new Text({ text: "", style: { fill: COLORS.superBarFull, fontSize: 28, fontWeight: "bold" } });
    totalText.anchor.set(1, 0);
    totalText.position.set(PANEL_X + PANEL_W, totalY);
    const totalView = new Container();
    totalView.addChild(divider, totalLabel, totalText);
    totalView.visible = false;
    this.addChild(totalView);
    const totalAt = FIRST_ROW + this.rows.length * ROW_GAP;
    this.total = { text: totalText, at: totalAt, value: scoreOf(r) };
    totalText.visible = false;
    this.rows.push({ line: { label: "", value: "", points: 0, max: 0 }, view: totalView, points: totalText, bar: new Graphics(), at: totalAt });

    // Grade stamp
    const grade = gradeOf(scoreOf(r));
    const stamp = new Container();
    stamp.position.set(1010, 330);
    stamp.addChild(
      new Graphics()
        .circle(0, 0, 120)
        .fill({ color: 0x1b140e, alpha: 0.9 })
        .stroke({ color: COLORS.superBarFull, width: 8 })
        .circle(0, 0, 104)
        .stroke({ color: COLORS.superBarFull, width: 2, alpha: 0.6 }),
    );
    const gradeText = new Text({ text: grade, style: { fill: COLORS.superBarFull, fontSize: 120, fontWeight: "bold" } });
    gradeText.anchor.set(0.5);
    stamp.addChild(gradeText);
    stamp.rotation = -0.12;
    stamp.visible = false;
    this.addChild(stamp);
    this.stamp = { view: stamp, at: totalAt + 0.9 };

    if (improved) {
      this.newBest = new Text({ text: "NEW BEST!", style: { fill: COLORS.parryable, fontSize: 30, fontWeight: "bold" } });
      this.newBest.anchor.set(0.5);
      this.newBest.position.set(1010, 485);
      this.newBest.visible = false;
      this.addChild(this.newBest);
    }

    this.menu.position.set(GAME_WIDTH / 2, 545);
  }

  /** Advance the tally to `this.time`. */
  private animate(): void {
    const t = this.time;
    for (const row of this.rows) {
      if (t < row.at) continue;
      row.view.visible = true;
      const p = Math.min(1, (t - row.at) / COUNT_TIME);
      if (row.points === this.total?.text) {
        const tp = Math.min(1, (t - row.at) / (COUNT_TIME * 2));
        row.points.visible = true;
        row.points.text = `${Math.round(this.total.value * tp)} / 100`;
      } else {
        const { points, max } = row.line;
        row.points.text = `+${Math.round(points * p)}`;
        row.bar
          .clear()
          .roundRect(0, 0, 160, 12, 6)
          .fill({ color: 0x000000, alpha: 0.5 })
          .roundRect(0, 0, max ? (160 * points * p) / max : 0, 12, 6)
          .fill(COLORS.superBarFull);
      }
    }

    const stamp = this.stamp;
    if (stamp && t >= stamp.at) {
      stamp.view.visible = true;
      const p = Math.min(1, (t - stamp.at) / STAMP_TIME);
      stamp.view.scale.set(2.4 - 1.4 * easeOutBack(p));
      stamp.view.alpha = Math.min(1, p * 2);
      if (p >= 1) {
        if (this.newBest) this.newBest.visible = true;
        this.setDone(true);
      }
    }
  }

  // ---------------------------------------------------------------- loss

  private buildLoss(improved: boolean): void {
    const r = this.result;
    const heading = new Text({ text: "YOU DIED", style: { fill: COLORS.text, fontSize: 64, fontWeight: "bold" } });
    heading.anchor.set(0.5);
    heading.position.set(GAME_WIDTH / 2, 110);

    const big = new Text({
      text: `${Math.floor(r.bossDamage * 100)}%`,
      style: { fill: COLORS.superBarFull, fontSize: 96, fontWeight: "bold" },
    });
    big.anchor.set(0.5);
    big.position.set(GAME_WIDTH / 2, 225);

    const stats = new Text({
      text: `of the boss's health taken    Time ${formatTime(r.time)}    Parries ${r.parries}`,
      style: { fill: COLORS.text, fontSize: 22 },
    });
    stats.anchor.set(0.5);
    stats.position.set(GAME_WIDTH / 2, 300);

    const best = new Text({ text: improved ? "NEW BEST!" : "", style: { fill: COLORS.parryable, fontSize: 26, fontWeight: "bold" } });
    best.anchor.set(0.5);
    best.position.set(GAME_WIDTH / 2, 340);

    this.addChild(heading, big, stats, best);
    this.menu.position.set(GAME_WIDTH / 2, 390);
  }

  // ---------------------------------------------------------------- shared

  private setDone(done: boolean): void {
    this.done = done;
    this.menu.visible = done;
    this.hint.text = done ? "Enter / Click: select    Esc: map" : "Enter / Click: skip";
  }

  private retry(): void {
    this.game.changeScene(new BossFightScene(this.game, this.bossIndex));
  }

  private toMap(): void {
    this.game.changeScene(new MapScene(this.game));
  }
}

function easeOutBack(t: number): number {
  const c = 1.70158;
  return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2);
}
