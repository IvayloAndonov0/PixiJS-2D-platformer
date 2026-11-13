import { AnimatedSprite, Container, Graphics, Sprite, Text, type FederatedPointerEvent } from "pixi.js";
import { anim, image, type ImageName } from "../assets";
import { BOSSES } from "../bosses";
import { COLORS, GAME_HEIGHT, GAME_WIDTH } from "../config";
import { formatTime, getRecord } from "../core/Progress";
import { currentSave, saveGame } from "../core/SaveSystem";
import { Scene } from "../core/Scene";
import { LAKE, MAP_COINS, MAP_H, MAP_NODES, MAP_PATHS, MAP_SHOP, MAP_START, MAP_W, SHOP_PATH, type MapNode } from "../level/overworld";
import { MenuList } from "../ui/MenuList";
import { BossFightScene } from "./BossFightScene";
import { SettingsScene } from "./SettingsScene";
import { ShopScene } from "./ShopScene";
import { TitleScene } from "./TitleScene";

const WALK_SPEED = 280; // px/s
const FEET_R = 14; // player collision radius
const NODE_RANGE = 95; // how close you must be to a level marker to enter it
const PATH_CLEARANCE = 70; // keep trees this far from path centerlines
const FADE_TIME = 0.35;
const COIN_PICKUP_RANGE = 34; // px from the player's feet
const COIN_CLEARANCE = 60; // keep trees and bushes this far from hidden coins
const TREE_SCALE = 1.3; // Tree1.png is 128px; this makes it roughly the size of the old drawn trees
const TREE_BASE_Y = 94 / 128; // shadow center in Tree1.png, as a fraction of its height

const BUSH_COUNT = 70;
const ROCK_COUNT = 25;
const SCENERY_GAP = 6; // min space between a scattered bush/rock and any tree, rock or bush

/**
 * A scatterable sprite with the opaque part of its image (in texture pixels), so placement checks
 * use what is actually visible instead of the transparent padding. `scale` brings them to a similar size.
 */
interface ScatterDef {
  name: ImageName;
  size: number;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  scale: number;
}

const ROCKS: ScatterDef[] = [
  { name: "rock1", size: 64, minX: 5, maxX: 57, minY: 2, maxY: 61, scale: 1.1 },
  { name: "rock2", size: 64, minX: 1, maxX: 60, minY: 2, maxY: 61, scale: 1.1 },
  { name: "rock4", size: 64, minX: 1, maxX: 62, minY: 6, maxY: 57, scale: 1.1 },
  { name: "rock5", size: 64, minX: 1, maxX: 61, minY: 0, maxY: 63, scale: 1.1 },
];

const BUSHES: ScatterDef[] = [
  { name: "bushBlueFlowers", size: 64, minX: 15, maxX: 49, minY: 15, maxY: 50, scale: 1.4 },
  { name: "bushRedFlowers", size: 64, minX: 12, maxX: 50, minY: 14, maxY: 52, scale: 1.4 },
  { name: "bushSimple1", size: 32, minX: 1, maxX: 29, minY: 0, maxY: 29, scale: 1.6 },
  { name: "bushSimple2", size: 32, minX: 1, maxX: 30, minY: 0, maxY: 30, scale: 1.6 },
  { name: "fern1", size: 64, minX: 12, maxX: 51, minY: 14, maxY: 49, scale: 1.4 },
  { name: "fern2", size: 64, minX: 15, maxX: 50, minY: 15, maxY: 48, scale: 1.4 },
];

interface Circle {
  x: number;
  y: number;
  r: number;
}

/** Axis-aligned box of a scenery object's visible area, in map coordinates. */
interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/**
 * Top-down overworld. Walk with the movement keys (or click to walk there), stand next to a
 * level marker to see its best attempt, then press Enter / click it to play.
 * Everything is drawn with Graphics for now. TODO(art): real map art.
 */
export class MapScene extends Scene {
  private world = new Container();
  private objects = new Container(); // y-sorted: trees, rocks, markers, player
  private player = new Container();
  private sprite!: AnimatedSprite;
  private facing: 1 | -1 = 1;
  private walking = false;
  private moveTarget?: { x: number; y: number };
  private stuckTime = 0;

  private obstacles: Circle[] = [];
  /** Visible areas of placed trees, rocks and bushes, so bushes never overlap them. */
  private sceneryBoxes: Box[] = [];
  private markers: { node: MapNode; view: Container; flag: Container }[] = [];
  /** Coins still lying on the map, and ones playing their pickup pop. */
  private coins: { id: string; x: number; y: number; view: Container }[] = [];
  private popping: { view: Container; t: number }[] = [];
  private coinText = new Text({
    text: "",
    style: { fill: 0xffd54f, fontSize: 26, fontWeight: "bold", stroke: { color: 0x000000, width: 5 } },
  });
  private focused?: MapNode;
  private time = 0;

  private card = new Container();
  private cardBg = new Graphics();
  private cardTitle = new Text({ text: "", style: { fill: COLORS.text, fontSize: 30, fontWeight: "bold" } });
  private cardInfo = new Text({ text: "", style: { fill: COLORS.text, fontSize: 20 } });
  private cardPrompt = new Text({ text: "", style: { fill: COLORS.superBarFull, fontSize: 20, fontWeight: "bold" } });

  private menuOpen = false;
  private menuOverlay = new Container();
  private menu!: MenuList;

  /** Counts down while fading out to the next scene. */
  private fadeTimer = 0;
  private fade = new Graphics().rect(0, 0, GAME_WIDTH, GAME_HEIGHT).fill(0x000000);
  private next?: () => void;

  /** "Game saved" notice. */
  private toast = new Text({
    text: "",
    style: { fill: COLORS.parryable, fontSize: 24, fontWeight: "bold", stroke: { color: 0x000000, width: 5 } },
  });
  private toastTimer = 0;

  override enter(): void {
    const rand = mulberry32(7);
    this.world.addChild(this.drawGround(rand), this.drawPaths(), this.drawLake(), this.objects);
    this.objects.sortableChildren = true;
    this.placeScenery(rand);
    // Own RNGs so adding these doesn't reshuffle the trees. Rocks first: they're solid, bushes fill in around them.
    this.scatter(ROCKS, ROCK_COUNT, mulberry32(13), true);
    this.scatter(BUSHES, BUSH_COUNT, mulberry32(11), false);
    MAP_NODES.forEach((n) => this.addMarker(n));
    this.addMarker(MAP_SHOP);
    this.placeCoins();
    this.buildPlayer();

    const start = currentSave().mapPos ?? MAP_START;
    this.player.position.set(start.x, start.y);

    this.buildCard();
    this.buildMenu();
    const hint = new Text({
      text: `Walk: ${this.game.input.labelFor("left")} ${this.game.input.labelFor("right")} ${this.game.input.labelFor("up")} ${this.game.input.labelFor("down")}  or click    Enter: play    Esc: menu`,
      style: { fill: COLORS.text, fontSize: 16, stroke: { color: 0x000000, width: 4 } },
    });
    hint.position.set(14, 10);

    this.coinText.anchor.set(1, 0);
    this.coinText.position.set(GAME_WIDTH - 16, 8);
    this.refreshCoinText();
    this.toast.anchor.set(1, 0);
    this.toast.position.set(GAME_WIDTH - 16, 44);

    this.fade.alpha = 1; // fade in
    this.addChild(this.world, hint, this.coinText, this.card, this.menuOverlay, this.toast, this.fade);
    this.updateCamera(true);
  }

  update(dt: number): void {
    this.time += dt;
    const input = this.game.input;

    if (this.next) {
      this.fadeTimer -= dt;
      this.fade.alpha = 1 - Math.max(0, this.fadeTimer) / FADE_TIME;
      if (this.fadeTimer <= 0) this.next();
      return;
    }
    this.fade.alpha = Math.max(0, this.fade.alpha - dt / FADE_TIME);
    this.toastTimer = Math.max(0, this.toastTimer - dt);
    this.toast.alpha = Math.min(1, this.toastTimer / 0.4);

    if (this.menuOpen) {
      if (input.menuPressed("back")) this.setMenu(false);
      else this.menu.update(input);
      return;
    }
    if (input.menuPressed("back")) return this.setMenu(true);

    this.movePlayer(dt);
    this.collectCoins();
    this.updateFocus();
    if (this.focused && (input.menuPressed("confirm") || input.wasPressed("jump"))) this.enterNode(this.focused);

    this.updateCamera(false);
    this.animateMarkers();
    this.animateCoins(dt);
  }

  // ---------------------------------------------------------------- player

  private buildPlayer(): void {
    const shadow = new Graphics().ellipse(0, 0, 20, 7).fill({ color: 0x000000, alpha: 0.25 });
    this.sprite = new AnimatedSprite({ textures: anim("player", "Idle"), updateAnchor: true });
    this.sprite.scale.set(0.55);
    this.sprite.animationSpeed = 10 / 60;
    this.sprite.play();
    this.player.addChild(shadow, this.sprite);
    this.objects.addChild(this.player);
  }

  private movePlayer(dt: number): void {
    const input = this.game.input;
    let dx = input.axisX();
    let dy = input.axisY();
    if (dx !== 0 || dy !== 0) this.moveTarget = undefined; // keys override click-to-walk

    if (this.moveTarget) {
      const tx = this.moveTarget.x - this.player.x;
      const ty = this.moveTarget.y - this.player.y;
      const d = Math.hypot(tx, ty);
      if (d < 6) this.moveTarget = undefined;
      else {
        dx = tx / d;
        dy = ty / d;
      }
    }

    const len = Math.hypot(dx, dy);
    const moving = len > 0;
    if (moving) {
      const before = { x: this.player.x, y: this.player.y };
      this.player.x += (dx / len) * WALK_SPEED * dt;
      this.player.y += (dy / len) * WALK_SPEED * dt;
      this.collide();
      if (dx !== 0) this.facing = dx > 0 ? 1 : -1;

      // Give up on click-to-walk if something blocks the way.
      const moved = Math.hypot(this.player.x - before.x, this.player.y - before.y);
      this.stuckTime = moved < WALK_SPEED * dt * 0.2 ? this.stuckTime + dt : 0;
      if (this.stuckTime > 0.3) this.moveTarget = undefined;
    }

    if (moving !== this.walking) {
      this.walking = moving;
      this.sprite.textures = anim("player", moving ? "Walk" : "Idle");
      this.sprite.animationSpeed = (moving ? 14 : 10) / 60;
      this.sprite.play();
    }
    this.sprite.scale.x = 0.55 * this.facing;
    this.player.zIndex = this.player.y;
  }

  /** Push the player's feet out of trees, rocks and water; keep inside the map. */
  private collide(): void {
    const p = this.player;
    for (let pass = 0; pass < 2; pass++) {
      for (const o of this.obstacles) {
        const dx = p.x - o.x;
        const dy = p.y - o.y;
        const min = o.r + FEET_R;
        const d2 = dx * dx + dy * dy;
        if (d2 >= min * min) continue;
        const d = Math.sqrt(d2) || 0.001;
        p.x = o.x + (dx / d) * min;
        p.y = o.y + (dy / d) * min;
      }
    }
    p.x = Math.max(60, Math.min(MAP_W - 60, p.x));
    p.y = Math.max(80, Math.min(MAP_H - 40, p.y));
  }

  // ---------------------------------------------------------------- levels

  private addMarker(node: MapNode): void {
    if (node.shop) return this.addShop(node);
    const boss = node.boss !== undefined ? BOSSES[node.boss] : undefined;
    const record = boss ? getRecord(boss.name) : undefined;
    const view = new Container();
    view.position.set(node.x, node.y);
    view.zIndex = node.y;

    const base = new Graphics()
      .ellipse(0, 4, 54, 22)
      .fill({ color: 0x000000, alpha: 0.2 })
      .ellipse(0, 0, 50, 20)
      .fill(0x9b8a72)
      .stroke({ color: 0x5d4b38, width: 3 })
      .ellipse(0, -3, 38, 13)
      .fill(0xb3a184);

    const flag = new Container();
    const pole = new Graphics().rect(-3, -96, 6, 96).fill(0x5d4037).circle(0, -98, 5).fill(COLORS.superBarFull);
    const cloth = new Graphics()
      .poly([3, -94, 56, -80, 3, -64])
      .fill(boss ? COLORS.boss : 0x8a8a8a)
      .stroke({ color: 0x000000, width: 2, alpha: 0.4 });
    flag.addChild(pole, cloth);
    view.addChild(base, flag);

    if (!boss) {
      // Padlock
      view.addChild(
        new Graphics()
          .arc(0, -22, 10, Math.PI, 0)
          .stroke({ color: 0x4a4a4a, width: 5 })
          .roundRect(-14, -24, 28, 22, 4)
          .fill(0x6d6d6d)
          .stroke({ color: 0x3a3a3a, width: 2 })
          .circle(0, -14, 3)
          .fill(0x2a2a2a),
      );
    } else if (record?.won && record.bestGrade) {
      const badge = new Container();
      badge.position.set(-40, -50);
      badge.addChild(new Graphics().circle(0, 0, 20).fill(COLORS.superBarFull).stroke({ color: 0x5d4037, width: 3 }));
      const g = new Text({ text: record.bestGrade, style: { fill: 0x3e2723, fontSize: 18, fontWeight: "bold" } });
      g.anchor.set(0.5);
      badge.addChild(g);
      view.addChild(badge);
    }

    const label = new Text({
      text: boss ? boss.name : "???",
      style: { fill: COLORS.text, fontSize: 18, fontWeight: "bold", stroke: { color: 0x000000, width: 4 } },
    });
    label.anchor.set(0.5, 1);
    label.position.set(14, -104); // above the flag, so the player never covers it
    view.addChild(label);

    view.eventMode = "static";
    view.cursor = "pointer";
    view.hitArea = { contains: (x: number, y: number) => x >= -60 && x <= 70 && y >= -130 && y <= 26 };
    view.on("pointertap", (e: FederatedPointerEvent) => {
      e.stopPropagation();
      if (this.menuOpen || this.next) return;
      if (this.focused === node) this.enterNode(node);
      else this.moveTarget = { x: node.x, y: node.y + 40 };
    });

    this.objects.addChild(view);
    this.markers.push({ node, view, flag });
    this.obstacles.push({ x: node.x, y: node.y - 6, r: 26 }); // the flagpole
  }

  /** The shop: a little building with a sign. Walk up to the door and press Enter. */
  private addShop(node: MapNode): void {
    const view = new Container();
    view.position.set(node.x, node.y);
    view.zIndex = node.y;
    const house = new Graphics()
      .ellipse(0, 4, 84, 20)
      .fill({ color: 0x000000, alpha: 0.22 })
      // walls + planks
      .rect(-66, -88, 132, 90)
      .fill(0x9c7650)
      .stroke({ color: 0x5d4037, width: 3 })
      .rect(-66, -60, 132, 3)
      .fill(0x7a5a3a)
      .rect(-66, -30, 132, 3)
      .fill(0x7a5a3a)
      // roof
      .poly([-84, -84, 0, -150, 84, -84])
      .fill(0xb5463a)
      .stroke({ color: 0x6e2a22, width: 3 })
      // door
      .roundRect(-18, -50, 36, 52, 6)
      .fill(0x4e342e)
      .circle(10, -24, 3)
      .fill(COLORS.superBarFull)
      // windows
      .rect(-54, -66, 24, 22)
      .fill(0xffe082)
      .stroke({ color: 0x5d4037, width: 3 })
      .rect(30, -66, 24, 22)
      .fill(0xffe082)
      .stroke({ color: 0x5d4037, width: 3 })
      // sign board
      .roundRect(-46, -116, 92, 30, 6)
      .fill(0x3e2723)
      .stroke({ color: COLORS.superBarFull, width: 2 });
    const sign = new Text({ text: "SHOP", style: { fill: COLORS.superBarFull, fontSize: 20, fontWeight: "bold" } });
    sign.anchor.set(0.5);
    sign.position.set(0, -101);
    const flag = new Container(); // markers need one; the shop has nothing that waves
    view.addChild(house, sign, flag);

    view.eventMode = "static";
    view.cursor = "pointer";
    view.hitArea = { contains: (x: number, y: number) => x >= -86 && x <= 86 && y >= -152 && y <= 20 };
    view.on("pointertap", (e: FederatedPointerEvent) => {
      e.stopPropagation();
      if (this.menuOpen || this.next) return;
      if (this.focused === node) this.enterNode(node);
      else this.moveTarget = { x: node.x, y: node.y + 60 };
    });
    this.objects.addChild(view);
    this.markers.push({ node, view, flag });
    // Two circles cover the building's footprint; the door side (bottom) stays walkable.
    this.obstacles.push({ x: node.x - 34, y: node.y - 30, r: 40 }, { x: node.x + 34, y: node.y - 30, r: 40 });
  }

  // ---------------------------------------------------------------- coins

  private placeCoins(): void {
    const collected = new Set(currentSave().collectedCoins);
    for (const c of MAP_COINS) {
      if (collected.has(c.id)) continue;
      const view = new Container();
      view.position.set(c.x, c.y);
      view.zIndex = c.y;
      const shadow = new Graphics().ellipse(0, 0, 11, 4).fill({ color: 0x000000, alpha: 0.25 });
      const coin = new Graphics()
        .circle(0, -20, 12)
        .fill(0xffd54f)
        .stroke({ color: 0xb8860b, width: 3 })
        .circle(0, -20, 6)
        .stroke({ color: 0xe6a817, width: 2 })
        .circle(-4, -24, 2.5)
        .fill(0xfff8e1);
      view.addChild(shadow, coin);
      this.objects.addChild(view);
      this.coins.push({ ...c, view });
    }
  }

  private collectCoins(): void {
    for (let i = this.coins.length - 1; i >= 0; i--) {
      const c = this.coins[i];
      if (Math.hypot(c.x - this.player.x, c.y - this.player.y) > COIN_PICKUP_RANGE) continue;
      this.coins.splice(i, 1);
      const save = currentSave();
      save.coins++;
      save.collectedCoins.push(c.id);
      saveGame();
      this.popping.push({ view: c.view, t: 0 });
      this.refreshCoinText();
      const left = MAP_COINS.filter((m) => !save.collectedCoins.includes(m.id)).length;
      this.showToast(left > 0 ? `+1 coin  (${left} left on the map)` : "+1 coin  (found them all!)", 0xffd54f);
      // TODO(audio): coin sound
    }
  }

  private animateCoins(dt: number): void {
    for (const c of this.coins) {
      const coin = c.view.children[1];
      coin.y = Math.sin(this.time * 4 + c.x) * 3; // bob
      coin.scale.x = Math.cos(this.time * 3 + c.y); // spin
    }
    for (let i = this.popping.length - 1; i >= 0; i--) {
      const p = this.popping[i];
      p.t += dt;
      p.view.y -= 120 * dt;
      p.view.alpha = 1 - p.t / 0.35;
      if (p.t >= 0.35) {
        p.view.destroy({ children: true });
        this.popping.splice(i, 1);
      }
    }
  }

  private refreshCoinText(): void {
    this.coinText.text = `Coins: ${currentSave().coins}`;
  }

  private showToast(text: string, color: number): void {
    this.toast.text = text;
    this.toast.style.fill = color;
    this.toastTimer = 2;
  }

  private updateFocus(): void {
    let best: MapNode | undefined;
    let bestD = NODE_RANGE;
    for (const n of [...MAP_NODES, MAP_SHOP]) {
      const d = Math.hypot(n.x - this.player.x, n.y - this.player.y);
      if (d < bestD) {
        best = n;
        bestD = d;
      }
    }
    if (best === this.focused) return;
    this.focused = best;
    this.refreshCard();
  }

  private enterNode(node: MapNode): void {
    if (this.next) return;
    if (node.shop) {
      this.autosave({ x: node.x, y: node.y + 60 }); // come back standing at the door
      this.startFade(() => this.game.changeScene(new ShopScene(this.game, "shop")));
      return;
    }
    if (node.boss === undefined) return;
    const bossIndex = node.boss;
    this.autosave({ x: node.x, y: node.y + 60 }); // come back standing next to this level
    this.startFade(() => this.game.changeScene(new BossFightScene(this.game, bossIndex)));
  }

  private animateMarkers(): void {
    for (const m of this.markers) {
      const active = m.node === this.focused;
      const target = active ? 1.12 : 1;
      const s = m.view.scale.x + (target - m.view.scale.x) * 0.2;
      m.view.scale.set(s);
      m.flag.skew.y = Math.sin(this.time * 3 + m.node.x) * 0.04;
    }
  }

  // ---------------------------------------------------------------- info card

  private buildCard(): void {
    const w = 560;
    const h = 130;
    this.card.position.set(GAME_WIDTH / 2 - w / 2, GAME_HEIGHT - h - 20);
    this.cardBg
      .roundRect(0, 0, w, h, 14)
      .fill({ color: 0x1b140e, alpha: 0.88 })
      .stroke({ color: COLORS.superBarFull, width: 3 });
    this.cardTitle.position.set(24, 14);
    this.cardInfo.position.set(24, 56);
    this.cardPrompt.position.set(24, 92);
    this.card.addChild(this.cardBg, this.cardTitle, this.cardInfo, this.cardPrompt);
    this.card.eventMode = "static";
    this.card.cursor = "pointer";
    this.card.on("pointertap", () => !this.menuOpen && this.focused && this.enterNode(this.focused));
    this.card.visible = false;
  }

  private refreshCard(): void {
    const node = this.focused;
    this.card.visible = node !== undefined;
    if (!node) return;
    if (node.shop) {
      this.cardTitle.text = "Shop";
      this.cardInfo.text = `Weapons and charms for coins. You have ${currentSave().coins}.`;
      this.cardPrompt.text = "Enter / Click to go in";
      this.card.cursor = "pointer";
      return;
    }
    const boss = node.boss !== undefined ? BOSSES[node.boss] : undefined;
    if (!boss) {
      this.cardTitle.text = "???";
      this.cardInfo.text = "This place isn't open yet.";
      this.cardPrompt.text = "Coming soon";
      this.card.cursor = "default";
      return;
    }
    const r = getRecord(boss.name);
    this.cardTitle.text = boss.name;
    if (!r) this.cardInfo.text = "Best attempt: not played yet";
    else if (r.won)
      this.cardInfo.text = `Best grade: ${r.bestGrade}    Best time: ${formatTime(r.bestTime ?? 0)}    Attempts: ${r.attempts}`;
    else this.cardInfo.text = `Best attempt: ${Math.floor(r.bestDamage * 100)}% of boss health    Attempts: ${r.attempts}`;
    this.cardPrompt.text = "Enter / Click to play";
    this.card.cursor = "pointer";
  }

  // ---------------------------------------------------------------- menu

  private buildMenu(): void {
    const dim = new Graphics().rect(0, 0, GAME_WIDTH, GAME_HEIGHT).fill({ color: 0x000000, alpha: 0.5 });
    dim.eventMode = "static"; // swallow clicks
    const title = new Text({ text: "MAP", style: { fill: COLORS.text, fontSize: 64, fontWeight: "bold" } });
    title.anchor.set(0.5);
    title.position.set(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 150);
    this.menu = new MenuList([
      { label: "Resume", onSelect: () => this.setMenu(false) },
      { label: "Save game", onSelect: () => this.manualSave() },
      {
        label: "Equipment",
        onSelect: () => {
          this.autosave();
          this.startFade(() => this.game.changeScene(new ShopScene(this.game, "equip")));
        },
      },
      {
        label: "Settings",
        onSelect: () => {
          this.autosave();
          this.startFade(() => this.game.changeScene(new SettingsScene(this.game, () => new MapScene(this.game))));
        },
      },
      {
        label: "Title screen",
        onSelect: () => {
          this.autosave();
          this.startFade(() => this.game.changeScene(new TitleScene(this.game)));
        },
      },
    ]);
    this.menu.position.set(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 110);
    this.menuOverlay.addChild(dim, title, this.menu);
    this.menuOverlay.visible = false;
  }

  private setMenu(open: boolean): void {
    this.menuOpen = open;
    this.menuOverlay.visible = open;
    this.menu.selected = 0;
  }

  /** Store the player's map position in the save file and write it. */
  private autosave(pos = { x: this.player.x, y: this.player.y }): boolean {
    currentSave().mapPos = { x: Math.round(pos.x), y: Math.round(pos.y) };
    return saveGame();
  }

  private manualSave(): void {
    const ok = this.autosave();
    this.setMenu(false);
    this.showToast(ok ? "Game saved" : "No save file selected", ok ? COLORS.parryable : COLORS.bossBar);
  }

  private startFade(then: () => void): void {
    if (this.next) return;
    this.menuOpen = false;
    this.menuOverlay.visible = false;
    this.fadeTimer = FADE_TIME;
    this.next = then;
  }

  // ---------------------------------------------------------------- camera

  private updateCamera(snap: boolean): void {
    const tx = Math.max(0, Math.min(MAP_W - GAME_WIDTH, this.player.x - GAME_WIDTH / 2));
    const ty = Math.max(0, Math.min(MAP_H - GAME_HEIGHT, this.player.y - GAME_HEIGHT / 2));
    const k = snap ? 1 : 0.12;
    this.world.x += (-tx - this.world.x) * k;
    this.world.y += (-ty - this.world.y) * k;
  }

  // ---------------------------------------------------------------- drawing

  private drawGround(rand: () => number): Graphics {
    const g = new Graphics().rect(0, 0, MAP_W, MAP_H).fill(0x7a9a55);
    for (let i = 0; i < 160; i++) {
      const color = rand() < 0.5 ? 0x6f8f4c : 0x86a660;
      g.ellipse(rand() * MAP_W, rand() * MAP_H, 40 + rand() * 120, 20 + rand() * 50).fill({ color, alpha: 0.6 });
    }
    for (let i = 0; i < 260; i++) {
      const color = [0xfff1a8, 0xf4a6a6, 0xffffff][Math.floor(rand() * 3)];
      g.circle(rand() * MAP_W, rand() * MAP_H, 3).fill(color);
    }
    // Clicking the ground walks there.
    g.eventMode = "static";
    g.on("pointertap", (e: FederatedPointerEvent) => {
      if (this.menuOpen || this.next) return;
      const p = e.getLocalPosition(this.world);
      this.moveTarget = { x: p.x, y: p.y };
      this.stuckTime = 0;
    });
    return g;
  }

  private drawPaths(): Graphics {
    const g = new Graphics();
    const trace = (pts: { x: number; y: number }[]) => {
      g.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length - 1; i++) {
        const mx = (pts[i].x + pts[i + 1].x) / 2;
        const my = (pts[i].y + pts[i + 1].y) / 2;
        g.quadraticCurveTo(pts[i].x, pts[i].y, mx, my);
      }
      const last = pts[pts.length - 1];
      g.lineTo(last.x, last.y);
    };
    const paths = [...MAP_PATHS, SHOP_PATH];
    for (const p of paths) {
      trace(p);
      g.stroke({ color: 0x9c7b4f, width: 58, cap: "round", join: "round" });
    }
    for (const p of paths) {
      trace(p);
      g.stroke({ color: 0xc8a876, width: 46, cap: "round", join: "round" });
    }
    return g;
  }

  private drawLake(): Graphics {
    const g = new Graphics();
    for (const c of LAKE) g.circle(c.x, c.y, c.r + 14).fill(0xcdb98a);
    for (const c of LAKE) g.circle(c.x, c.y, c.r).fill(0x4f86a8);
    for (const c of LAKE) g.circle(c.x - c.r * 0.15, c.y - c.r * 0.15, c.r * 0.6).fill({ color: 0x6aa3c4, alpha: 0.6 });
    for (const c of LAKE) {
      // Small ripple. moveTo first so it isn't joined to the previous shape by a line.
      const cx = c.x + c.r * 0.2;
      const cy = c.y + c.r * 0.1;
      g.moveTo(cx + 14 * Math.cos(Math.PI * 1.15), cy + 14 * Math.sin(Math.PI * 1.15))
        .arc(cx, cy, 14, Math.PI * 1.15, Math.PI * 1.85)
        .stroke({ color: 0xffffff, width: 3, alpha: 0.5 });
      this.obstacles.push({ x: c.x, y: c.y, r: c.r - 6 });
    }
    return g;
  }

  /** Scatter trees, dense along the border and sparse inside, never on paths or water. */
  private placeScenery(rand: () => number): void {
    const step = 95;
    for (let y = 40; y < MAP_H + 60; y += step) {
      for (let x = 30; x < MAP_W + 40; x += step) {
        const px = x + (rand() - 0.5) * step * 0.8;
        const py = y + (rand() - 0.5) * step * 0.8;
        const edge = Math.min(px, py, MAP_W - px, MAP_H - py);
        const keep = edge < 150 ? 0.95 : 0.16;
        const r1 = rand();
        const r2 = rand();
        if (r1 > keep || !this.isOpen(px, py)) continue;
        // These spots used to hold drawn rocks. Skip them, but still draw the number the rock used
        // so the trees after it stay where they were.
        if (r2 < 0.15 && edge > 150) rand();
        else if (this.isReserved(px, py)) {
          // Skip, but use up addTree's 2 random numbers so every later tree stays where it was.
          rand();
          rand();
        } else this.addTree(px, py, rand);
      }
    }
  }

  private isOpen(x: number, y: number): boolean {
    for (const path of MAP_PATHS) {
      for (let i = 0; i < path.length - 1; i++) {
        if (distToSegment(x, y, path[i], path[i + 1]) < PATH_CLEARANCE) return false;
      }
    }
    for (const n of [...MAP_NODES, MAP_START]) if (Math.hypot(n.x - x, n.y - y) < 200) return false;
    for (const c of LAKE) if (Math.hypot(c.x - x, c.y - y) < c.r + 50) return false;
    return true;
  }

  /** Spots added after the tree layout was made (shop, its path, coins): kept clear separately. */
  private isReserved(x: number, y: number): boolean {
    if (Math.hypot(MAP_SHOP.x - x, MAP_SHOP.y - y) < 200) return true;
    for (let i = 0; i < SHOP_PATH.length - 1; i++) {
      if (distToSegment(x, y, SHOP_PATH[i], SHOP_PATH[i + 1]) < PATH_CLEARANCE) return true;
    }
    return MAP_COINS.some((c) => Math.hypot(c.x - x, c.y - y) < COIN_CLEARANCE);
  }

  private addTree(x: number, y: number, rand: () => number): void {
    const s = 0.85 + rand() * 0.45;
    const flip = rand() < 0.5 ? -1 : 1; // mirror some trees for variety
    const t = new Sprite(image("tree1"));
    t.texture.source.scaleMode = "nearest"; // pixel art: keep it crisp when scaled up
    t.anchor.set(0.5, TREE_BASE_Y); // the trunk base / shadow center sits on (x, y)
    t.scale.set(s * TREE_SCALE * flip, s * TREE_SCALE);
    t.position.set(x, y);
    t.zIndex = y;
    this.objects.addChild(t);
    this.obstacles.push({ x, y: y - 4, r: 18 * s });
    // Opaque part of Tree1.png is x 33..94, y 25..102 of 128px, anchored at (64, 94).
    const k = s * TREE_SCALE;
    this.sceneryBoxes.push({ x0: x - 31 * k, x1: x + 31 * k, y0: y - 69 * k, y1: y + 8 * k });
  }

  /**
   * Scatter sprites at random open spots, never overlapping trees, rocks or bushes already placed.
   * `solid` ones also block the player.
   */
  private scatter(defs: ScatterDef[], count: number, rand: () => number, solid: boolean): void {
    let placed = 0;
    for (let attempt = 0; attempt < count * 40 && placed < count; attempt++) {
      const x = 40 + rand() * (MAP_W - 80);
      const y = 60 + rand() * (MAP_H - 90);
      const def = defs[Math.floor(rand() * defs.length)];
      const k = def.scale * (0.85 + rand() * 0.3);
      const flip = rand() < 0.5 ? -1 : 1;
      if (!this.isOpen(x, y) || this.isReserved(x, y)) continue;

      // Anchor at the bottom-center of the visible pixels so the sprite sits on (x, y).
      const ax = (def.minX + def.maxX + 1) / 2;
      const ay = def.maxY + 1;
      const half = ((def.maxX - def.minX + 1) / 2) * k;
      const height = (ay - def.minY) * k;
      const box = { x0: x - half, x1: x + half, y0: y - height, y1: y };
      if (this.sceneryBoxes.some((b) => overlaps(b, box, SCENERY_GAP))) continue;
      // Collide with the lower part (the base), so the player can still pass behind the top.
      if (solid) this.obstacles.push({ x, y: y - height * 0.3, r: half * 0.8 });

      const b = new Sprite(image(def.name));
      b.texture.source.scaleMode = "nearest";
      b.anchor.set(ax / def.size, ay / def.size);
      b.scale.set(k * flip, k);
      b.position.set(x, y);
      b.zIndex = y;
      this.objects.addChild(b);
      this.sceneryBoxes.push(box);
      placed++;
    }
  }

}

function overlaps(a: Box, b: Box, gap: number): boolean {
  return a.x0 - gap < b.x1 && b.x0 - gap < a.x1 && a.y0 - gap < b.y1 && b.y0 - gap < a.y1;
}

function distToSegment(px: number, py: number, a: { x: number; y: number }, b: { x: number; y: number }): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const t = Math.max(0, Math.min(1, ((px - a.x) * dx + (py - a.y) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - (a.x + t * dx), py - (a.y + t * dy));
}

/** Small seeded RNG so the scenery looks the same on every visit. */
function mulberry32(seed: number): () => number {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
