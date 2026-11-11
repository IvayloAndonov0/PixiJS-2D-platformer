import { Container, Graphics } from "pixi.js";
import { BossModel, ease } from "./BossModel";

export type CrowPose = "fly" | "cast" | "dive" | "gust";

const DARK = 0x1b2440;
const BODY = 0x26315a;
const LIGHT = 0x34447a;
const EDGE = 0x4f66a8;
const SPARK = 0x9fe3ff;
const BEAK = 0xf2b134;

/**
 * Storm Crow: a big storm-blue crow with a glowing red eye and static crackling over its feathers.
 * Poses: fly (flapping), cast (wings spread, beak open), dive (wings folded, tilted), gust (fast, big flaps).
 */
export class CrowModel extends BossModel<CrowPose> {
  private root = new Container();
  private backWing = new Container();
  private frontWing = new Container();
  private head = new Container();
  private jaw = new Graphics();
  private eyeGlow = new Graphics();
  private static = new Graphics();
  private flap = 0;
  private staticTimer = 0;

  constructor() {
    super("fly");
    this.root.position.set(0, -60);
    this.addChild(this.root);

    // Back wing (behind the body, darker)
    this.backWing.position.set(30, -26);
    this.backWing.addChild(wing(DARK, 0x26315a, 0.85));
    // Tail
    const tail = new Graphics();
    for (let i = 0; i < 5; i++) {
      const a = -0.35 + i * 0.16;
      const len = 82 - Math.abs(i - 2) * 8;
      const x1 = 50 + Math.cos(a) * len;
      const y1 = Math.sin(a) * len;
      tail.poly([50, -6, x1, y1 - 7, x1 + 6, y1, x1, y1 + 7, 50, 6]).fill(i % 2 ? DARK : BODY);
      tail.moveTo(52, 0).lineTo(x1, y1).stroke({ color: EDGE, width: 1.5, alpha: 0.7 });
    }
    // Body
    const body = new Graphics();
    body.ellipse(0, 0, 72, 44).fill(BODY);
    body.ellipse(-16, 12, 48, 26).fill(LIGHT);
    for (let r = 0; r < 3; r++) {
      for (let k = 0; k < 4; k++) {
        const x = -48 + k * 22 + r * 8;
        const y = 2 + r * 11;
        body.arc(x, y, 9, 0.2, Math.PI - 0.2).stroke({ color: EDGE, width: 1.5, alpha: 0.6 });
      }
    }
    // Legs + talons (tucked under while flying)
    const legs = new Graphics();
    for (const lx of [-14, 12]) {
      legs.moveTo(lx, 30).lineTo(lx - 6, 56).stroke({ color: BEAK, width: 5, cap: "round" });
      for (const c of [-10, -3, 4]) legs.moveTo(lx - 6, 56).lineTo(lx - 6 + c, 64).stroke({ color: 0xc78f1e, width: 3, cap: "round" });
    }

    // Head
    this.head.position.set(-62, -24);
    const skull = new Graphics();
    skull.poly([-6, -30, 4, -48, 10, -30, 18, -44, 22, -26]).fill(DARK); // crest
    skull.circle(0, 0, 32).fill(BODY);
    skull.ellipse(-6, 10, 22, 14).fill(LIGHT);
    skull.poly([-26, -6, -72, 2, -26, 8]).fill(BEAK); // upper beak
    skull.poly([-26, -6, -72, 2, -40, -2]).fill(0xffd27a);
    this.jaw.poly([0, 0, -38, 6, 0, 10]).fill(0xc78f1e);
    this.jaw.position.set(-26, 6);
    this.eyeGlow.circle(0, 0, 12).fill({ color: 0xff1744, alpha: 0.35 });
    this.eyeGlow.position.set(-12, -6);
    const eye = new Graphics().circle(-12, -6, 7).fill(0xff3b3b).circle(-13, -6, 3.5).fill(0x2a0000).circle(-15, -9, 1.6).fill(0xffffff);
    eye.poly([-24, -18, -2, -12, -4, -8, -22, -12]).fill(DARK); // angry brow
    this.head.addChild(this.jaw, skull, this.eyeGlow, eye);

    // Front wing
    this.frontWing.position.set(14, -22);
    this.frontWing.addChild(wing(LIGHT, EDGE, 1));

    this.root.addChild(this.backWing, tail, legs, body, this.head, this.frontWing, this.static);
  }

  protected step(dt: number): void {
    const p = this.pose;
    const speed = p === "gust" ? 16 : p === "cast" ? 5 : 9;
    this.flap += dt * speed;
    const beat = Math.sin(this.flap);

    let front: number, back: number, tilt: number, jaw: number;
    if (p === "dive") {
      front = 1.25;
      back = 1.15;
      tilt = -0.35;
      jaw = 0.4;
    } else if (p === "cast") {
      front = -0.75 + beat * 0.12;
      back = -0.6 + beat * 0.12;
      tilt = 0.08;
      jaw = 0.6;
    } else {
      const amp = p === "gust" ? 0.75 : 0.55;
      front = beat * amp;
      back = Math.sin(this.flap - 0.4) * amp * 0.9;
      tilt = 0;
      jaw = p === "gust" ? 0.4 : 0;
    }
    this.frontWing.rotation = ease(this.frontWing.rotation, front, 18, dt);
    this.backWing.rotation = ease(this.backWing.rotation, back, 18, dt);
    this.root.rotation = ease(this.root.rotation, tilt, 8, dt);
    this.jaw.rotation = ease(this.jaw.rotation, -jaw, 14, dt);
    this.root.y = -60 + (p === "dive" ? 0 : -beat * 5); // bobs with each flap
    this.head.rotation = Math.sin(this.time * 2.3) * 0.05;
    this.eyeGlow.scale.set(1 + Math.sin(this.time * 6) * 0.2);

    // Static crackle: a fresh little zig-zag every so often.
    this.staticTimer -= dt;
    this.static.alpha = Math.max(0, this.static.alpha - dt * 6);
    if (this.staticTimer <= 0) {
      this.staticTimer = 0.12 + Math.random() * 0.4;
      const g = this.static.clear();
      let x = -60 + Math.random() * 120;
      let y = -40 + Math.random() * 60;
      g.moveTo(x, y);
      for (let i = 0; i < 4; i++) {
        x += (Math.random() - 0.5) * 30;
        y += (Math.random() - 0.5) * 30;
        g.lineTo(x, y);
      }
      g.stroke({ color: SPARK, width: 2 });
      this.static.alpha = 1;
    }
  }
}

/** Wing drawn pointing up-and-back from its shoulder pivot at (0, 0). */
function wing(fill: number, line: number, shade: number): Graphics {
  const g = new Graphics();
  const pts = [0, 0, -14, -34, 6, -76, 46, -108, 96, -120, 128, -104, 104, -94, 118, -78, 92, -72, 102, -54, 76, -50, 82, -32, 54, -26, 44, -8];
  g.poly(pts).fill(fill);
  // Primary feathers
  for (const [x, y] of [
    [128, -104],
    [118, -78],
    [102, -54],
    [82, -32],
  ]) {
    g.moveTo(8, -18).lineTo(x, y).stroke({ color: line, width: 2, alpha: 0.8 * shade });
  }
  // Covert feathers along the leading edge
  for (let i = 0; i < 5; i++) g.arc(10 + i * 16, -60 - i * 8, 12, 0.3, Math.PI - 0.3).stroke({ color: line, width: 2, alpha: 0.6 * shade });
  // Storm-blue edge glow
  g.moveTo(6, -76).lineTo(46, -108).lineTo(96, -120).lineTo(128, -104).stroke({ color: SPARK, width: 2, alpha: 0.5 * shade });
  return g;
}
