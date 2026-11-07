import { AnimatedSprite, Container } from "pixi.js";
import { anim, type SheetName } from "../assets";

export interface EffectOptions {
  scale?: number;
  rotation?: number;
  /** Frames per second. */
  fps?: number;
  /** Flip horizontally. */
  flip?: boolean;
  tint?: number;
}

/** One-shot visual effects (sparks, smoke, parry rings...). Each plays once and removes itself. */
export class Effects extends Container {
  spawn(sheet: SheetName, name: string, x: number, y: number, opts: EffectOptions = {}): AnimatedSprite {
    const s = new AnimatedSprite({ textures: anim(sheet, name), updateAnchor: true });
    s.position.set(x, y);
    s.scale.set((opts.flip ? -1 : 1) * (opts.scale ?? 1), opts.scale ?? 1);
    s.rotation = opts.rotation ?? 0;
    if (opts.tint !== undefined) s.tint = opts.tint;
    s.animationSpeed = (opts.fps ?? 24) / 60;
    s.loop = false;
    s.onComplete = () => s.destroy();
    this.addChild(s);
    s.play();
    return s;
  }
}
