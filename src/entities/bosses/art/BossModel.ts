import { Container } from "pixi.js";

/**
 * Base for bosses drawn in code. A model is a little rig of Graphics parts (wings, arms, staff...)
 * that the boss poses through `pose`; `animate(dt)` eases every part toward the pose each frame.
 *
 * Coordinates: (0, 0) is the boss's bottom-center, the model faces LEFT (toward the player's start).
 */
export abstract class BossModel<P extends string = string> extends Container {
  pose: P;
  protected time = 0;

  constructor(initial: P) {
    super();
    this.pose = initial;
  }

  animate(dt: number): void {
    this.time += dt;
    this.step(dt);
  }

  protected abstract step(dt: number): void;
}

/** Move `current` toward `target`, covering about `rate` of the distance per second (frame-rate independent). */
export function ease(current: number, target: number, rate: number, dt: number): number {
  return current + (target - current) * (1 - Math.exp(-rate * dt));
}
