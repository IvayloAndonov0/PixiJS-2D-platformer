import { Container } from "pixi.js";
import type { Game } from "./Game";

/** Base class for every screen (title, fight, results...). */
export abstract class Scene extends Container {
  constructor(protected game: Game) {
    super();
  }

  /** Called once when the scene becomes active. */
  enter(): void {}

  /** Called every frame. dt is in seconds. */
  abstract update(dt: number): void;

  /** Called right before the scene is removed. Clean up listeners / sounds here. */
  exit(): void {}
}
