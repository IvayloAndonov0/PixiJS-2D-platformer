import { currentSave, saveGame } from "./SaveSystem";

/**
 * Fight results, letter grades and per-boss best attempts (stored in the current save file, see SaveSystem).
 *
 * Grade (wins only), out of 100 points. Tune the weights in SCORING:
 *   - Time:     at or under the boss's par time = full, dropping to 0 at twice the par
 *   - HP left:  full HP = full points
 *   - Parries:  `full` parries or more = full points
 *   - Supers:   `full` supers fired or more = full points
 * Losses are recorded as how far the boss's health bar got (0..100%).
 */

export interface FightResult {
  won: boolean;
  /** Seconds in the arena. */
  time: number;
  hpLeft: number;
  maxHp: number;
  parries: number;
  supers: number;
  /** How much of the boss's health was taken, 0..1 (1 on a win). */
  bossDamage: number;
  /** Target clear time for full time points, seconds. */
  parTime: number;
}

export interface BossRecord {
  attempts: number;
  won: boolean;
  /** Best win (by score). */
  bestScore?: number;
  bestGrade?: string;
  bestTime?: number;
  /** Furthest progress on any attempt, 0..1. */
  bestDamage: number;
}

/** Max points per category (should add up to 100) and what earns full points. */
export const SCORING = {
  time: 35,
  hp: 30,
  parries: { points: 20, full: 3 },
  supers: { points: 15, full: 2 },
};

export interface ScoreLine {
  label: string;
  /** What the player did, e.g. "1:10 / 1:30" or "2 / 3". */
  value: string;
  points: number;
  max: number;
}


const GRADES: [number, string][] = [
  [95, "A+"],
  [88, "A"],
  [80, "A-"],
  [72, "B+"],
  [64, "B"],
  [56, "B-"],
  [48, "C+"],
  [40, "C"],
  [30, "C-"],
  [0, "D"],
];

/** Points per category for a win, in display order. */
export function scoreBreakdown(r: FightResult): ScoreLine[] {
  const over = Math.max(0, r.time - r.parTime) / r.parTime;
  const { parries, supers } = SCORING;
  return [
    {
      label: "Time",
      value: `${formatTime(r.time)} / ${formatTime(r.parTime)}`,
      points: Math.round(Math.max(0, 1 - over) * SCORING.time),
      max: SCORING.time,
    },
    {
      label: "HP Left",
      value: `${r.hpLeft} / ${r.maxHp}`,
      points: Math.round((r.hpLeft / r.maxHp) * SCORING.hp),
      max: SCORING.hp,
    },
    {
      label: "Parries",
      value: `${r.parries} / ${parries.full}`,
      points: Math.round((Math.min(r.parries, parries.full) / parries.full) * parries.points),
      max: parries.points,
    },
    {
      label: "Supers",
      value: `${r.supers} / ${supers.full}`,
      points: Math.round((Math.min(r.supers, supers.full) / supers.full) * supers.points),
      max: supers.points,
    },
  ];
}

export function scoreOf(r: FightResult): number {
  return scoreBreakdown(r).reduce((sum, l) => sum + l.points, 0);
}

export function gradeOf(score: number): string {
  return GRADES.find(([min]) => score >= min)![1];
}

export function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/** Best attempt for a boss in the current save file, or undefined if it was never played. */
export function getRecord(bossName: string): BossRecord | undefined {
  return currentSave().bosses[bossName];
}

/**
 * Record a finished fight in the current save file and autosave.
 * Returns whether it beat the previous best (grade on a win, % on a loss).
 */
export function recordResult(bossName: string, r: FightResult): boolean {
  const all = currentSave().bosses;
  const prev = all[bossName];
  const rec: BossRecord = prev ? { ...prev } : { attempts: 0, won: false, bestDamage: 0 };
  rec.attempts++;
  let improved = false;

  if (r.won) {
    const score = scoreOf(r);
    if (rec.bestScore === undefined || score > rec.bestScore) {
      rec.bestScore = score;
      rec.bestGrade = gradeOf(score);
      improved = true;
    }
    if (rec.bestTime === undefined || r.time < rec.bestTime) rec.bestTime = r.time;
    rec.won = true;
  } else if (!rec.won && r.bossDamage > rec.bestDamage) {
    improved = prev !== undefined; // first-ever attempt isn't a "new best"
  }
  rec.bestDamage = Math.max(rec.bestDamage, r.bossDamage);

  all[bossName] = rec;
  saveGame();
  return improved;
}
