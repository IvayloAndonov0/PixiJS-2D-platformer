import { Application, Container, Graphics } from "pixi.js";
import { COLORS, GAME_HEIGHT, GAME_WIDTH } from "../config";
import { Input } from "./Input";
import type { Scene } from "./Scene";

/**
 * Owns the PixiJS app, input, and the active scene.
 * Renders at a fixed virtual resolution (GAME_WIDTH x GAME_HEIGHT) letterboxed to the window,
 * so gameplay code never has to care about screen size.
 */
export class Game {
  readonly app = new Application();
  readonly input = new Input();
  /** Scaled container that all scenes live in. */
  readonly root = new Container();
  private scene?: Scene;
  private pendingScene?: Scene;

  async init(parent: HTMLElement): Promise<void> {
    await this.app.init({
      background: 0x000000, // letterbox bars
      resizeTo: window,
      antialias: true,
    });
    parent.appendChild(this.app.canvas);
    this.app.stage.addChild(this.root);

    // Game-area background + clip, so scrolling worlds never draw into the letterbox bars.
    const bg = new Graphics().rect(0, 0, GAME_WIDTH, GAME_HEIGHT).fill(COLORS.background);
    const clip = new Graphics().rect(0, 0, GAME_WIDTH, GAME_HEIGHT).fill(0xffffff);
    this.root.addChild(bg, clip);
    this.root.mask = clip;

    window.addEventListener("resize", () => this.fit());
    this.fit();

    this.app.ticker.add((ticker) => {
      if (this.pendingScene) this.swapScene(this.pendingScene);
      // Clamp dt so switching tabs doesn't teleport everything.
      const dt = Math.min(ticker.deltaMS / 1000, 1 / 20);
      this.scene?.update(dt);
      this.input.endFrame();
    });
  }

  /** Switch scenes. Safe to call from inside a scene's update(); the swap happens next frame. */
  changeScene(next: Scene): void {
    this.pendingScene = next;
  }

  private swapScene(next: Scene): void {
    this.pendingScene = undefined;
    if (this.scene) {
      this.scene.exit();
      this.root.removeChild(this.scene);
      this.scene.destroy({ children: true });
    }
    this.scene = next;
    this.root.addChild(next);
    next.enter();
  }

  private fit(): void {
    const scale = Math.min(window.innerWidth / GAME_WIDTH, window.innerHeight / GAME_HEIGHT);
    this.root.scale.set(scale);
    this.root.position.set((window.innerWidth - GAME_WIDTH * scale) / 2, (window.innerHeight - GAME_HEIGHT * scale) / 2);
  }
}
