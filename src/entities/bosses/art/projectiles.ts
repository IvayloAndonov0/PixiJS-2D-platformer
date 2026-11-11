import { Graphics, GraphicsContext } from "pixi.js";

/**
 * Projectile and effect shapes drawn in code. Each is built once and shared (GraphicsContext),
 * so spawning hundreds of bullets doesn't redraw anything.
 * Oriented shapes point RIGHT (+x); bullets rotate them along their velocity.
 * Light/white parts turn green when a bullet is parryable (it gets tinted), so keep a light core.
 */

const cache = new Map<string, GraphicsContext>();
function shape(name: string, draw: (g: GraphicsContext) => void): () => GraphicsContext {
  return () => {
    let ctx = cache.get(name);
    if (!ctx) {
      ctx = new GraphicsContext();
      draw(ctx);
      cache.set(name, ctx);
    }
    return ctx;
  };
}

// ---------------------------------------------------------------- Storm Crow

export const FEATHER = shape("feather", (g) => {
  g.poly([-18, 0, -8, -7, 10, -6, 20, 0, 10, 6, -8, 7]).fill(0x2c3e6b);
  g.poly([-14, 0, -6, -4, 8, -3, 16, 0, 8, 3, -6, 4]).fill(0x5f7fc4);
  g.moveTo(-22, 0).lineTo(18, 0).stroke({ color: 0xe8f4ff, width: 2 });
  g.circle(18, 0, 3).fill(0xbfe9ff);
});

/** Tornado funnel, bottom-center at (0, 0) of the drawing is offset so the bullet sits mid-funnel. */
export const TORNADO = shape("tornado", (g) => {
  const rings = 9;
  for (let i = 0; i < rings; i++) {
    const t = i / (rings - 1);
    const y = 40 - t * 120;
    const w = 14 + t * 46;
    g.ellipse(Math.sin(i * 1.3) * 6, y, w, 9).fill({ color: i % 2 ? 0x9fb7cf : 0xd7e6f2, alpha: 0.75 });
  }
  g.moveTo(-40, -50).quadraticCurveTo(0, -30, 44, -60).stroke({ color: 0xffffff, width: 2, alpha: 0.7 });
  g.moveTo(-26, 0).quadraticCurveTo(4, 12, 28, -6).stroke({ color: 0xffffff, width: 2, alpha: 0.7 });
});

/**
 * Zig-zag lightning bolt from (0, top) down to (0, bottom). Not shared: every strike looks different,
 * so it's a Graphics with its own geometry, freed when the effect is destroyed.
 */
export function lightningBolt(top: number, bottom: number): Graphics {
  const g = new Graphics();
  const pts: number[] = [0, top];
  let x = 0;
  for (let y = top; y < bottom; ) {
    y = Math.min(bottom, y + 24 + Math.random() * 30);
    x = (Math.random() - 0.5) * 40;
    pts.push(x, y);
  }
  const path = (w: number, color: number, alpha: number) => {
    g.moveTo(pts[0], pts[1]);
    for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]);
    g.stroke({ color, width: w, alpha, join: "round", cap: "round" });
  };
  path(18, 0x7fd4ff, 0.35);
  path(8, 0xbfe9ff, 0.8);
  path(3, 0xffffff, 1);
  return g;
}

// ---------------------------------------------------------------- Iron Golem

export const BOULDER = shape("boulder", (g) => {
  g.poly([-20, -8, -12, -20, 6, -22, 20, -12, 22, 6, 10, 20, -10, 20, -22, 8]).fill(0x6d5f55);
  g.poly([-14, -10, -8, -16, 4, -17, 12, -10, 2, -4, -10, -2]).fill(0x8c7d70);
  g.moveTo(-6, 4).lineTo(4, 10).lineTo(2, 16).stroke({ color: 0x3e342e, width: 2 });
  g.moveTo(8, -6).lineTo(14, 2).stroke({ color: 0x3e342e, width: 2 });
  g.circle(-4, -12, 3).fill({ color: 0xffffff, alpha: 0.35 });
});

/** Rolling ground shockwave: a dust wave that leans forward (+x). */
export const SHOCKWAVE = shape("shockwave", (g) => {
  g.poly([-26, 14, -18, -6, -4, -20, 10, -24, 22, -14, 26, 14]).fill({ color: 0xa1887f, alpha: 0.9 });
  g.poly([-16, 14, -10, -2, 2, -12, 14, -14, 20, 14]).fill(0xd7ccc8);
  g.circle(-30, 8, 6).fill({ color: 0xbcaaa4, alpha: 0.6 });
  g.circle(-40, 11, 4).fill({ color: 0xbcaaa4, alpha: 0.4 });
});

/** Rock spike shooting out of the floor, points +x (bullets aim it up). */
export const ROCK_SPIKE = shape("rockSpike", (g) => {
  g.poly([-18, -9, 18, 0, -18, 9]).fill(0x8d6e63);
  g.poly([-14, -4, 12, 0, -14, 2]).fill(0xbcaaa4);
});

/** Rocket fist, knuckles forward (+x), flame out the back. */
export const ROCKET_FIST = shape("rocketFist", (g) => {
  g.poly([-70, 0, -46, -14, -40, 0, -46, 14]).fill({ color: 0xff6d00, alpha: 0.8 });
  g.poly([-58, 0, -42, -8, -38, 0, -42, 8]).fill(0xffd27a);
  g.roundRect(-38, -24, 26, 48, 6).fill(0x5a6570);
  g.roundRect(-16, -30, 50, 60, 12).fill(0x8a96a2);
  for (let i = 0; i < 4; i++) g.roundRect(22, -28 + i * 14.5, 14, 13, 4).fill(0xa7b3be);
  g.moveTo(-10, -18).lineTo(14, -18).stroke({ color: 0x5a6570, width: 2 });
  g.circle(0, 10, 4).fill(0xffb347);
});

// ---------------------------------------------------------------- Hex Wizard

export const ARCANE_BOLT = shape("arcaneBolt", (g) => {
  g.poly([-16, 0, 0, -8, 14, 0, 0, 8]).fill({ color: 0x7c4dff, alpha: 0.5 });
  g.poly([-10, 0, 0, -5, 10, 0, 0, 5]).fill(0xb388ff);
  g.circle(2, 0, 2.5).fill(0xffffff);
});

export const HEX_ORB = shape("hexOrb", (g) => {
  g.circle(0, 0, 22).fill({ color: 0x7c4dff, alpha: 0.25 });
  g.circle(0, 0, 16).fill(0x4a2590);
  g.circle(0, 0, 11).fill(0xb388ff);
  g.circle(0, 0, 18).stroke({ color: 0xe1bee7, width: 2, alpha: 0.8 });
  g.poly([0, -7, 6, 4, -6, 4]).stroke({ color: 0xffffff, width: 2 });
});

/** Short glowing rune bar for the bolt curtain. */
export const RUNE_BAR = shape("runeBar", (g) => {
  g.roundRect(-16, -5, 32, 10, 5).fill({ color: 0x7c4dff, alpha: 0.45 });
  g.roundRect(-12, -3, 24, 6, 3).fill(0xd1c4e9);
  g.moveTo(-6, -3).lineTo(-2, 3).moveTo(2, -3).lineTo(6, 3).stroke({ color: 0x4a2590, width: 1.5 });
});

/** Homing hex: a little skull-shaped wisp with a trail behind it (-x). */
export const HEX_WISP = shape("hexWisp", (g) => {
  g.poly([-30, 0, -6, -8, -6, 8]).fill({ color: 0x18ffff, alpha: 0.35 });
  g.circle(2, 0, 11).fill(0x311b92);
  g.circle(2, 0, 8).fill(0xe0f7fa);
  g.circle(5, -3, 2.2).fill(0x311b92);
  g.circle(5, 3, 2.2).fill(0x311b92);
});

/** Rune circle drawn on the floor (flattened), used as a trap telegraph. */
export const RUNE_CIRCLE = shape("runeCircle", (g) => {
  g.ellipse(0, 0, 60, 16).fill({ color: 0x7c4dff, alpha: 0.25 });
  g.ellipse(0, 0, 60, 16).stroke({ color: 0xb388ff, width: 3 });
  g.ellipse(0, 0, 42, 11).stroke({ color: 0xe1bee7, width: 2 });
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    g.circle(Math.cos(a) * 51, Math.sin(a) * 13.5, 3).fill(0xffffff);
  }
});
