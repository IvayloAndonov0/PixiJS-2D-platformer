import { GAME_WIDTH, GROUND_Y } from "../../config";
import type { BulletPool } from "../../systems/BulletPool";
import type { Player } from "../Player";
import { Boss, type Attack, type Phase } from "./Boss";

const HOME_X = GAME_WIDTH - 200;

/**
 * Placeholder boss showing how phases and attacks are built.
 * To make a new boss: copy this file, rename the class, and add it to BOSSES in src/bosses.ts.
 */
export class ExampleBoss extends Boss {
  protected phases: Phase[];
  private shotsFired = 0;

  constructor(bullets: BulletPool, player: Player) {
    super("Example Boss", 300, 220, 320, bullets, player);
    this.position.set(HOME_X, GROUND_Y);

    this.phases = [
      { name: "Phase 1", untilHpFraction: 0.6, attacks: [this.aimedBurst, this.ring], restTime: 1.2 },
      { name: "Phase 2", untilHpFraction: 0.25, attacks: [this.aimedBurst, this.hop, this.ring], restTime: 0.9 },
      { name: "Phase 3", untilHpFraction: 0, attacks: [this.ring, this.aimedBurst, this.ring, this.hop], restTime: 0.5 },
    ];
  }

  private get mouth() {
    return { x: this.x - this.bodyW / 2, y: this.y - this.bodyH * 0.6 };
  }

  /** 3 aimed shots, 0.3s apart. The last one is parryable (green). */
  private aimedBurst: Attack = (_dt, t) => {
    const due = Math.min(3, Math.floor(t / 0.3) + 1);
    while (this.shotsFired < due) {
      this.shootAtPlayer(this.mouth.x, this.mouth.y, 500, { parryable: this.shotsFired === 2 });
      this.shotsFired++;
    }
    if (t < 1) return false;
    this.shotsFired = 0;
    return true;
  };

  /** One ring of bullets, every 4th one parryable. */
  private ring: Attack = () => {
    this.shootRing(this.mouth.x, this.mouth.y, 14, 320, Math.random(), 4);
    return true;
  };

  /** Leaps toward the player's side and back. Touching the boss hurts. */
  private hop: Attack = (_dt, t) => {
    const p = Math.min(t / 1.2, 1);
    this.x = HOME_X - Math.sin(p * Math.PI) * 500;
    this.y = GROUND_Y - Math.sin(p * Math.PI) * 180;
    return p >= 1;
  };

  protected override onPhaseChange(index: number): void {
    // TODO: swap art, play a roar, change the arena, etc.
    console.log(`${this.displayName} entered ${this.phases[index].name}`);
  }
}
