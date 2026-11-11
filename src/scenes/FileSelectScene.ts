import { Container, Graphics, Text } from "pixi.js";
import { COLORS, GAME_HEIGHT, GAME_WIDTH } from "../config";
import { SLOT_COUNT, deleteSlot, formatDate, listSlots, openSlot, storyProgress } from "../core/SaveSystem";
import { Scene } from "../core/Scene";
import { MenuList } from "../ui/MenuList";
import { MapScene } from "./MapScene";
import { TitleScene } from "./TitleScene";

const CARD_W = 640;
const CARD_H = 120;
const CARD_GAP = 26;
const CARD_X = GAME_WIDTH / 2 - CARD_W / 2 - 70;
const CARD_Y = 150;
const DEL_W = 120;

interface SlotView {
  card: Container;
  bg: Graphics;
  del: Container;
  delBg: Graphics;
}

/**
 * Choose a save file. Empty slot = new game, used slot = continue.
 * Keyboard: Up/Down select, Enter play, Delete/Backspace delete, Esc back.
 * Mouse: hover/click a file to play it, click Delete to delete it.
 */
export class FileSelectScene extends Scene {
  private selected = 0;
  private views: SlotView[] = [];
  private slotsLayer = new Container();
  private confirm = new Container();
  private confirmText!: Text;
  private deleteMenu!: MenuList;
  /** Set while the delete confirmation is open. */
  private confirmMenu?: MenuList;
  private confirmSlot?: number;

  override enter(): void {
    const title = new Text({ text: "SELECT A FILE", style: { fill: COLORS.text, fontSize: 56, fontWeight: "bold" } });
    title.anchor.set(0.5);
    title.position.set(GAME_WIDTH / 2, 80);

    const hint = new Text({
      text: "Enter / Click: play    Delete: erase file    Esc: back",
      style: { fill: COLORS.text, fontSize: 18 },
    });
    hint.anchor.set(0.5, 1);
    hint.position.set(GAME_WIDTH / 2, GAME_HEIGHT - 16);

    this.buildConfirm();
    this.addChild(title, this.slotsLayer, hint, this.confirm);
    this.buildSlots();
  }

  update(): void {
    const input = this.game.input;
    if (this.confirmMenu) {
      if (input.menuPressed("back")) this.closeConfirm();
      else this.confirmMenu.update(input);
      return;
    }
    if (input.menuPressed("back")) return this.game.changeScene(new TitleScene(this.game));
    if (input.menuPressed("up")) this.select((this.selected - 1 + SLOT_COUNT) % SLOT_COUNT);
    if (input.menuPressed("down")) this.select((this.selected + 1) % SLOT_COUNT);
    if (input.menuPressed("confirm")) this.play(this.selected);
    else if (input.menuPressed("clear") && listSlots()[this.selected]) this.askDelete(this.selected);
  }

  // ---------------------------------------------------------------- slots

  /** (Re)build the slot cards from storage. */
  private buildSlots(): void {
    this.slotsLayer.removeChildren().forEach((c) => c.destroy({ children: true }));
    this.views = [];
    listSlots().forEach((save, i) => {
      const y = CARD_Y + i * (CARD_H + CARD_GAP);

      const card = new Container();
      card.position.set(CARD_X, y);
      const bg = new Graphics();
      card.addChild(bg);
      const name = new Text({ text: `FILE ${i + 1}`, style: { fill: COLORS.text, fontSize: 30, fontWeight: "bold" } });
      name.position.set(24, 16);
      card.addChild(name);

      if (!save) {
        const empty = new Text({ text: "New Game", style: { fill: COLORS.superBarFull, fontSize: 30, fontWeight: "bold" } });
        empty.anchor.set(0.5);
        empty.position.set(CARD_W / 2 + 60, CARD_H / 2);
        card.addChild(empty);
      } else {
        const pct = Math.floor(storyProgress(save) * 100);
        const story = new Text({ text: `Story ${pct}%`, style: { fill: COLORS.superBarFull, fontSize: 26, fontWeight: "bold" } });
        story.position.set(220, 18);
        const bar = new Graphics()
          .roundRect(220, 54, 380, 14, 7)
          .fill({ color: 0x000000, alpha: 0.5 })
          .roundRect(220, 54, (380 * pct) / 100, 14, 7)
          .fill(COLORS.superBarFull);
        const date = new Text({
          text: `Last played: ${formatDate(save.lastPlayed)}`,
          style: { fill: COLORS.text, fontSize: 18 },
        });
        date.position.set(220, 80);
        card.addChild(story, bar, date);
      }

      card.eventMode = "static";
      card.cursor = "pointer";
      card.on("pointerover", () => !this.confirmMenu && this.select(i));
      card.on("pointertap", () => !this.confirmMenu && this.play(i));
      this.slotsLayer.addChild(card);

      // Delete button (only for used slots)
      const del = new Container();
      del.position.set(CARD_X + CARD_W + 20, y + CARD_H / 2 - 26);
      const delBg = new Graphics();
      const delText = new Text({ text: "Delete", style: { fill: COLORS.text, fontSize: 22 } });
      delText.anchor.set(0.5);
      delText.position.set(DEL_W / 2, 26);
      del.addChild(delBg, delText);
      del.eventMode = "static";
      del.cursor = "pointer";
      del.on("pointerover", () => !this.confirmMenu && this.select(i));
      del.on("pointertap", () => !this.confirmMenu && this.askDelete(i));
      del.visible = save !== undefined;
      this.slotsLayer.addChild(del);

      this.views.push({ card, bg, del, delBg });
    });
    this.select(this.selected);
  }

  private select(i: number): void {
    this.selected = i;
    this.views.forEach((v, j) => {
      const sel = j === i;
      v.bg.clear()
        .roundRect(0, 0, CARD_W, CARD_H, 14)
        .fill({ color: 0x000000, alpha: sel ? 0.5 : 0.3 })
        .stroke({ color: sel ? COLORS.superBarFull : 0x6d5a45, width: sel ? 3 : 1 });
      v.delBg.clear()
        .roundRect(0, 0, DEL_W, 52, 10)
        .fill({ color: COLORS.bossBar, alpha: sel ? 0.6 : 0.25 })
        .stroke({ color: sel ? COLORS.bossBar : 0x6d5a45, width: sel ? 2 : 1 });
    });
  }

  private play(slot: number): void {
    openSlot(slot);
    this.game.changeScene(new MapScene(this.game));
  }

  // ---------------------------------------------------------------- delete confirmation

  private buildConfirm(): void {
    const dim = new Graphics().rect(0, 0, GAME_WIDTH, GAME_HEIGHT).fill({ color: 0x000000, alpha: 0.6 });
    dim.eventMode = "static"; // swallow clicks
    this.confirmText = new Text({
      text: "",
      style: { fill: COLORS.text, fontSize: 34, fontWeight: "bold", align: "center" },
    });
    this.confirmText.anchor.set(0.5);
    this.confirmText.position.set(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 110);
    this.deleteMenu = new MenuList([
      { label: "Keep it", onSelect: () => this.closeConfirm() },
      { label: "Delete", onSelect: () => this.confirmDelete() },
    ]);
    this.deleteMenu.position.set(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 30);
    this.confirm.addChild(dim, this.confirmText, this.deleteMenu);
    this.confirm.visible = false;
  }

  private askDelete(slot: number): void {
    this.confirmSlot = slot;
    this.confirmText.text = `Delete FILE ${slot + 1}?\nThis can't be undone.`;
    this.confirmMenu = this.deleteMenu;
    this.deleteMenu.selected = 0; // "Keep it" first so a stray Enter never deletes anything
    this.deleteMenu.redraw();
    this.confirm.visible = true;
  }

  private confirmDelete(): void {
    if (this.confirmSlot !== undefined) deleteSlot(this.confirmSlot);
    this.closeConfirm();
    this.buildSlots();
  }

  private closeConfirm(): void {
    this.confirmMenu = undefined;
    this.confirmSlot = undefined;
    this.confirm.visible = false;
  }
}
