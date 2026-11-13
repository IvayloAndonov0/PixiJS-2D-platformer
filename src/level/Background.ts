import { Container, Graphics, Sprite, TilingSprite } from "pixi.js";
import { frame, image } from "../assets";
import { GAME_HEIGHT, GAME_WIDTH, GROUND_Y } from "../config";

/**
 * Screen-space level backgrounds: a sky gradient plus parallax layers, drawn in code.
 * Each level picks a theme in bosses.ts (`background`).
 *
 * Call update(cameraX) when the camera moves and tick(dt) every frame (weather, particles...).
 *
 * Parallax: a layer with factor f moves f times as fast as the world (0 = glued to the screen,
 * 1 = moves with the world). Layers are drawn wide enough for the longest parkour run.
 */
export type BackgroundTheme = "hills" | "storm" | "quarry" | "arcane" | "eclipse";

/** Optional per-theme colours for platforms, spikes and the arena gate (default: the global COLORS). */
export interface ThemeColors {
  ground: number;
  top: number;
  platform?: number;
  movingPlatform?: number;
  platformTop?: number;
  spikes?: number;
  gate?: number;
  gateBand?: number;
}

/** Floor colours that match each theme (body, top edge). */
export const GROUND_COLORS: Record<BackgroundTheme, ThemeColors> = {
  hills: { ground: 0x5a4632, top: 0xc8a97e },
  storm: { ground: 0x2f3b45, top: 0x7d93a3 },
  quarry: { ground: 0x6b4128, top: 0xd59a5e },
  arcane: { ground: 0x2c2244, top: 0x9f8ad6 },
  // Same palette as the boss art: deep violet, gold rim light, lavender glow.
  eclipse: {
    ground: 0x1a1030,
    top: 0xd4a24a,
    platform: 0x45306f,
    movingPlatform: 0x6a4bb0,
    platformTop: 0xe2b45c,
    spikes: 0xcfa6ff,
    gate: 0x241538,
    gateBand: 0x4a2d73,
  },
};

/** Furthest the camera goes left (the longest parkour starts at about -3600). */
const WORLD_LEFT = -4200;

/** Hills image: 1672x941 with the art between y=335 and y=823 (transparent above and below). */
const HILLS_SCALE = 0.8;
const HILLS_ART_BOTTOM = 823;

interface Layer {
  view: Container;
  factor: number;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  phase: number;
  color: number;
}

export class Background extends Container {
  private layers: Layer[] = [];
  private tiling?: { sprite: TilingSprite; factor: number };
  private time = 0;
  private cameraX = 0;
  private rand: () => number;

  // Animated bits (only some themes use each)
  private particles: Particle[] = [];
  private particleGfx = new Graphics();
  private particleStyle: "rain" | "dot" | "spark" = "dot";
  private twinkle: Graphics[] = [];
  private bobbers: { view: Container; baseY: number; phase: number; amp: number }[] = [];
  private flash = new Graphics().rect(0, 0, GAME_WIDTH, GAME_HEIGHT).fill(0xffffff);
  private bolt = new Graphics();
  private lightningTimer = 3;
  private aurora?: Graphics;
  /** Ridge outlines (x, y pairs) so decorations can sit on top of them. */
  private outlines = new WeakMap<Graphics, number[]>();
  private corona?: Sprite;
  private halo?: Graphics;

  constructor(private theme: BackgroundTheme = "hills") {
    super();
    this.rand = mulberry32(theme.length * 7919 + 13);
    this.flash.alpha = 0;
    switch (theme) {
      case "storm":
        this.buildStorm();
        break;
      case "quarry":
        this.buildQuarry();
        break;
      case "arcane":
        this.buildArcane();
        break;
      case "eclipse":
        this.buildEclipse();
        break;
      default:
        this.buildHills();
    }
    if (!this.particleGfx.parent) this.addChild(this.particleGfx);
  }

  update(cameraX: number): void {
    this.cameraX = cameraX;
    for (const l of this.layers) l.view.x = -cameraX * l.factor;
    if (this.tiling) this.tiling.sprite.tilePosition.x = -cameraX * this.tiling.factor;
  }

  tick(dt: number): void {
    this.time += dt;
    for (const [i, g] of this.twinkle.entries()) g.alpha = 0.45 + 0.55 * Math.abs(Math.sin(this.time * (0.8 + i * 0.37) + i));
    for (const b of this.bobbers) b.view.y = b.baseY + Math.sin(this.time * 0.9 + b.phase) * b.amp;
    if (this.corona) this.corona.rotation += dt * 0.05;
    if (this.halo) this.halo.rotation -= dt * 0.03;
    if (this.aurora) this.drawAurora();
    if (this.theme === "storm") this.updateLightning(dt);
    this.updateParticles(dt);
  }

  // ---------------------------------------------------------------- themes

  private buildHills(): void {
    this.addChild(skyGradient(0x1f1418, 0x6b4a4f));
    const tex = image("hills");
    const sprite = new TilingSprite({ texture: tex, width: GAME_WIDTH, height: tex.height * HILLS_SCALE });
    sprite.tileScale.set(HILLS_SCALE);
    sprite.y = GROUND_Y + 12 - HILLS_ART_BOTTOM * HILLS_SCALE; // bottom of the art tucks under the floor
    this.addChild(sprite);
    this.tiling = { sprite, factor: 0.3 };
  }

  /** Storm Crow: stormy night, cloud banks, cliffs with pines, rain and lightning. */
  private buildStorm(): void {
    this.addChild(skyGradient(0x0b1426, 0x3d5a78));

    const clouds = this.layer(0.04);
    const [cl, cr] = this.span(0.04);
    for (let i = 0; i < 70; i++) {
      const x = cl + this.rand() * (cr - cl);
      const y = 40 + this.rand() * 200;
      const w = 120 + this.rand() * 220;
      clouds.ellipse(x, y, w, 28 + this.rand() * 30).fill({ color: this.rand() < 0.5 ? 0x1a2740 : 0x2a3d5c, alpha: 0.85 });
    }
    this.addChild(this.bolt); // lightning sits behind the mountains

    this.ridge(0.12, { base: 470, amp: 120, step: 60, jag: 40, color: 0x22324a });
    const cliffs = this.ridge(0.3, { base: 560, amp: 80, step: 40, jag: 30, color: 0x162131 });
    this.pines(cliffs, 0.3, 0x0f1824);
    this.ridge(0.5, { base: 620, amp: 40, step: 50, jag: 16, color: 0x0d1520 });

    this.particleStyle = "rain";
    for (let i = 0; i < 160; i++) {
      this.particles.push({
        x: this.rand() * GAME_WIDTH,
        y: this.rand() * GAME_HEIGHT,
        vx: -160,
        vy: 900 + this.rand() * 300,
        size: 10 + this.rand() * 12,
        phase: 0,
        color: 0x9ec5e8,
      });
    }
    this.addChild(this.particleGfx, this.flash); // rain under the lightning flash, so the flash lights it too
  }

  /** Iron Golem: dusty sunset over layered mesas, mine scaffolding in front. */
  private buildQuarry(): void {
    this.addChild(skyGradient(0x2c1610, 0xe7934a));

    const sun = this.layer(0.02);
    for (let r = 220; r > 90; r -= 26) sun.circle(880, 400, r).fill({ color: 0xffc56b, alpha: 0.07 });
    sun.circle(880, 400, 90).fill(0xffd98a);

    this.mesas(0.1, 470, 0x8a5233, 0x7a4429);
    this.mesas(0.22, 540, 0x60361f, 0x4f2b18);
    const near = this.ridge(0.4, { base: 610, amp: 30, step: 70, jag: 20, color: 0x3a2214 });
    this.scaffolds(near, 0.4, 0x24150c);

    this.particleStyle = "dot";
    for (let i = 0; i < 70; i++) {
      this.particles.push({
        x: this.rand() * GAME_WIDTH,
        y: 200 + this.rand() * 440,
        vx: 30 + this.rand() * 40,
        vy: (this.rand() - 0.5) * 10,
        size: 1.5 + this.rand() * 2.5,
        phase: this.rand() * 10,
        color: 0xf5cfa0,
      });
    }
  }

  /** Hex Wizard: starry night, crescent moon, wizard towers, floating crystal islands. */
  private buildArcane(): void {
    this.addChild(skyGradient(0x0b0620, 0x40206a));
    this.stars(0.02, 180, 0xffffff);

    const moon = this.layer(0.03);
    moon.circle(260, 150, 70).fill({ color: 0xd9ccff, alpha: 0.12 });
    moon.circle(260, 150, 52).fill(0xece4ff);
    moon.circle(284, 136, 46).fill(0x150a2c); // bite out of it -> crescent

    this.towers(0.1, 0x1c1036, 0xffd27a);
    this.ridge(0.18, { base: 560, amp: 70, step: 70, jag: 25, color: 0x23153f });
    this.islands(0.3);
    this.ridge(0.45, { base: 625, amp: 30, step: 60, jag: 12, color: 0x150c28 });

    this.particleStyle = "spark";
    for (let i = 0; i < 60; i++) {
      this.particles.push({
        x: this.rand() * GAME_WIDTH,
        y: this.rand() * GAME_HEIGHT,
        vx: (this.rand() - 0.5) * 20,
        vy: -(20 + this.rand() * 40),
        size: 1.5 + this.rand() * 2,
        phase: this.rand() * 10,
        color: this.rand() < 0.5 ? 0xc59bff : 0x8ff0ff,
      });
    }
  }

  /**
   * Eclipse Heart: violet night, the black sun overhead, aurora, ruins, embers.
   * Palette (matches the boss sprites): deep violet for the sky and silhouettes, lavender glow,
   * and gold only as the accent (sun rim, stars, cracks, embers).
   */
  private buildEclipse(): void {
    this.addChild(skyGradient(0x07040f, 0x3b1556));
    this.stars(0.02, 140, 0xffe3b0);

    const glow = this.layer(0.03);
    for (let r = 330; r > 120; r -= 30) glow.circle(640, 200, r).fill({ color: 0x8a3fd0, alpha: 0.05 });
    glow.circle(640, 200, 150).stroke({ color: 0xffc46b, width: 2, alpha: 0.18 }); // faint gold rim
    // Graphics can't have children in Pixi v8, so the sun sprite is its own layer.
    this.corona = new Sprite(frame("eclipse", "OrbBig"));
    this.corona.anchor.set(0.5);
    this.corona.scale.set(2.3);
    this.corona.position.set(640, 200);
    const sunLayer = new Container(); // parallax moves the layer, the sprite keeps its own position
    this.halo = this.makeHalo();
    this.halo.position.set(640, 200);
    sunLayer.addChild(this.halo, this.corona);
    this.addChild(sunLayer);
    this.layers.push({ view: sunLayer, factor: 0.03 });

    this.aurora = new Graphics();
    this.aurora.alpha = 0.5;
    this.addChild(this.aurora);

    // Far, plain ruins -> violet mist -> near, detailed ruins -> floating shards -> thorned rocks.
    this.ruins(0.08, 0x1b0e30, { scale: 1.25, detail: false });
    this.mist();
    this.ruins(0.15, 0x26143f, { scale: 1, detail: true });
    this.shards(0.22);
    const rocks = this.ridge(0.3, { base: 580, amp: 70, step: 36, jag: 40, color: 0x170b28 });
    this.cracks(rocks, 0.3);
    this.thorns(rocks, 0.3, 0x1f1035);
    this.ridge(0.5, { base: 630, amp: 25, step: 40, jag: 18, color: 0x0f0719 });

    this.particleStyle = "spark";
    for (let i = 0; i < 80; i++) {
      this.particles.push({
        x: this.rand() * GAME_WIDTH,
        y: this.rand() * GAME_HEIGHT,
        vx: (this.rand() - 0.5) * 30,
        vy: -(30 + this.rand() * 60),
        size: 1.5 + this.rand() * 2.5,
        phase: this.rand() * 10,
        color: this.rand() < 0.5 ? 0xffc46b : 0xb36bff,
      });
    }
  }

  // ---------------------------------------------------------------- layer builders

  /** A parallax layer (Graphics) added on top of what's there so far. */
  private layer(factor: number): Graphics {
    const g = new Graphics();
    this.addChild(g);
    this.layers.push({ view: g, factor });
    return g;
  }

  /** Local x range a layer must cover so it never runs out on screen. */
  private span(factor: number): [number, number] {
    return [WORLD_LEFT * factor - 100, GAME_WIDTH + 100];
  }

  /** Mountain/cliff silhouette. Returns the layer so more can be drawn on it. */
  private ridge(factor: number, o: { base: number; amp: number; step: number; jag: number; color: number }): Graphics {
    const g = this.layer(factor);
    const [l, r] = this.span(factor);
    const p1 = this.rand() * 10;
    const p2 = this.rand() * 10;
    const pts: number[] = [l, GAME_HEIGHT];
    for (let x = l; x <= r + o.step; x += o.step) {
      const smooth = Math.sin(x * 0.004 + p1) * 0.6 + Math.sin(x * 0.011 + p2) * 0.4;
      pts.push(x, o.base - (smooth * 0.5 + 0.5) * o.amp - this.rand() * o.jag);
    }
    pts.push(r + o.step, GAME_HEIGHT);
    g.poly(pts).fill(o.color);
    this.outlines.set(g, pts); // so decorations can sit on it
    return g;
  }

  /** y of a ridge's outline at x. `g` must come from ridge(). */
  private ridgeY(g: Graphics, x: number): number {
    const pts = this.outlines.get(g);
    if (!pts) throw new Error("ridgeY() needs a layer made by ridge()");
    for (let i = 2; i < pts.length - 2; i += 2) {
      const x0 = pts[i];
      const x1 = pts[i + 2];
      if (x >= x0 && x <= x1) return pts[i + 1] + ((pts[i + 3] - pts[i + 1]) * (x - x0)) / (x1 - x0 || 1);
    }
    return GROUND_Y;
  }

  private pines(on: Graphics, factor: number, color: number): void {
    const [l, r] = this.span(factor);
    for (let x = l; x < r; x += 30 + this.rand() * 90) {
      const y = this.ridgeY(on, x) + 4;
      const h = 30 + this.rand() * 40;
      const w = h * 0.35;
      on.poly([x - w, y, x, y - h, x + w, y]).fill(color);
      on.poly([x - w * 0.8, y - h * 0.35, x, y - h * 1.1, x + w * 0.8, y - h * 0.35]).fill(color);
    }
  }

  /** Flat-topped rock plateaus with strata lines. */
  private mesas(factor: number, base: number, color: number, strata: number): void {
    const g = this.layer(factor);
    const [l, r] = this.span(factor);
    let x = l;
    while (x < r) {
      const w = 160 + this.rand() * 260;
      const h = 60 + this.rand() * 130;
      const slope = 30 + this.rand() * 40;
      const top = base - h;
      g.poly([x, GAME_HEIGHT, x, base, x + slope, top, x + w - slope, top, x + w, base, x + w, GAME_HEIGHT]).fill(color);
      for (let y = top + 18; y < base; y += 16 + this.rand() * 14) {
        const inset = slope * (1 - (y - top) / (base - top));
        g.rect(x + inset, y, w - inset * 2, 4).fill({ color: strata, alpha: 0.7 });
      }
      x += w - 20 + this.rand() * 80;
    }
  }

  /** Wooden mine scaffolds standing on a ridge. */
  private scaffolds(on: Graphics, factor: number, color: number): void {
    const [l, r] = this.span(factor);
    for (let x = l + 100; x < r; x += 380 + this.rand() * 420) {
      const y = this.ridgeY(on, x) + 6;
      const h = 110 + this.rand() * 60;
      const w = 70;
      on.rect(x, y - h, 8, h).fill(color).rect(x + w, y - h, 8, h).fill(color);
      for (let k = 0; k < 3; k++) {
        const yy = y - h + (k * h) / 3;
        on.rect(x, yy, w + 8, 6).fill(color);
        on.moveTo(x + 4, yy + 6).lineTo(x + w + 4, yy + h / 3).stroke({ color, width: 4 });
      }
      // Crane arm + rope + bucket
      on.rect(x + w, y - h - 6, 90, 8).fill(color);
      on.moveTo(x + w + 84, y - h).lineTo(x + w + 84, y - h + 60).stroke({ color, width: 2 });
      on.rect(x + w + 74, y - h + 60, 20, 16).fill(color);
    }
  }

  private stars(factor: number, count: number, color: number): void {
    // Split across a few Graphics so they twinkle out of sync.
    const groups = [new Graphics(), new Graphics(), new Graphics()];
    const holder = new Container();
    holder.addChild(...groups);
    this.addChild(holder);
    this.layers.push({ view: holder, factor });
    const [l, r] = this.span(factor);
    for (let i = 0; i < count; i++) {
      const g = groups[i % groups.length];
      const s = this.rand() < 0.1 ? 2.4 : 1.2;
      g.circle(l + this.rand() * (r - l), this.rand() * 430, s).fill(color);
    }
    this.twinkle.push(...groups);
  }

  /** Distant wizard towers with glowing windows. */
  private towers(factor: number, color: number, light: number): void {
    const g = this.layer(factor);
    const [l, r] = this.span(factor);
    for (let x = l; x < r; x += 140 + this.rand() * 260) {
      const w = 30 + this.rand() * 30;
      const h = 140 + this.rand() * 200;
      const base = 560;
      g.rect(x, base - h, w, h).fill(color);
      g.poly([x - 10, base - h, x + w / 2, base - h - 50 - this.rand() * 40, x + w + 10, base - h]).fill(color);
      for (let k = 0; k < 3; k++) {
        if (this.rand() < 0.6) g.rect(x + w / 2 - 3, base - h + 20 + k * 40, 6, 12).fill({ color: light, alpha: 0.8 });
      }
    }
  }

  /** Floating rock islands with crystals; they bob gently. */
  private islands(factor: number): void {
    const holder = new Container();
    this.addChild(holder);
    this.layers.push({ view: holder, factor });
    const [l, r] = this.span(factor);
    for (let x = l + 80; x < r; x += 260 + this.rand() * 300) {
      const g = new Graphics();
      const w = 70 + this.rand() * 80;
      g.poly([-w, 0, w, 0, w * 0.4, 30, 0, 70 + this.rand() * 40, -w * 0.5, 34]).fill(0x2e1d50);
      g.rect(-w, -6, w * 2, 8).fill(0x4d3a7a);
      for (let k = 0; k < 3; k++) {
        const cx = -w * 0.6 + this.rand() * w * 1.2;
        const ch = 14 + this.rand() * 22;
        g.poly([cx - 6, -4, cx, -4 - ch, cx + 6, -4]).fill({ color: this.rand() < 0.5 ? 0x8ff0ff : 0xc59bff, alpha: 0.9 });
      }
      const baseY = 260 + this.rand() * 200;
      g.position.set(x, baseY);
      holder.addChild(g);
      this.bobbers.push({ view: g, baseY, phase: this.rand() * 6, amp: 6 + this.rand() * 8 });
    }
  }

  /**
   * Gothic ruins: lancet arches (some broken), columns with capitals, and spires topped with a
   * crescent and a small sun. `detail: false` gives plain silhouettes for the far layer.
   */
  private ruins(factor: number, color: number, o: { scale: number; detail: boolean }): void {
    const g = this.layer(factor);
    const [l, r] = this.span(factor);
    const rim = 0xe2b45c;
    const base = 610;
    const k = o.scale;
    const rimLine = (x0: number, y0: number, x1: number, y1: number) => {
      if (o.detail) g.moveTo(x0, y0).lineTo(x1, y1).stroke({ color: rim, width: 1.5, alpha: 0.4 });
    };

    for (let x = l; x < r; x += (150 + this.rand() * 230) * k) {
      const kind = this.rand();
      if (kind < 0.3) {
        // Lancet arch on two piers; sometimes one side has collapsed.
        const span = (90 + this.rand() * 40) * k;
        const pier = 22 * k;
        const h = (130 + this.rand() * 90) * k;
        const top = base - h;
        const x1 = x + span;
        g.rect(x - pier, top, pier, h).fill(color).rect(x1, top, pier, h).fill(color);
        g.rect(x - pier - 5, top - 9, pier + 10, 9).fill(color).rect(x1 - 5, top - 9, pier + 10, 9).fill(color); // capitals
        g.rect(x - pier - 5, base - 12, pier + 10, 12).fill(color).rect(x1 - 5, base - 12, pier + 10, 12).fill(color); // bases
        const broken = this.rand() < 0.35;
        const maxPhi = Math.PI / 3; // 60 degrees = pointed apex
        const pts: [number, number][] = [];
        const leftEnd = broken ? maxPhi * (0.3 + this.rand() * 0.4) : maxPhi;
        for (let i = 0; i <= 8; i++) {
          const phi = (leftEnd * i) / 8;
          pts.push([x1 - span * Math.cos(phi), top - 9 - span * Math.sin(phi)]);
        }
        if (!broken) {
          for (let i = 7; i >= 0; i--) {
            const phi = (maxPhi * i) / 8;
            pts.push([x + span * Math.cos(phi), top - 9 - span * Math.sin(phi)]);
          }
        }
        const stroke = (dy: number, width: number, c: number, alpha: number) => {
          g.moveTo(pts[0][0], pts[0][1] + dy);
          for (const [px, py] of pts) g.lineTo(px, py + dy);
          g.stroke({ color: c, width, alpha });
        };
        stroke(0, 15 * k, color, 1);
        if (o.detail) stroke(-6 * k, 1.5, rim, 0.4);
        rimLine(x - pier - 5, top - 9, x - 5, top - 9);
        rimLine(x1 - 5, top - 9, x1 + pier + 5, top - 9);
      } else if (kind < 0.7) {
        // A cluster of columns, some snapped off.
        const n = 1 + Math.floor(this.rand() * 3);
        let cx = x;
        for (let c = 0; c < n; c++) {
          const w = (26 + this.rand() * 12) * k;
          const h = (90 + this.rand() * 170) * k;
          const top = base - h;
          const snapped = this.rand() < 0.5;
          if (snapped) {
            const cut = 8 + this.rand() * 26;
            g.poly([cx, base, cx, top, cx + w * 0.55, top - cut * 0.3, cx + w, top + cut, cx + w, base]).fill(color);
            g.poly([cx + w + 6, base, cx + w + 12, base - 14 * k, cx + w + 30 * k, base - 8 * k, cx + w + 34 * k, base]).fill(color); // fallen chunk
            rimLine(cx, top, cx + w * 0.55, top - cut * 0.3);
          } else {
            g.rect(cx, top, w, h).fill(color);
            g.rect(cx - 5, top - 10, w + 10, 10).fill(color); // capital
            g.rect(cx - 4, base - 12, w + 8, 12).fill(color); // base
            rimLine(cx - 5, top - 10, cx + w + 5, top - 10);
          }
          if (o.detail && h > 150 && this.rand() < 0.6) {
            g.rect(cx + w / 2 - 2, top + 26, 4, 22).fill({ color: 0xb36bff, alpha: 0.55 }); // lit slit window
          }
          cx += w + 14 * k;
        }
      } else {
        // Spire topped with a crescent and a tiny black sun.
        const w = (36 + this.rand() * 14) * k;
        const h = (170 + this.rand() * 110) * k;
        const top = base - h;
        const tip = top - 70 * k;
        g.poly([x, base, x, top, x + w / 2, tip, x + w, top, x + w, base]).fill(color);
        g.rect(x - 6, base - 14, w + 12, 14).fill(color);
        if (o.detail) {
          const mx = x + w / 2;
          const my = tip - 16;
          g.arc(mx, my, 13, Math.PI * 0.12, Math.PI * 0.88).stroke({ color: rim, width: 2.5, alpha: 0.7 });
          g.circle(mx, my - 3, 4.5).fill({ color: 0x07040f }).circle(mx, my - 3, 4.5).stroke({ color: rim, width: 1.5, alpha: 0.8 });
          g.moveTo(x, top).lineTo(x + w / 2, tip).stroke({ color: rim, width: 1.5, alpha: 0.35 });
          g.rect(x + w / 2 - 2, top + 30, 4, 30).fill({ color: 0xb36bff, alpha: 0.55 });
        }
      }
    }
  }

  /** The boss's crown: gold rings and four-pointed star spikes behind the black sun. */
  private makeHalo(): Graphics {
    const g = new Graphics();
    g.circle(0, 0, 215).stroke({ color: 0xffc46b, width: 2, alpha: 0.28 });
    g.circle(0, 0, 250).stroke({ color: 0xb36bff, width: 3, alpha: 0.22 });
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4;
      const long = i % 2 === 0;
      const len = long ? 330 : 255;
      const half = long ? 9 : 5;
      const [c, s] = [Math.cos(a), Math.sin(a)];
      g.poly([c * 120 - s * half, s * 120 + c * half, c * len, s * len, c * 120 + s * half, s * 120 - c * half]).fill({
        color: long ? 0xffc46b : 0xb36bff,
        alpha: long ? 0.28 : 0.2,
      });
    }
    return g;
  }

  /** Soft violet mist between the ruin layers (screen-space, so it does not scroll). */
  private mist(): void {
    const g = new Graphics();
    for (let i = 0; i < 8; i++) g.rect(0, 470 + i * 20, GAME_WIDTH, 20).fill({ color: 0x6a2fa0, alpha: 0.045 });
    this.addChild(g);
  }

  /** Dark crystal shards drifting in the air, like the ones orbiting the boss. */
  private shards(factor: number): void {
    const holder = new Container();
    this.addChild(holder);
    this.layers.push({ view: holder, factor });
    const [l, r] = this.span(factor);
    for (let x = l + 40; x < r; x += 90 + this.rand() * 170) {
      const g = new Graphics();
      const h = 12 + this.rand() * 26;
      const w = h * (0.28 + this.rand() * 0.15);
      g.poly([0, -h, w, 0, 0, h * 0.7, -w, 0]).fill(0x2a1647);
      g.poly([0, -h, w, 0, 0, h * 0.7, -w, 0]).stroke({ color: this.rand() < 0.6 ? 0xb36bff : 0xe2b45c, width: 1.5, alpha: 0.55 });
      g.rotation = (this.rand() - 0.5) * 1.2;
      const baseY = 120 + this.rand() * 330;
      g.position.set(x, baseY);
      holder.addChild(g);
      this.bobbers.push({ view: g, baseY, phase: this.rand() * 6, amp: 5 + this.rand() * 9 });
    }
  }

  /** Jagged crystal thorns growing out of a rock ridge, with a faint violet edge light. */
  private thorns(on: Graphics, factor: number, color: number): void {
    const [l, r] = this.span(factor);
    for (let x = l; x < r; x += 26 + this.rand() * 60) {
      const y = this.ridgeY(on, x) + 3;
      const h = 18 + this.rand() * 38;
      const w = 5 + this.rand() * 7;
      const lean = (this.rand() - 0.5) * 14;
      on.poly([x - w, y, x + lean, y - h, x + w, y]).fill(color);
      on.moveTo(x - w, y).lineTo(x + lean, y - h).stroke({ color: 0xb36bff, width: 1, alpha: 0.4 });
    }
  }

  /** Glowing purple cracks on a rock ridge. */
  private cracks(on: Graphics, factor: number): void {
    const [l, r] = this.span(factor);
    for (let x = l; x < r; x += 80 + this.rand() * 160) {
      let cx = x;
      let cy = this.ridgeY(on, x) + 14;
      on.moveTo(cx, cy);
      for (let k = 0; k < 4; k++) {
        cx += (this.rand() - 0.5) * 24;
        cy += 12 + this.rand() * 14;
        on.lineTo(cx, cy);
      }
      on.stroke({ color: 0xe8a84a, width: 2, alpha: 0.55 });
    }
  }

  // ---------------------------------------------------------------- animation

  private drawAurora(): void {
    const g = this.aurora!;
    g.clear();
    const bands = [
      { y: 110, color: 0x9b4dca, amp: 18, alpha: 0.18 },
      { y: 160, color: 0xd9a441, amp: 12, alpha: 0.09 },
    ];
    for (const [i, b] of bands.entries()) {
      const pts: number[] = [];
      for (let x = -20; x <= GAME_WIDTH + 20; x += 40) {
        pts.push(x, b.y + Math.sin(x * 0.006 + this.time * 0.6 + i * 2) * b.amp + Math.sin(x * 0.017 - this.time * 0.4) * 6);
      }
      for (let x = GAME_WIDTH + 20; x >= -20; x -= 40) {
        pts.push(x, b.y + 26 + Math.sin(x * 0.006 + this.time * 0.6 + i * 2 + 0.6) * b.amp);
      }
      g.poly(pts).fill({ color: b.color, alpha: b.alpha });
    }
  }

  private updateLightning(dt: number): void {
    this.flash.alpha = Math.max(0, this.flash.alpha - dt * 3);
    this.bolt.alpha = Math.max(0, this.bolt.alpha - dt * 5);
    this.lightningTimer -= dt;
    if (this.lightningTimer > 0) return;
    this.lightningTimer = 3 + Math.random() * 5;
    this.flash.alpha = 0.18;
    // Jagged bolt from the clouds down to the far mountains. TODO(audio): thunder
    const g = this.bolt.clear();
    let x = 100 + Math.random() * (GAME_WIDTH - 200);
    let y = 120;
    g.moveTo(x, y);
    while (y < 430) {
      x += (Math.random() - 0.5) * 50;
      y += 20 + Math.random() * 30;
      g.lineTo(x, y);
    }
    g.stroke({ color: 0xe8f4ff, width: 3 });
    this.bolt.alpha = 1;
  }

  private updateParticles(dt: number): void {
    if (this.particles.length === 0) return;
    const g = this.particleGfx.clear();
    // Particles drift with the camera a little so they feel like they're in the air, not on the glass.
    const shift = -this.cameraX * 0.6;
    for (const p of this.particles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.y > GAME_HEIGHT + 20) p.y -= GAME_HEIGHT + 40;
      if (p.y < -20) p.y += GAME_HEIGHT + 40;
      const sx = mod(p.x + shift, GAME_WIDTH + 40) - 20;
      if (this.particleStyle === "rain") {
        g.moveTo(sx, p.y).lineTo(sx + (p.vx / p.vy) * p.size, p.y + p.size);
      } else {
        const a = this.particleStyle === "spark" ? 0.35 + 0.65 * Math.abs(Math.sin(this.time * 3 + p.phase)) : 0.35;
        g.circle(sx + Math.sin(this.time + p.phase) * 6, p.y, p.size).fill({ color: p.color, alpha: a });
      }
    }
    if (this.particleStyle === "rain") g.stroke({ color: 0x9ec5e8, width: 1.5, alpha: 0.35 });
  }
}

function skyGradient(top: number, horizon: number): Graphics {
  const sky = new Graphics();
  const bands = 32;
  for (let i = 0; i < bands; i++) {
    const t = i / (bands - 1);
    sky.rect(0, (GAME_HEIGHT / bands) * i, GAME_WIDTH, GAME_HEIGHT / bands + 1).fill(lerpColor(top, horizon, t));
  }
  return sky;
}

function lerpColor(a: number, b: number, t: number): number {
  const ch = (c: number, s: number) => (c >> s) & 0xff;
  const mix = (s: number) => Math.round(ch(a, s) + (ch(b, s) - ch(a, s)) * t) << s;
  return mix(16) | mix(8) | mix(0);
}

function mod(a: number, n: number): number {
  return ((a % n) + n) % n;
}

/** Small seeded RNG so each level's scenery looks the same every time. */
function mulberry32(seed: number): () => number {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
