import { Container, Graphics } from "pixi.js";
import { GAME_HEIGHT, GAME_WIDTH } from "../config";

/** Each layer repeats every LOOP px, so scrolling never runs out. */
const LOOP = GAME_WIDTH * 2;

interface Layer {
  view: Graphics;
  speed: number; // px/s it scrolls left
  offset: number;
}

interface Drop {
  x: number;
  y: number;
  len: number;
  speed: number;
}

/**
 * Plane levels: a stormy sky that scrolls past on its own (the plane "flies" to the right).
 * Same API as Background: update(cameraX) (unused here) and tick(dt) every frame.
 * Layers back to front: sky gradient, far clouds, distant peaks, mid clouds, rain, lightning flash.
 */
export class SkyBackground extends Container {
  private layers: Layer[] = [];
  private rain = new Graphics();
  private drops: Drop[] = [];
  private flash = new Graphics().rect(0, 0, GAME_WIDTH, GAME_HEIGHT).fill(0xdff4ff);
  private lightningTimer = 3;
  private rand = mulberry32(4242);

  constructor() {
    super();
    const sky = new Graphics();
    const bands = 24;
    for (let i = 0; i < bands; i++) {
      sky.rect(0, (i * GAME_HEIGHT) / bands, GAME_WIDTH, GAME_HEIGHT / bands + 1).fill(lerpColor(0x0b1426, 0x4a6a8c, i / (bands - 1)));
    }
    this.addChild(sky);

    this.cloudLayer(18, 40, 10, 90, 260, [0x1a2740, 0x22324f], 0.8);
    this.peaks(45, 600, 90, 0x1b2a40);
    this.cloudLayer(70, 380, 14, 70, 200, [0x2a3d5c, 0x324a6e], 0.7);
    this.peaks(110, 660, 50, 0x111c2c);
    this.cloudLayer(190, 560, 8, 60, 160, [0x3b557c, 0x46628c], 0.55);

    for (let i = 0; i < 140; i++) {
      this.drops.push({
        x: this.rand() * GAME_WIDTH,
        y: this.rand() * GAME_HEIGHT,
        len: 10 + this.rand() * 14,
        speed: 700 + this.rand() * 300,
      });
    }
    this.flash.alpha = 0;
    this.addChild(this.rain, this.flash);
  }

  /** Plane levels don't use a camera; kept so the fight scene can treat both backgrounds the same. */
  update(_cameraX: number): void {}

  tick(dt: number): void {
    for (const l of this.layers) {
      l.offset = (l.offset + l.speed * dt) % LOOP;
      l.view.x = -l.offset;
    }

    // Rain slants back toward the left (we're flying right through it).
    this.rain.clear();
    for (const d of this.drops) {
      d.x -= d.speed * 0.6 * dt;
      d.y += d.speed * dt;
      if (d.y > GAME_HEIGHT || d.x < -20) {
        d.y = -20;
        d.x = this.rand() * (GAME_WIDTH + 200);
      }
      this.rain.moveTo(d.x, d.y).lineTo(d.x + d.len * 0.5, d.y - d.len);
    }
    this.rain.stroke({ color: 0x9fc3e6, width: 1.5, alpha: 0.35 });

    // Occasional sheet lightning.
    this.lightningTimer -= dt;
    if (this.lightningTimer <= 0) {
      this.lightningTimer = 3 + this.rand() * 5;
      this.flash.alpha = 0.22;
    }
    this.flash.alpha = Math.max(0, this.flash.alpha - dt * 0.9);
  }

  /** A band of puffy clouds around `y`. */
  private cloudLayer(speed: number, y: number, count: number, minR: number, maxR: number, colors: number[], alpha: number): void {
    const g = new Graphics();
    for (let i = 0; i < count; i++) {
      const cx = (i / count) * LOOP + this.rand() * 80;
      const cy = y + (this.rand() - 0.5) * 80;
      const w = minR + this.rand() * (maxR - minR);
      const color = colors[i % colors.length];
      // Draw at x and x + LOOP so the layer wraps seamlessly.
      for (const off of [0, LOOP]) {
        for (let k = 0; k < 4; k++) {
          g.ellipse(off + cx + (k - 1.5) * w * 0.45, cy - Math.abs(k - 1.5) * -8, w * 0.5, w * 0.22).fill({ color, alpha });
        }
      }
    }
    this.addLayer(g, speed);
  }

  /** Jagged mountain tops along the bottom, repeating every LOOP px. */
  private peaks(speed: number, base: number, amp: number, color: number): void {
    const n = Math.round(LOOP / 70); // ~70 px between peaks, dividing LOOP exactly so the copies meet cleanly
    const step = LOOP / n;
    const ys: number[] = [];
    for (let i = 0; i < n; i++) ys.push(base - this.rand() * amp);
    ys.push(ys[0]); // last point = first, so the loop joins up
    const g = new Graphics();
    for (const off of [0, LOOP]) {
      // A fresh array per copy: poly() keeps a reference, so reusing one would redraw the same copy twice.
      const pts: number[] = [off, GAME_HEIGHT];
      ys.forEach((y, i) => pts.push(off + i * step, y));
      pts.push(off + LOOP, GAME_HEIGHT);
      g.poly(pts).fill(color);
    }
    this.addLayer(g, speed);
  }

  private addLayer(view: Graphics, speed: number): void {
    this.addChild(view);
    this.layers.push({ view, speed, offset: 0 });
  }
}

function lerpColor(a: number, b: number, t: number): number {
  const ch = (c: number, s: number) => (c >> s) & 0xff;
  const mix = (s: number) => Math.round(ch(a, s) + (ch(b, s) - ch(a, s)) * t) << s;
  return mix(16) | mix(8) | mix(0);
}

function mulberry32(seed: number): () => number {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
