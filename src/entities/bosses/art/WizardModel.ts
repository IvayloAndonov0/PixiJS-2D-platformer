import { Container, Graphics } from "pixi.js";
import { BossModel, ease } from "./BossModel";

/** idle: standing, staff low. cast: staff raised, orb flaring. channel: both hands up, runes spin fast. */
export type WizardPose = "idle" | "cast" | "channel";

const ROBE = 0x5b2d9e;
const ROBE_DARK = 0x3b1d74;
const TRIM = 0xffd27a;
const GLOW = 0x18ffff;

/**
 * Hex Wizard: a hooded old caster with a long beard, a starry pointed hat, glowing eyes,
 * a crook staff topped with a cyan orb, and runes orbiting around him.
 */
export class WizardModel extends BossModel<WizardPose> {
  /** Where the orb on the staff is, relative to the boss's bottom-center (for aiming shots). */
  readonly orbOffset = { x: 0, y: 0 };
  private robe = new Container();
  private cape = new Graphics();
  private staff = new Container();
  private orb = new Graphics();
  private freeHand = new Graphics();
  private runes: Graphics[] = [];
  private runeSpin = 0;
  private eyes = new Graphics();

  constructor() {
    super("idle");

    // Cape (behind)
    this.cape.poly([-30, -150, 34, -150, 62, -6, 30, 2, 0, -8, -30, 2, -58, -6]).fill(0x2a1650);

    // Robe with zig-zag hem, gold trim and stars
    const robe = new Graphics();
    const hem: number[] = [];
    for (let i = 0; i <= 8; i++) hem.push(52 - i * 13, i % 2 ? -2 : -12);
    robe.poly([-34, -150, 34, -150, 52, -12, ...hem, -52, -12]).fill(ROBE);
    robe.poly([-8, -150, 8, -150, 14, -10, -14, -10]).fill(ROBE_DARK); // front panel
    robe.moveTo(-8, -150).lineTo(-14, -10).moveTo(8, -150).lineTo(14, -10).stroke({ color: TRIM, width: 2.5 });
    robe.roundRect(-36, -104, 72, 10, 4).fill(0x2a1650); // belt
    robe.poly([0, -106, 7, -99, 0, -92, -7, -99]).fill(GLOW); // buckle gem
    for (const [x, y] of [
      [-30, -60],
      [26, -40],
      [-20, -28],
      [32, -80],
    ])
      star(robe, x, y, 4, TRIM);

    // Head: shadowed face, glowing eyes, long beard
    const head = new Graphics();
    head.ellipse(0, -164, 26, 22).fill(0x120a24);
    head.poly([-22, -156, -14, -120, -4, -84, 2, -100, 10, -118, 22, -156]).fill(0xd8d0e8); // beard
    head.poly([-14, -150, -4, -112, 4, -150]).fill(0xb9add1);
    this.eyes.ellipse(-10, -168, 4.5, 3).fill(GLOW).ellipse(6, -168, 4.5, 3).fill(GLOW);

    // Hat: wide brim, bent cone, gold band, stars
    const hat = new Graphics();
    hat.ellipse(0, -182, 60, 13).fill(ROBE_DARK);
    hat.poly([-38, -184, 38, -184, 22, -228, 18, -258, 44, -282, 6, -262, -6, -230]).fill(0x4a2590);
    hat.poly([-36, -192, 36, -192, 33, -202, -33, -202]).fill(TRIM);
    star(hat, -12, -222, 5, TRIM);
    star(hat, 10, -246, 4, 0xffffff);

    // Staff in the front (left) hand
    const rod = new Graphics();
    rod.roundRect(-4, -126, 8, 196, 3).fill(0x6d4c2e);
    rod.moveTo(0, -126).bezierCurveTo(0, -150, -26, -152, -26, -132).stroke({ color: 0x6d4c2e, width: 7, cap: "round" }); // crook
    rod.roundRect(-6, -60, 12, 14, 3).fill(TRIM); // grip band
    this.orb.position.set(-14, -138);
    const hand = new Graphics().circle(0, -50, 9).fill(0xc9b8e8);
    this.staff.addChild(rod, this.orb, hand);
    this.staff.position.set(-44, -96);
    const sleeve = new Graphics().poly([-24, -146, -6, -140, -36, -98, -54, -104]).fill(ROBE_DARK);

    // Free hand (back) for channelling
    this.freeHand.circle(0, 0, 8).fill(0xc9b8e8).circle(0, 0, 14).fill({ color: GLOW, alpha: 0.25 });
    this.freeHand.position.set(34, -110);

    this.robe.addChild(robe, head, this.eyes, hat);
    this.addChild(this.cape, this.freeHand, this.robe, sleeve, this.staff);

    // Orbiting runes
    for (let i = 0; i < 3; i++) {
      const r = new Graphics();
      r.circle(0, 0, 11).fill({ color: 0x7c4dff, alpha: 0.35 }).circle(0, 0, 8).stroke({ color: 0xe1bee7, width: 2 });
      r.moveTo(-4, -4).lineTo(4, 4).moveTo(4, -4).lineTo(-4, 4).stroke({ color: 0xffffff, width: 1.5 });
      this.runes.push(r);
      this.addChild(r);
    }
  }

  protected step(dt: number): void {
    const p = this.pose;
    const staffRot = p === "cast" ? 0.5 : p === "channel" ? 0.25 : -0.08;
    const staffY = p === "idle" ? -96 : -118;
    this.staff.rotation = ease(this.staff.rotation, staffRot, 10, dt);
    this.staff.y = ease(this.staff.y, staffY, 10, dt);
    this.freeHand.y = ease(this.freeHand.y, p === "channel" ? -180 : -110, 10, dt);
    this.freeHand.x = ease(this.freeHand.x, p === "channel" ? 46 : 34, 10, dt);

    // Orb pulse; bigger flare while casting
    const flare = p === "idle" ? 1 : 1.6;
    const s = flare * (0.9 + 0.1 * Math.sin(this.time * 6));
    this.orb.clear().circle(0, 0, 16 * s).fill({ color: GLOW, alpha: 0.25 }).circle(0, 0, 9).fill(0x84ffff).circle(-3, -3, 3.5).fill(0xffffff);

    // Robe sway + hover bob
    const sway = Math.sin(this.time * 1.7) * 0.03;
    this.robe.skew.x = sway;
    this.cape.skew.x = sway * 2;
    this.y = 0;
    this.eyes.alpha = 0.7 + 0.3 * Math.abs(Math.sin(this.time * 2.2));

    this.runeSpin += dt * (p === "idle" ? 1.2 : 4);
    this.runes.forEach((r, i) => {
      const a = this.runeSpin + (i / this.runes.length) * Math.PI * 2;
      r.position.set(Math.cos(a) * 70, -110 + Math.sin(a) * 26);
      r.zIndex = Math.sin(a);
      r.alpha = Math.sin(a) > 0 ? 0.95 : 0.45; // dimmer when "behind" him
    });

    // Orb world offset for the boss's shots (staff rotates around its hand position).
    const ox = -14;
    const oy = -138;
    const c = Math.cos(this.staff.rotation);
    const sn = Math.sin(this.staff.rotation);
    this.orbOffset.x = this.staff.x + ox * c - oy * sn;
    this.orbOffset.y = this.staff.y + ox * sn + oy * c;
  }
}

function star(g: Graphics, x: number, y: number, r: number, color: number): void {
  const pts: number[] = [];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 - Math.PI / 2;
    const rr = i % 2 ? r * 0.4 : r;
    pts.push(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  g.poly(pts).fill(color);
}
