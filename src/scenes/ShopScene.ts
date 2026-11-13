import { Container, Graphics, Text } from "pixi.js";
import { COLORS, GAME_HEIGHT, GAME_WIDTH } from "../config";
import { Scene } from "../core/Scene";
import type { Game } from "../core/Game";
import {
  type ItemId,
  type ShopItem,
  SHOP_ITEMS,
  buy,
  clearWeaponB,
  coins,
  equipCharm,
  equipWeapon,
  isCharm,
  isWeapon,
  itemById,
  loadout,
  owns,
} from "../core/Upgrades";
import { MenuList } from "../ui/MenuList";
import { MapScene } from "./MapScene";

const LIST_X = 70;
const LIST_Y = 120;
const ROW_W = 400;
const ROW_H = 68;
const ROW_GAP = 10;
const PANEL_X = 510;
const PANEL_W = 700;
const COIN_COLOR = 0xffd54f;

type Focus = "list" | "actions";

/**
 * Shop ("shop" mode, entered from the shop building on the map): buy weapons and charms with coins,
 * and equip them. "equip" mode (Map menu -> Equipment) shows only owned items, no buying.
 *
 * Keyboard: Up/Down pick an item, Enter to see its actions, Enter again to do one, Esc to go back.
 * Mouse: click an item, then click an action.
 */
export class ShopScene extends Scene {
  private items: ShopItem[] = [];
  private selected = 0;
  private focus: Focus = "list";
  /** Set by actions; the action menu is rebuilt next frame (not from inside its own click handler). */
  private dirty = false;

  private rows: { bg: Graphics; status: Text }[] = [];
  private coinText = new Text({ text: "", style: { fill: COIN_COLOR, fontSize: 28, fontWeight: "bold" } });
  private nameText = new Text({ text: "", style: { fill: COLORS.text, fontSize: 36, fontWeight: "bold" } });
  private kindText = new Text({ text: "", style: { fill: COLORS.superBarFull, fontSize: 18, fontWeight: "bold", letterSpacing: 3 } });
  private descText = new Text({ text: "", style: { fill: COLORS.text, fontSize: 21, lineHeight: 30 } });
  private message = new Text({ text: "", style: { fill: COLORS.parryable, fontSize: 20, fontWeight: "bold" } });
  private loadoutText = new Text({ text: "", style: { fill: COLORS.text, fontSize: 20 } });
  private hint = new Text({ text: "", style: { fill: COLORS.text, fontSize: 17 } });
  private bigIcon = new Container();
  private actions?: MenuList;
  private actionsLayer = new Container();

  constructor(
    game: Game,
    private mode: "shop" | "equip",
  ) {
    super(game);
  }

  override enter(): void {
    this.items = this.mode === "shop" ? SHOP_ITEMS : SHOP_ITEMS.filter((i) => owns(i.id));

    const title = new Text({
      text: this.mode === "shop" ? "SHOP" : "EQUIPMENT",
      style: { fill: COLORS.text, fontSize: 52, fontWeight: "bold" },
    });
    title.position.set(LIST_X, 30);
    this.coinText.anchor.set(1, 0);
    this.coinText.position.set(GAME_WIDTH - 60, 44);

    // Detail panel
    const panelH = this.items.length * (ROW_H + ROW_GAP) - ROW_GAP;
    const panel = new Graphics()
      .roundRect(PANEL_X, LIST_Y, PANEL_W, Math.max(panelH, 380), 16)
      .fill({ color: 0x000000, alpha: 0.3 })
      .stroke({ color: 0x6d5a45, width: 2 });
    this.bigIcon.position.set(PANEL_X + 60, LIST_Y + 62);
    this.bigIcon.scale.set(1.6);
    this.nameText.position.set(PANEL_X + 120, LIST_Y + 24);
    this.kindText.position.set(PANEL_X + 122, LIST_Y + 70);
    this.descText.position.set(PANEL_X + 30, LIST_Y + 120);
    this.actionsLayer.position.set(PANEL_X + PANEL_W / 2, LIST_Y + 220);
    this.message.anchor.set(0.5, 0);

    // Loadout strip
    const strip = new Graphics()
      .roundRect(LIST_X, 560, GAME_WIDTH - LIST_X * 2, 60, 12)
      .fill({ color: 0x000000, alpha: 0.35 })
      .stroke({ color: COLORS.superBarFull, width: 2 });
    this.loadoutText.anchor.set(0.5);
    this.loadoutText.position.set(GAME_WIDTH / 2, 590);

    this.hint.anchor.set(0.5, 1);
    this.hint.position.set(GAME_WIDTH / 2, GAME_HEIGHT - 12);

    const back = this.makeBackButton();
    this.addChild(title, this.coinText, panel, this.bigIcon, this.nameText, this.kindText, this.descText);
    this.addChild(this.actionsLayer, strip, this.loadoutText, this.hint, back);
    this.buildRows();
    this.refreshAll();
  }

  update(): void {
    const input = this.game.input;
    if (this.dirty) {
      this.dirty = false;
      this.refreshAll();
    }

    if (this.focus === "actions" && this.actions) {
      if (input.menuPressed("back")) return this.setFocus("list");
      this.actions.update(input);
      return;
    }
    if (input.menuPressed("back")) return this.leave();
    const n = this.items.length;
    if (n === 0) return;
    if (input.menuPressed("up")) this.select((this.selected - 1 + n) % n);
    if (input.menuPressed("down")) this.select((this.selected + 1) % n);
    if (input.menuPressed("confirm")) this.setFocus("actions");
  }

  // ---------------------------------------------------------------- item list

  private buildRows(): void {
    this.items.forEach((item, i) => {
      const row = new Container();
      row.position.set(LIST_X, LIST_Y + i * (ROW_H + ROW_GAP));
      const bg = new Graphics();
      const icon = drawIcon(item.id);
      icon.position.set(38, ROW_H / 2);
      const name = new Text({ text: item.name, style: { fill: COLORS.text, fontSize: 24, fontWeight: "bold" } });
      name.position.set(76, 12);
      const kind = new Text({ text: item.kind === "weapon" ? "Weapon" : "Charm", style: { fill: 0xbca88a, fontSize: 15 } });
      kind.position.set(77, 42);
      const status = new Text({ text: "", style: { fill: COIN_COLOR, fontSize: 20, fontWeight: "bold" } });
      status.anchor.set(1, 0.5);
      status.position.set(ROW_W - 16, ROW_H / 2);
      row.addChild(bg, icon, name, kind, status);
      row.eventMode = "static";
      row.cursor = "pointer";
      row.on("pointerover", () => this.focus === "list" && this.select(i));
      row.on("pointertap", () => {
        this.select(i);
        this.setFocus("list");
      });
      this.addChild(row);
      this.rows.push({ bg, status });
    });
    if (this.items.length === 0) {
      const none = new Text({ text: "Nothing to equip yet.\nFind coins on the map and visit the shop!", style: { fill: COLORS.text, fontSize: 22 } });
      none.position.set(LIST_X, LIST_Y);
      this.addChild(none);
    }
  }

  private select(i: number): void {
    if (i === this.selected) return;
    this.selected = i;
    this.message.text = "";
    this.refreshAll();
  }

  private setFocus(f: Focus): void {
    this.focus = f;
    if (this.actions) {
      this.actions.selected = 0;
      this.actions.redraw();
      this.actions.alpha = f === "actions" ? 1 : 0.75;
    }
    this.refreshHint();
  }

  // ---------------------------------------------------------------- refresh

  private refreshAll(): void {
    this.coinText.text = `Coins: ${coins()}`;
    const lo = loadout();
    this.items.forEach((item, i) => {
      const { bg, status } = this.rows[i];
      const sel = i === this.selected;
      bg.clear()
        .roundRect(0, 0, ROW_W, ROW_H, 12)
        .fill({ color: 0x000000, alpha: sel ? 0.5 : 0.3 })
        .stroke({ color: sel ? COLORS.superBarFull : 0x6d5a45, width: sel ? 3 : 1 });
      const tag = equippedTag(item.id);
      status.text = tag ?? (owns(item.id) ? "Owned" : `${item.price} coins`);
      status.style.fill = tag ? COLORS.parryable : owns(item.id) ? 0xbca88a : coins() >= item.price ? COIN_COLOR : 0xb06a5a;
    });

    const charm = lo.charm ? itemById(lo.charm).name : "none";
    const b = lo.weapons[1] ? itemById(lo.weapons[1]).name : "empty";
    this.loadoutText.text = `Weapon A: ${itemById(lo.weapons[0]).name}      Weapon B: ${b}      Charm: ${charm}`;

    const item = this.items[this.selected];
    this.bigIcon.removeChildren().forEach((c) => c.destroy());
    if (!item) {
      this.nameText.text = this.kindText.text = this.descText.text = "";
      this.refreshHint();
      return;
    }
    this.bigIcon.addChild(drawIcon(item.id));
    this.nameText.text = item.name;
    this.kindText.text = item.kind === "weapon" ? "WEAPON" : "CHARM  (one equipped at a time)";
    this.descText.text = item.description;
    this.buildActions(item);
    this.refreshHint();
  }

  private buildActions(item: ShopItem): void {
    const keepFocus = this.focus;
    const prevSelected = this.actions?.selected ?? 0;
    this.actionsLayer
      .removeChildren()
      .filter((c) => c !== this.message) // the message is reused, not rebuilt
      .forEach((c) => c.destroy({ children: true }));

    const list: { label: string; onSelect: () => void }[] = [];
    const lo = loadout();
    if (!owns(item.id)) {
      const can = coins() >= item.price;
      list.push({
        label: can ? `Buy for ${item.price} coins` : `Need ${item.price} coins`,
        onSelect: () => this.act(() => (buy(item.id) ? `Bought ${item.name}!${autoEquipNote(item.id)}` : `Not enough coins.`), !can),
      });
    } else if (isWeapon(item.id)) {
      const id = item.id;
      list.push({ label: "Equip as Weapon A", onSelect: () => this.act(() => (equipWeapon(id, 0), `${item.name} is now Weapon A.`)) });
      list.push({ label: "Equip as Weapon B", onSelect: () => this.act(() => (equipWeapon(id, 1), `${item.name} is now Weapon B.`)) });
      if (lo.weapons[1] === id) list.push({ label: "Unequip Weapon B", onSelect: () => this.act(() => (clearWeaponB(), "Weapon B is empty.")) });
    } else if (isCharm(item.id)) {
      const id = item.id;
      if (lo.charm === id) list.push({ label: "Unequip", onSelect: () => this.act(() => (equipCharm(null), `${item.name} unequipped.`)) });
      else list.push({ label: "Equip charm", onSelect: () => this.act(() => (equipCharm(id), `${item.name} equipped.`)) });
    }

    this.actions = new MenuList(list, { width: 340, itemHeight: 48, gap: 10, fontSize: 22 });
    this.actions.selected = Math.min(prevSelected, list.length - 1);
    this.actions.redraw();
    this.actions.alpha = keepFocus === "actions" ? 1 : 0.75;
    // Clicking an action works from either focus.
    this.actionsLayer.addChild(this.actions);
    this.message.position.set(0, this.actions.height + 18);
    this.actionsLayer.addChild(this.message);
  }

  /** Run an action, show its message, and rebuild the screen next frame. */
  private act(fn: () => string, failed = false): void {
    const msg = fn();
    this.message.text = msg;
    this.message.style.fill = failed || msg.startsWith("Not") ? COLORS.bossBar : COLORS.parryable;
    this.focus = "actions";
    this.dirty = true;
  }

  private refreshHint(): void {
    this.hint.text =
      this.focus === "actions"
        ? "Up/Down: choose    Enter / Click: confirm    Esc: back to the list"
        : `Up/Down: pick item    Enter / Click: options    Esc: ${this.mode === "shop" ? "leave shop" : "back to map"}    ` +
          `In a fight, ${this.game.input.labelFor("swap")} switches weapons`;
  }

  private makeBackButton(): Container {
    const btn = new Container();
    btn.position.set(GAME_WIDTH - 200, 640);
    const bg = new Graphics().roundRect(0, 0, 130, 44, 10).fill({ color: 0x000000, alpha: 0.4 }).stroke({ color: 0x6d5a45, width: 2 });
    const t = new Text({ text: this.mode === "shop" ? "Leave" : "Back", style: { fill: COLORS.text, fontSize: 22 } });
    t.anchor.set(0.5);
    t.position.set(65, 22);
    btn.addChild(bg, t);
    btn.eventMode = "static";
    btn.cursor = "pointer";
    btn.on("pointertap", () => this.leave());
    return btn;
  }

  private leave(): void {
    this.game.changeScene(new MapScene(this.game));
  }
}

/** "Weapon A", "Weapon B", "Equipped" for equipped items, otherwise undefined. */
function equippedTag(id: ItemId): string | undefined {
  const lo = loadout();
  if (lo.weapons[0] === id) return "Weapon A";
  if (lo.weapons[1] === id) return "Weapon B";
  if (lo.charm === id) return "Equipped";
  return undefined;
}

function autoEquipNote(id: ItemId): string {
  const tag = equippedTag(id);
  return tag ? ` (equipped as ${tag === "Equipped" ? "your charm" : tag})` : "";
}

/** Small icon for each item, centered on (0, 0), about 44px wide. TODO(art): real icons. */
function drawIcon(id: ItemId): Graphics {
  const g = new Graphics();
  g.circle(0, 0, 24).fill({ color: 0x000000, alpha: 0.35 });
  switch (id) {
    case "blaster":
      g.roundRect(-12, -7, 24, 14, 3).fill(COLORS.playerBullet).stroke({ color: 0x8d6e00, width: 2 });
      g.poly([12, -7, 20, 0, 12, 7]).fill(COLORS.playerBullet);
      break;
    case "spread":
      for (const a of [-0.45, 0, 0.45]) g.circle(Math.cos(a) * 14 - 2, Math.sin(a) * 14, 5).fill(0xffb74d);
      g.circle(-12, 0, 4).fill(0xffe0b2);
      break;
    case "homing":
      g.moveTo(-16, 10).quadraticCurveTo(-4, -18, 12, -4).stroke({ color: 0xb388ff, width: 3, alpha: 0.6 });
      g.circle(12, -4, 7).fill(0xb388ff).stroke({ color: 0xffffff, width: 2 });
      break;
    case "shadow":
      for (let k = 0; k < 3; k++) {
        g.roundRect(-18 + k * 9, -12, 12, 24, 5).fill({ color: 0x6a4a9a, alpha: 0.35 + k * 0.3 });
      }
      break;
    case "heart":
      g.circle(-7, -4, 8).fill(0xe53935).circle(7, -4, 8).fill(0xe53935).poly([-15, -1, 15, -1, 0, 16]).fill(0xe53935);
      g.circle(-9, -7, 2.5).fill(0xffcdd2);
      break;
  }
  return g;
}
