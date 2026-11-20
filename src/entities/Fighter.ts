import type { Container } from "pixi.js";
import type { Loadout, WeaponId } from "../core/Upgrades";
import type { Rect } from "../systems/collision";

/** What bosses need to know about whoever they're fighting (ground player or plane). */
export interface BossTarget {
  /** Writable: some attacks move the player (e.g. Eclipse Heart's vortex pull). */
  x: number;
  y: number;
  readonly hitbox: Rect;
  readonly isDead: boolean;
}

/**
 * What the fight scene and HUD need from the player's character.
 * Implemented by Player (on foot) and Plane (plane levels).
 */
export interface Fighter extends Container, BossTarget {
  hp: number;
  maxHp: number;
  /** Super meter, 0..SUPER.max */
  meter: number;
  supersUsed: number;
  /** Left movement limit (the fight scene moves it to lock the arena). */
  minX: number;
  readonly parryBox: Rect;
  readonly isParrying: boolean;
  /** Shadow Dash: passing through bullets right now. */
  readonly isPhasing: boolean;
  readonly deathFinished: boolean;
  readonly superReady: boolean;
  readonly weapon: WeaponId;
  readonly hasSecondWeapon: boolean;
  /** Where homing shots steer to. */
  aimTarget?: () => { x: number; y: number } | undefined;

  equip(lo: Loadout): void;
  spawnAt(x: number): void;
  update(dt: number): void;
  takeHit(): void;
  onParry(): void;
  addMeter(amount: number): void;
}
