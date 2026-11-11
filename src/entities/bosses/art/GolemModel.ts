import { Container, Graphics } from "pixi.js";
import { BossModel, ease } from "./BossModel";

/**
 * idle: breathing. raise: both arms up (stomp wind-up). slam: arms down hard.
 * throw: front arm back over the head. windup: front arm pulled back for a punch.
 * punch: front arm straight forward (its fist flies off as a rocket, see `fistGone`).
 */
export type GolemPose = "idle" | "raise" | "slam" | "throw" | "windup" | "punch";

const STONE = 0x6c7884;
const STONE_DARK = 0x4a5560;
const STONE_LIGHT = 0x8a96a2;
const RIVET = 0x3c454d;
const LAVA = 0xff8a3c;
const GLOW = 0xffd27a;

/** Arm angles (rotation of the arm around the shoulder; 0 = hanging down, PI/2 = pointing forward/left). */
const ARM: Record<GolemPose, [front: number, back: number, elbow: number]> = {
  idle: [0.15, -0.1, -0.15],
  raise: [2.7, 2.5, -0.4],
  slam: [0.6, 0.5, 0],
  throw: [3.6, 0.3, -1.2],
  windup: [-0.9, 0.2, -1.6],
  punch: [1.57, -0.2, 0],
};

/**
 * Iron Golem: riveted iron-and-stone giant with a molten core, glowing visor and cracked plates.
 */
export class GolemModel extends BossModel<GolemPose> {
  /** Hide the front fist while it's flying as a rocket. */
  fistGone = false;
  private torso = new Container();
  private frontArm = new Container();
  private frontForearm = new Container();
  private frontFist = new Graphics();
  private backArm = new Container();
  private backForearm = new Container();
  private core = new Graphics();
  private visor = new Graphics();

  constructor() {
    super("idle");

    // Back arm (behind everything)
    this.backArm.position.set(70, -205);
    this.buildArm(this.backArm, this.backForearm, new Graphics(), STONE_DARK, 0x3c454d);

    // Legs
    const legs = new Graphics();
    for (const lx of [-80, 20]) {
      legs.roundRect(lx, -96, 60, 90, 8).fill(STONE_DARK);
      legs.roundRect(lx + 6, -70, 48, 26, 6).fill(STONE); // knee plate
      legs.circle(lx + 30, -57, 5).fill(RIVET);
      legs.roundRect(lx - 8, -16, 76, 16, 5).fill(0x3f4850); // foot
    }

    // Torso
    const t = new Graphics();
    t.poly([-115, -90, -126, -205, -84, -238, 84, -238, 126, -205, 115, -90]).fill(STONE);
    t.poly([-96, -110, -104, -196, -70, -220, 70, -220, 104, -196, 96, -110]).fill(STONE_DARK);
    t.roundRect(-118, -104, 236, 20, 4).fill(RIVET); // belt
    for (let i = 0; i < 6; i++) t.circle(-100 + i * 40, -94, 4).fill(STONE_LIGHT);
    for (const [x, y] of [
      [-112, -200],
      [112, -200],
      [-100, -120],
      [100, -120],
      [-60, -226],
      [60, -226],
    ])
      t.circle(x, y, 5).fill(RIVET);
    // Molten cracks running out of the core
    for (const pts of [
      [-8, -165, -40, -190, -52, -214],
      [-8, -165, -50, -150, -82, -140],
      [-8, -165, 30, -132, 44, -112],
      [-8, -165, 34, -190, 70, -196],
    ]) {
      t.moveTo(pts[0], pts[1]).lineTo(pts[2], pts[3]).lineTo(pts[4], pts[5]).stroke({ color: LAVA, width: 3, alpha: 0.85 });
    }
    // Core socket
    t.circle(-8, -165, 30).fill(RIVET);
    this.core.circle(0, 0, 26).fill({ color: LAVA, alpha: 0.4 }).circle(0, 0, 18).fill(LAVA).circle(-3, -3, 9).fill(GLOW);
    this.core.position.set(-8, -165);

    // Head
    const head = new Graphics();
    head.poly([-48, -238, -52, -280, -36, -298, 36, -298, 52, -280, 48, -238]).fill(STONE);
    head.poly([-56, -268, -48, -296, -30, -298, -38, -268]).fill(STONE_LIGHT); // brow ridge
    head.roundRect(-42, -252, 84, 12, 3).fill(RIVET); // jaw line
    this.visor.roundRect(-46, -278, 58, 12, 4).fill({ color: GLOW, alpha: 0.35 }).roundRect(-44, -275, 54, 6, 3).fill(0xffb347);

    this.torso.addChild(t, this.core, head, this.visor);

    // Front arm (in front of the torso)
    this.frontArm.position.set(-96, -205);
    this.buildArm(this.frontArm, this.frontForearm, this.frontFist, STONE_LIGHT, STONE);

    this.addChild(this.backArm, legs, this.torso, this.frontArm);
  }

  private buildArm(arm: Container, forearm: Container, fist: Graphics, color: number, shade: number): void {
    const upper = new Graphics();
    upper.roundRect(-24, -6, 48, 92, 12).fill(shade);
    upper.roundRect(-18, 10, 36, 30, 6).fill(color);
    const pauldron = new Graphics();
    pauldron.ellipse(0, 0, 44, 34).fill(color).ellipse(0, -6, 34, 22).fill(shade);
    for (const x of [-22, 0, 22]) pauldron.circle(x, 8, 4).fill(RIVET);
    forearm.position.set(0, 84);
    const fore = new Graphics();
    fore.roundRect(-26, -4, 52, 76, 10).fill(color);
    fore.moveTo(-18, 20).lineTo(18, 20).stroke({ color: shade, width: 3 });
    fore.moveTo(-18, 40).lineTo(18, 40).stroke({ color: shade, width: 3 });
    fist.roundRect(-34, 0, 68, 52, 12).fill(color);
    for (let i = 0; i < 4; i++) fist.roundRect(-32 + i * 16.5, 38, 15, 18, 5).fill(STONE_LIGHT);
    fist.position.set(0, 68);
    forearm.addChild(fore, fist);
    arm.addChild(upper, forearm, pauldron);
  }

  protected step(dt: number): void {
    const [front, back, elbow] = ARM[this.pose];
    const rate = this.pose === "slam" || this.pose === "punch" ? 30 : 9;
    this.frontArm.rotation = ease(this.frontArm.rotation, front, rate, dt);
    this.backArm.rotation = ease(this.backArm.rotation, back, rate, dt);
    this.frontForearm.rotation = ease(this.frontForearm.rotation, elbow, rate, dt);
    this.backForearm.rotation = ease(this.backForearm.rotation, elbow * 0.6, rate, dt);
    this.frontFist.visible = !this.fistGone;

    const breathe = Math.sin(this.time * 2) * 2;
    this.torso.y = breathe;
    this.frontArm.y = -205 + breathe;
    this.backArm.y = -205 + breathe;
    const pulse = 0.85 + 0.15 * Math.sin(this.time * 5);
    this.core.scale.set(this.pose === "raise" || this.pose === "windup" ? pulse * 1.25 : pulse);
    this.visor.alpha = 0.75 + 0.25 * Math.sin(this.time * 3.3);
  }
}
