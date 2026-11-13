import { currentSave, saveGame } from "./SaveSystem";

/**
 * Shop items, ownership and the equipped loadout (all stored in the current save file).
 *
 * Loadout: 2 weapon slots (switch between them in a fight with the Switch Weapon key) and
 * 1 charm slot. The Blaster is always owned. To add an item: add its id to WeaponId/CharmId,
 * give it an entry in SHOP_ITEMS, then implement it in Player (weapons in `shoot()`, charms in `equip()`).
 */

export type WeaponId = "blaster" | "spread" | "homing";
export type CharmId = "heart" | "shadow";
export type ItemId = WeaponId | CharmId;

export interface ShopItem {
  id: ItemId;
  kind: "weapon" | "charm";
  name: string;
  /** Coins. 0 = owned from the start. */
  price: number;
  description: string;
}

export const SHOP_ITEMS: ShopItem[] = [
  {
    id: "blaster",
    kind: "weapon",
    name: "Blaster",
    price: 0,
    description: "Your trusty starter. Fast, long range, steady damage.",
  },
  {
    id: "spread",
    kind: "weapon",
    name: "Spread Shot",
    price: 4,
    description: "Fires a fan of 3 short-range shots.\nShreds bosses up close, useless far away.",
  },
  {
    id: "homing",
    kind: "weapon",
    name: "Homing Shot",
    price: 4,
    description: "Slower shots that curve toward the boss.\nLower damage, but you can focus on dodging.",
  },
  {
    id: "shadow",
    kind: "charm",
    name: "Shadow Dash",
    price: 4,
    description: "Your dash turns you into a shadow:\npass through bullets and the boss unharmed.",
  },
  {
    id: "heart",
    kind: "charm",
    name: "Extra Heart",
    price: 3,
    description: "+1 max HP in every fight.",
  },
];

export interface Loadout {
  weapons: [WeaponId, WeaponId | null];
  charm: CharmId | null;
}

export const DEFAULT_LOADOUT: Loadout = { weapons: ["blaster", null], charm: null };

export function itemById(id: ItemId): ShopItem {
  return SHOP_ITEMS.find((i) => i.id === id)!;
}

export function isWeapon(id: string): id is WeaponId {
  return SHOP_ITEMS.some((i) => i.id === id && i.kind === "weapon");
}

export function isCharm(id: string): id is CharmId {
  return SHOP_ITEMS.some((i) => i.id === id && i.kind === "charm");
}

// ---------------------------------------------------------------- current save

export function coins(): number {
  return currentSave().coins;
}

export function owns(id: ItemId): boolean {
  return itemById(id).price === 0 || currentSave().owned.includes(id);
}

export function loadout(): Loadout {
  return currentSave().loadout;
}

/** Buy an item. Auto-equips it into an empty slot. Returns false if owned or too expensive. */
export function buy(id: ItemId): boolean {
  const save = currentSave();
  const item = itemById(id);
  if (owns(id) || save.coins < item.price) return false;
  save.coins -= item.price;
  save.owned.push(id);
  if (isWeapon(id) && save.loadout.weapons[1] === null) save.loadout.weapons[1] = id;
  if (isCharm(id) && save.loadout.charm === null) save.loadout.charm = id;
  saveGame();
  return true;
}

/** Put a weapon in slot 0 or 1. If it's already in the other slot, the two swap. */
export function equipWeapon(id: WeaponId, slot: 0 | 1): void {
  if (!owns(id)) return;
  const lo = currentSave().loadout;
  let [a, b] = lo.weapons;
  if (slot === 0) {
    if (b === id) b = a; // swap
    a = id;
  } else {
    if (a === id) {
      // Moving slot A's weapon to B: whatever was in B (or the Blaster) takes slot A.
      a = b ?? "blaster";
      if (a === id) return; // nothing to put in slot A instead
    }
    b = id;
  }
  lo.weapons = [a, b];
  saveGame();
}

/** Remove the weapon from slot B (slot A always has one). */
export function clearWeaponB(): void {
  currentSave().loadout.weapons[1] = null;
  saveGame();
}

export function equipCharm(id: CharmId | null): void {
  if (id !== null && !owns(id)) return;
  currentSave().loadout.charm = id;
  saveGame();
}

export function addCoins(n: number): void {
  currentSave().coins += n;
}
