import { Container } from "pixi.js";
import { GAME_HEIGHT, GAME_WIDTH } from "../config";
import { Bullet, type BulletOptions, type BulletOwner } from "../entities/Bullet";

/** Holds all live bullets for one owner (player or boss); removes dead and off-screen ones. */
export class BulletPool extends Container {
  readonly bullets: Bullet[] = [];

  constructor(private owner: BulletOwner) {
    super();
  }

  spawn(x: number, y: number, vx: number, vy: number, opts?: BulletOptions): Bullet {
    const b = new Bullet(this.owner, x, y, vx, vy, opts);
    this.bullets.push(b);
    this.addChild(b);
    return b;
  }

  /** `viewLeft` = world x of the left screen edge (camera position), used to cull off-screen bullets. */
  update(dt: number, viewLeft = 0): void {
    const margin = 100;
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b = this.bullets[i];
      b.update(dt);
      const offscreen =
        b.x < viewLeft - margin || b.x > viewLeft + GAME_WIDTH + margin || b.y < -margin || b.y > GAME_HEIGHT + margin;
      if (offscreen || b.dead) {
        this.bullets.splice(i, 1);
        b.destroy({ children: true }); // also stops any AnimatedSprite inside
      }
    }
  }
}
