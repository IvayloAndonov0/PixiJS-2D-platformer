import { BOSSES } from "../bosses";
import type { BossRecord } from "./Progress";

/**
 * Save files: SLOT_COUNT slots in localStorage, one self-contained JSON blob each.
 *
 * Everything about a playthrough lives in SaveData (key bindings stay global, in Input).
 * `serialize` / `deserialize` are the only way data goes in and out of storage, so a future
 * export/import feature can reuse them to write/read a .json file.
 *
 * With no file selected (e.g. the ?fight / ?map dev shortcuts) the game plays on a scratch
 * save that is never written to storage.
 */

export const SLOT_COUNT = 3;
const SAVE_VERSION = 1;
const KEY_PREFIX = "boss-rush.save.slot";

export interface SaveData {
  version: number;
  /** ms timestamps */
  created: number;
  lastPlayed: number;
  /** Where the player stands on the overworld map. Undefined = map start. */
  mapPos?: { x: number; y: number };
  /** Best attempt per boss, keyed by boss name. */
  bosses: Record<string, BossRecord>;
}

let activeSlot: number | undefined;
let active: SaveData = freshSave();

function freshSave(): SaveData {
  const now = Date.now();
  return { version: SAVE_VERSION, created: now, lastPlayed: now, bosses: {} };
}

// ---------------------------------------------------------------- (de)serialization

export function serialize(data: SaveData): string {
  return JSON.stringify(data);
}

/** Parse and validate a save. Returns undefined for anything malformed. */
export function deserialize(raw: string): SaveData | undefined {
  try {
    const d = JSON.parse(raw) as Partial<SaveData>;
    if (!d || typeof d !== "object" || typeof d.version !== "number" || d.version > SAVE_VERSION) return undefined;
    const bosses: Record<string, BossRecord> = {};
    if (d.bosses && typeof d.bosses === "object") {
      for (const [name, rec] of Object.entries(d.bosses)) {
        if (rec && typeof rec === "object" && typeof rec.attempts === "number") bosses[name] = rec;
      }
    }
    const pos = d.mapPos;
    return {
      version: SAVE_VERSION,
      created: typeof d.created === "number" ? d.created : Date.now(),
      lastPlayed: typeof d.lastPlayed === "number" ? d.lastPlayed : Date.now(),
      mapPos: pos && typeof pos.x === "number" && typeof pos.y === "number" ? { x: pos.x, y: pos.y } : undefined,
      bosses,
    };
  } catch {
    return undefined;
  }
}

// ---------------------------------------------------------------- slots

/** What's in each slot (undefined = empty), for the file-select screen. */
export function listSlots(): (SaveData | undefined)[] {
  return Array.from({ length: SLOT_COUNT }, (_, i) => readSlot(i));
}

function readSlot(slot: number): SaveData | undefined {
  try {
    const raw = localStorage.getItem(KEY_PREFIX + slot);
    return raw ? deserialize(raw) : undefined;
  } catch {
    return undefined;
  }
}

/** Make `slot` the active save: continue it if it exists, otherwise start a new game there. */
export function openSlot(slot: number): void {
  activeSlot = slot;
  active = readSlot(slot) ?? freshSave();
  saveGame();
}

export function deleteSlot(slot: number): void {
  try {
    localStorage.removeItem(KEY_PREFIX + slot);
  } catch {
    // ignore
  }
  if (activeSlot === slot) {
    activeSlot = undefined;
    active = freshSave();
  }
}

// ---------------------------------------------------------------- active save

/** The save being played. Mutate it, then call saveGame(). */
export function currentSave(): SaveData {
  return active;
}

/** Write the active save to its slot. Returns false if there's no slot or storage failed. */
export function saveGame(): boolean {
  if (activeSlot === undefined) return false;
  active.lastPlayed = Date.now();
  try {
    localStorage.setItem(KEY_PREFIX + activeSlot, serialize(active));
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------- summaries

/** Story completion, 0..1: bosses beaten out of all bosses in the game. */
export function storyProgress(data: SaveData): number {
  if (BOSSES.length === 0) return 0;
  return BOSSES.filter((b) => data.bosses[b.name]?.won).length / BOSSES.length;
}

export function formatDate(ms: number): string {
  return new Date(ms).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
