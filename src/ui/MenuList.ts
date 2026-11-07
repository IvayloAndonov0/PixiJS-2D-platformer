import { Container, Graphics, Text } from "pixi.js";
import { COLORS } from "../config";
import type { Input } from "../core/Input";

export interface MenuItem {
  label: string;
  onSelect: () => void;
}

export interface MenuListOptions {
  width?: number;
  itemHeight?: number;
  gap?: number;
  fontSize?: number;
}

/**
 * Vertical list of buttons usable with keyboard and mouse.
 * Keyboard: up/down to move, confirm to activate (call `update(input)` every frame).
 * Mouse: hover highlights an item, click activates it.
 * Positioned by its top-center: set `x` to the center of the list.
 */
export class MenuList extends Container {
  selected = 0;
  private buttons: { bg: Graphics; text: Text }[] = [];
  private readonly w: number;
  private readonly h: number;

  constructor(
    private items: MenuItem[],
    opts: MenuListOptions = {},
  ) {
    super();
    this.w = opts.width ?? 320;
    this.h = opts.itemHeight ?? 52;
    const gap = opts.gap ?? 12;
    const fontSize = opts.fontSize ?? 28;

    items.forEach((item, i) => {
      const btn = new Container();
      btn.position.set(-this.w / 2, i * (this.h + gap));
      btn.eventMode = "static";
      btn.cursor = "pointer";
      const bg = new Graphics();
      const text = new Text({ text: item.label, style: { fill: COLORS.text, fontSize } });
      text.anchor.set(0.5);
      text.position.set(this.w / 2, this.h / 2);
      btn.addChild(bg, text);
      btn.on("pointerover", () => {
        this.selected = i;
        this.redraw();
      });
      btn.on("pointertap", () => {
        this.selected = i;
        item.onSelect();
      });
      this.addChild(btn);
      this.buttons.push({ bg, text });
    });
    this.redraw();
  }

  /** Keyboard navigation. Returns true if an item was activated this frame. */
  update(input: Input): boolean {
    const n = this.items.length;
    if (input.menuPressed("up")) this.selected = (this.selected - 1 + n) % n;
    if (input.menuPressed("down")) this.selected = (this.selected + 1) % n;
    this.redraw();
    if (input.menuPressed("confirm")) {
      this.items[this.selected].onSelect();
      return true;
    }
    return false;
  }

  private redraw(): void {
    this.buttons.forEach(({ bg }, i) => {
      const sel = i === this.selected;
      bg.clear()
        .roundRect(0, 0, this.w, this.h, 10)
        .fill({ color: 0x000000, alpha: sel ? 0.55 : 0.35 })
        .stroke({ color: sel ? COLORS.superBarFull : 0x6d5a45, width: sel ? 3 : 1 });
    });
  }
}
