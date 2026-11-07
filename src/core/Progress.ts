/**
 * Fight results, letter grades and per-boss best attempts (saved in localStorage).
 *
 * Grade (wins only), out of 100 points:
 *   - HP left:  up to 40  (full HP = 40)
 *   - Parries:  up to 20  (PARRIES_FOR_FULL or more = 20)
 *   - Time:     up to 40  (at or under the boss's par time = 40, dropping to 0 at twice the par)
 * Losses are recorded as how far the boss's health bar got (0..100%).
 */

export interface FightResult {
  won: boolean;
  /** Seconds in the arena. */
  time: number;
  hpLeft: number;
  maxHp: number;
  parries: number;
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

const PARRIES_FOR_FULL = 3;
const STORAGE_KEY = "boss-rush.progress.v1";

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

export function scoreOf(r: FightResult): number {
  const hp = (r.hpLeft / r.maxHp) * 40;
  const parry = (Math.min(r.parries, PARRIES_FOR_FULL) / PARRIES_FOR_FULL) * 20;
  const over = Math.max(0, r.time - r.parTime) / r.parTime;
  const time = Math.max(0, 1 - over) * 40;
  return Math.round(hp + parry + time);
}

export function gradeOf(score: number): string {
  return GRADES.find(([min]) => score >= min)![1];
}

export function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function loadAll(): Record<string, BossRecord> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const data = raw ? JSON.parse(raw) : {};
    return data && typeof data === "object" ? data : {};
  } catch {
    return {};
  }
}

/** Best attempt for a boss, or undefined if it was never played. Keyed by boss name. */
export function getRecord(bossName: string): BossRecord | undefined {
  return loadAll()[bossName];
}

/** Save a finished fight. Returns whether it beat the previous best (grade on a win, % on a loss). */
export function recordResult(bossName: string, r: FightResult): boolean {
  const all = loadAll();
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
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  } catch {
    // Storage blocked: progress just won't persist.
  }
  return improved;
}
