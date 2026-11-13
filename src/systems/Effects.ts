import { AnimatedSprite, Container, Sprite, type Texture } from "pixi.js";
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

export interface StillOptions {
  /** Seconds on screen. */
  life: number;
  /** Seconds to fade in / out at the start / end. */
  fadeIn?: number;
  fadeOut?: number;
  /** Scale at the start and end of its life (linear). */
  scaleFrom?: number;
  scaleTo?: number;
  /** Radians per second. */
  spin?: number;
  rotation?: number;
  tint?: number;
  alpha?: number;
}

interface Still {
  sprite: Container;
  opts: StillOptions;
  age: number;
}

/**
 * One-shot visual effects (sparks, smoke, parry rings...). Each plays once and removes itself.
 * `still()` shows a single image for a set time with fades / scaling / spin (call update(dt) every frame).
 */
export class Effects extends Container {
  private stills: Still[] = [];
  private shakeLeft = 0;
  private shakeTotal = 0;
  private shakeMag = 0;
  /** Current screen-shake offset in px; the scene applies it. Updated by tickShake(). */
  shakeX = 0;
  shakeY = 0;

  /** Shake the screen: `magnitude` px at the start, fading out over `seconds`. */
  shake(magnitude: number, seconds: number): void {
    this.shakeMag = Math.max(this.shakeMag * (this.shakeLeft / (this.shakeTotal || 1)), magnitude);
    this.shakeLeft = this.shakeTotal = seconds;
  }

  /** Call every frame (even during hit-stop) so the shake always settles. */
  tickShake(dt: number): void {
    this.shakeLeft = Math.max(0, this.shakeLeft - dt);
    const k = this.shakeTotal > 0 ? this.shakeLeft / this.shakeTotal : 0;
    this.shakeX = (Math.random() * 2 - 1) * this.shakeMag * k;
    this.shakeY = (Math.random() * 2 - 1) * this.shakeMag * k;
  }

  still(texture: Texture, x: number, y: number, opts: StillOptions): Sprite {
    return this.stillView(new Sprite(texture), x, y, opts); // anchor comes from the spritesheet
  }

  /** Same as still(), for any display object (e.g. a Graphics drawn in code). */
  stillView<T extends Container>(s: T, x: number, y: number, opts: StillOptions): T {
    s.position.set(x, y);
    s.rotation = opts.rotation ?? 0;
    if (opts.tint !== undefined) s.tint = opts.tint;
    this.addChild(s);
    const still = { sprite: s, opts, age: 0 };
    this.stills.push(still);
    this.applyStill(still);
    return s;
  }

  update(dt: number): void {
    for (let i = this.stills.length - 1; i >= 0; i--) {
      const st = this.stills[i];
      st.age += dt;
      if (st.sprite.destroyed || st.age >= st.opts.life) {
        if (!st.sprite.destroyed) st.sprite.destroy();
        this.stills.splice(i, 1);
        continue;
      }
      st.sprite.rotation += (st.opts.spin ?? 0) * dt;
      this.applyStill(st);
    }
  }

  private applyStill({ sprite, opts, age }: Still): void {
    const p = Math.min(1, age / opts.life);
    const from = opts.scaleFrom ?? 1;
    sprite.scale.set(from + ((opts.scaleTo ?? from) - from) * p);
    let a = opts.alpha ?? 1;
    if (opts.fadeIn) a *= Math.min(1, age / opts.fadeIn);
    if (opts.fadeOut) a *= Math.min(1, (opts.life - age) / opts.fadeOut);
    sprite.alpha = a;
  }

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
