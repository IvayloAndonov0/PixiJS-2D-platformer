import { AnimatedSprite, Container, Graphics, Sprite, Text, type FederatedPointerEvent } from "pixi.js";
import { anim, image } from "../assets";
import { BOSSES } from "../bosses";
import { COLORS, GAME_HEIGHT, GAME_WIDTH } from "../config";
import { formatTime, getRecord } from "../core/Progress";
import { currentSave, saveGame } from "../core/SaveSystem";
import { Scene } from "../core/Scene";
import { LAKE, MAP_H, MAP_NODES, MAP_PATHS, MAP_START, MAP_W, type MapNode } from "../level/overworld";
import { MenuList } from "../ui/MenuList";
import { BossFightScene } from "./BossFightScene";
import { SettingsScene } from "./SettingsScene";
import { TitleScene } from "./TitleScene";

const WALK_SPEED = 280; // px/s
const FEET_R = 14; // player collision radius
const NODE_RANGE = 95; // how close you must be to a level marker to enter it
const PATH_CLEARANCE = 70; // keep trees this far from path centerlines
const FADE_TIME = 0.35;
const TREE_SCALE = 1.3; // Tree1.png is 128px; this makes it roughly the size of the old drawn trees
const TREE_BASE_Y = 94 / 128; // shadow center in Tree1.png, as a fraction of its height

interface Circle {
  x: number;
  y: number;
  r: number;
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
  private markers: { node: MapNode; view: Container; flag: Container }[] = [];
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
    MAP_NODES.forEach((n) => this.addMarker(n));
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

    this.toast.anchor.set(1, 0);
    this.toast.position.set(GAME_WIDTH - 16, 10);

    this.fade.alpha = 1; // fade in
    this.addChild(this.world, hint, this.card, this.menuOverlay, this.toast, this.fade);
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
    this.updateFocus();
    if (this.focused && (input.menuPressed("confirm") || input.wasPressed("jump"))) this.enterNode(this.focused);

    this.updateCamera(false);
    this.animateMarkers();
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

  private updateFocus(): void {
    let best: MapNode | undefined;
    let bestD = NODE_RANGE;
    for (const n of MAP_NODES) {
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
    if (node.boss === undefined || this.next) return;
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
    this.menu.position.set(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 90);
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
    this.toast.text = ok ? "Game saved" : "No save file selected";
    this.toast.style.fill = ok ? COLORS.parryable : COLORS.bossBar;
    this.toastTimer = 2;
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
    for (const p of MAP_PATHS) {
      trace(p);
      g.stroke({ color: 0x9c7b4f, width: 58, cap: "round", join: "round" });
    }
    for (const p of MAP_PATHS) {
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

  /** Scatter trees and rocks, dense along the border and sparse inside, never on paths or water. */
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
        if (r2 < 0.15 && edge > 150) this.addRock(px, py, rand);
        else this.addTree(px, py, rand);
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
  }

  private addRock(x: number, y: number, rand: () => number): void {
    const s = 0.7 + rand() * 0.6;
    const r = new Graphics()
      .ellipse(0, 2, 30, 10)
      .fill({ color: 0x000000, alpha: 0.2 })
      .ellipse(0, -10, 28, 18)
      .fill(0x8a8577)
      .ellipse(-6, -16, 12, 7)
      .fill(0xa8a394);
    r.scale.set(s);
    r.position.set(x, y);
    r.zIndex = y;
    this.objects.addChild(r);
    this.obstacles.push({ x, y: y - 6, r: 22 * s });
  }
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
