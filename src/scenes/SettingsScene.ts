import { Container, Graphics, Text } from "pixi.js";
import { COLORS, GAME_HEIGHT, GAME_WIDTH } from "../config";
import { ACTION_LABELS, ACTIONS, SLOTS, codeLabel } from "../core/Input";
import { Scene } from "../core/Scene";
import { TitleScene } from "./TitleScene";

const ROW_H = 44;
const TOP = 130;
const LABEL_X = 260;
const SLOT_X = [620, 880];
const SLOT_W = 230;

/**
 * Key-binding settings.
 * Keyboard: arrows to move, Enter to rebind, Backspace to clear, Esc to go back.
 * Mouse: click a slot to rebind it, click the buttons at the bottom.
 * Rebinding accepts any key or mouse button; Esc cancels.
 */
export class SettingsScene extends Scene {
  private row = 0; // 0..ACTIONS.length-1 = actions, ACTIONS.length = "Reset", +1 = "Back"
  private col = 0;
  private capturing = false;
  /** Rebind requested by a mouse click; armed next frame so that click isn't captured as the binding. */
  private pendingCapture?: { row: number; col: number };

  private cells: { bg: Graphics; text: Text }[][] = [];
  private resetBtn = this.makeButton("Reset to defaults", GAME_WIDTH / 2 - 160);
  private backBtn = this.makeButton("Back", GAME_WIDTH / 2 + 160);
  private hint = new Text({ text: "", style: { fill: COLORS.text, fontSize: 18, align: "center" } });

  private get rowCount(): number {
    return ACTIONS.length + 2;
  }

  override enter(): void {
    const title = new Text({ text: "CONTROLS", style: { fill: COLORS.text, fontSize: 48, fontWeight: "bold" } });
    title.anchor.set(0.5, 0);
    title.position.set(GAME_WIDTH / 2, 30);
    this.addChild(title);

    for (let s = 0; s < SLOTS; s++) {
      const h = new Text({ text: s === 0 ? "Primary" : "Secondary", style: { fill: COLORS.text, fontSize: 18 } });
      h.anchor.set(0.5, 1);
      h.position.set(SLOT_X[s] + SLOT_W / 2, TOP - 6);
      this.addChild(h);
    }

    ACTIONS.forEach((action, r) => {
      const y = TOP + r * ROW_H;
      const label = new Text({ text: ACTION_LABELS[action], style: { fill: COLORS.text, fontSize: 22 } });
      label.position.set(LABEL_X, y + 8);
      this.addChild(label);

      const rowCells: { bg: Graphics; text: Text }[] = [];
      for (let c = 0; c < SLOTS; c++) {
        const cell = new Container();
        cell.position.set(SLOT_X[c], y);
        const bg = new Graphics();
        const text = new Text({ text: "", style: { fill: COLORS.text, fontSize: 20 } });
        text.anchor.set(0.5);
        text.position.set(SLOT_W / 2, ROW_H / 2 - 2);
        cell.addChild(bg, text);
        cell.eventMode = "static";
        cell.cursor = "pointer";
        cell.on("pointertap", () => {
          if (this.capturing) return;
          this.row = r;
          this.col = c;
          this.pendingCapture = { row: r, col: c };
        });
        this.addChild(cell);
        rowCells.push({ bg, text });
      }
      this.cells.push(rowCells);
    });

    this.resetBtn.container.on("pointertap", () => !this.capturing && this.game.input.resetToDefaults());
    this.backBtn.container.on("pointertap", () => !this.capturing && this.goBack());

    this.hint.anchor.set(0.5, 1);
    this.hint.position.set(GAME_WIDTH / 2, GAME_HEIGHT - 16);
    this.addChild(this.hint);
  }

  update(): void {
    const input = this.game.input;

    if (this.pendingCapture) {
      const { row, col } = this.pendingCapture;
      this.pendingCapture = undefined;
      this.startCapture(row, col);
    } else if (!this.capturing) {
      if (input.menuPressed("up")) this.row = (this.row - 1 + this.rowCount) % this.rowCount;
      if (input.menuPressed("down")) this.row = (this.row + 1) % this.rowCount;
      if (input.menuPressed("left")) this.col = (this.col - 1 + SLOTS) % SLOTS;
      if (input.menuPressed("right")) this.col = (this.col + 1) % SLOTS;

      if (input.menuPressed("back")) return this.goBack();

      if (this.row < ACTIONS.length) {
        if (input.menuPressed("confirm")) this.startCapture(this.row, this.col);
        else if (input.menuPressed("clear")) input.bind(ACTIONS[this.row], this.col, null);
      } else if (input.menuPressed("confirm")) {
        if (this.row === ACTIONS.length) input.resetToDefaults();
        else return this.goBack();
      }
    }

    this.redraw();
  }

  private startCapture(row: number, col: number): void {
    this.capturing = true;
    this.game.input.captureNext((code) => {
      this.capturing = false;
      if (code !== null) this.game.input.bind(ACTIONS[row], col, code);
    });
  }

  private goBack(): void {
    this.game.changeScene(new TitleScene(this.game));
  }

  private redraw(): void {
    const bindings = this.game.input.bindings;
    ACTIONS.forEach((action, r) => {
      for (let c = 0; c < SLOTS; c++) {
        const { bg, text } = this.cells[r][c];
        const selected = r === this.row && c === this.col;
        const waiting = selected && this.capturing;
        bg.clear()
          .roundRect(0, 2, SLOT_W, ROW_H - 6, 8)
          .fill({ color: waiting ? COLORS.superBarFull : 0x000000, alpha: waiting ? 1 : 0.35 })
          .stroke({ color: selected ? COLORS.superBarFull : 0x6d5a45, width: selected ? 3 : 1 });
        text.text = waiting ? "Press a key / button…" : codeLabel(bindings[action][c]);
        text.style.fill = waiting ? 0x000000 : COLORS.text;
      }
    });

    this.resetBtn.draw(this.row === ACTIONS.length);
    this.backBtn.draw(this.row === ACTIONS.length + 1);

    this.hint.text = this.capturing
      ? "Press any key or mouse button to bind it.  Esc to cancel."
      : "Arrows: select   Enter / Click: rebind   Backspace: clear slot   Esc: back\n" +
        "Binding a key that's already used moves it to this action.";
  }

  private makeButton(label: string, centerX: number) {
    const container = new Container();
    container.position.set(centerX - 140, TOP + ACTIONS.length * ROW_H + 24);
    container.eventMode = "static";
    container.cursor = "pointer";
    const bg = new Graphics();
    const text = new Text({ text: label, style: { fill: COLORS.text, fontSize: 22 } });
    text.anchor.set(0.5);
    text.position.set(140, 22);
    container.addChild(bg, text);
    this.addChild(container);
    return {
      container,
      draw: (selected: boolean) =>
        bg
          .clear()
          .roundRect(0, 0, 280, 44, 10)
          .fill({ color: 0x000000, alpha: 0.35 })
          .stroke({ color: selected ? COLORS.superBarFull : 0x6d5a45, width: selected ? 3 : 1 }),
    };
  }
}
