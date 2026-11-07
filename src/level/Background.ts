import { Container, Graphics, TilingSprite } from "pixi.js";
import { image } from "../assets";
import { GAME_HEIGHT, GAME_WIDTH, GROUND_Y } from "../config";

/** Sky gradient, top -> horizon. */
const SKY_TOP = 0x1f1418;
const SKY_HORIZON = 0x6b4a4f;

/** Hills image: 1672x941 with the art between y=335 and y=823 (transparent above and below). */
const HILLS_SCALE = 0.8;
const HILLS_ART_BOTTOM = 823;
/** 0 = glued to the screen, 1 = moves with the world. Lower = feels further away. */
const HILLS_PARALLAX = 0.3;

/**
 * Screen-space background: sky + parallax hills that tile horizontally.
 * Call update(cameraX) every frame.
 * TODO(art): add more layers (far mountains / near bushes) with different parallax values.
 */
export class Background extends Container {
  private hills: TilingSprite;

  constructor() {
    super();

    const sky = new Graphics();
    const bands = 32;
    for (let i = 0; i < bands; i++) {
      const t = i / (bands - 1);
      sky.rect(0, (GAME_HEIGHT / bands) * i, GAME_WIDTH, GAME_HEIGHT / bands + 1).fill(lerpColor(SKY_TOP, SKY_HORIZON, t));
    }
    this.addChild(sky);

    const tex = image("hills");
    this.hills = new TilingSprite({ texture: tex, width: GAME_WIDTH, height: tex.height * HILLS_SCALE });
    this.hills.tileScale.set(HILLS_SCALE);
    // Bottom of the hill art tucks just under the floor line.
    this.hills.y = GROUND_Y + 12 - HILLS_ART_BOTTOM * HILLS_SCALE;
    this.addChild(this.hills);
  }

  update(cameraX: number): void {
    this.hills.tilePosition.x = -cameraX * HILLS_PARALLAX;
  }
}

function lerpColor(a: number, b: number, t: number): number {
  const ch = (c: number, s: number) => (c >> s) & 0xff;
  const mix = (s: number) => Math.round(ch(a, s) + (ch(b, s) - ch(a, s)) * t) << s;
  return mix(16) | mix(8) | mix(0);
}
