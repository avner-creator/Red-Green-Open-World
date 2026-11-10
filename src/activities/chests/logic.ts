/**
 * Pure chest logic (no three, no DOM): the key/lock state machine, the keyhole side test, key
 * placement candidates and the outfit slot rules.
 *
 * Sides are numbered in the chest's local frame: 0 = +Z (front), 1 = +X, 2 = -Z, 3 = -X.
 */
import type { OutfitDef, OutfitSlot } from '../../types';

export const SIDES = 4;
export type Side = 0 | 1 | 2 | 3;

export const CHEST_RULES = {
  /** Largest angle between the player and the keyhole direction that still counts as that side. */
  sideTolerance: Math.PI / 4 + 0.09,
  /** Key pickup radius around the player's chest, metres. */
  keyPickupRadius: 1.7,
  /** Metres from a chest the key floats. */
  keyMinDistance: 6.5,
  keyMaxDistance: 11.5,
} as const;

/** Small deterministic integer hash (mulberry-style); the same input always gives the same bits. */
export function hash32(n: number): number {
  let x = (n | 0) + 0x6d2b79f5;
  x = Math.imul(x ^ (x >>> 15), x | 1);
  x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
  return (x ^ (x >>> 14)) >>> 0;
}

/** Keyhole side of chest `index`. Fixed per chest, so a restart plays the same. */
export function keyholeSide(index: number, count = 6): Side {
  // Spread the sides first (so 6 chests show all 4 sides), then let a hash decide the rotation.
  const base = (index + (hash32(count * 31 + 7) % SIDES)) % SIDES;
  const flip = hash32(index * 977 + 13) % 3 === 0 ? 2 : 0;
  return ((base + flip) % SIDES) as Side;
}

/** Which of the three symbols on the lock ring is the right one (0..2). */
export function rightSymbol(index: number): number {
  return hash32(index * 131 + 5) % 3;
}

/** Unit direction (x, z) of a side in the chest's local frame. */
export function sideDirection(side: number): { x: number; z: number } {
  const a = (side * Math.PI) / 2;
  return { x: Math.round(Math.sin(a)) + 0, z: Math.round(Math.cos(a)) + 0 };
}

export interface SideProbe {
  /** Nearest of the four sides the player stands on. */
  side: Side;
  /** Absolute angle (radians) between the player and the centre line of that side. */
  error: number;
}

/** Which side of the chest (at `cx,cz`, facing `yaw`) is the point `px,pz` on? */
export function playerSide(cx: number, cz: number, yaw: number, px: number, pz: number): SideProbe {
  const dx = px - cx;
  const dz = pz - cz;
  // Rotate into the chest frame (undo yaw about Y).
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  const lx = c * dx - s * dz;
  const lz = s * dx + c * dz;
  const theta = Math.atan2(lx, lz); // 0 = +Z, +pi/2 = +X
  const q = Math.round(theta / (Math.PI / 2));
  const side = (((q % SIDES) + SIDES) % SIDES) as Side;
  return { side, error: Math.abs(theta - q * (Math.PI / 2)) };
}

/** Is the player standing on the keyhole's side? (Needs the right quadrant, not a diagonal.) */
export function onKeyholeSide(
  cx: number,
  cz: number,
  yaw: number,
  keyhole: number,
  px: number,
  pz: number,
  tolerance: number = CHEST_RULES.sideTolerance,
): boolean {
  const dx = px - cx;
  const dz = pz - cz;
  if (dx * dx + dz * dz < 1e-6) return false;
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  const theta = Math.atan2(c * dx - s * dz, s * dx + c * dz);
  const target = (keyhole * Math.PI) / 2;
  let d = Math.abs(theta - target) % (Math.PI * 2);
  if (d > Math.PI) d = Math.PI * 2 - d;
  return d <= tolerance;
}

// ───────────────────────────── Key / lock state machine ─────────────────────────────

export type KeyState = 'ground' | 'carried' | 'used';
export type ChestState = 'locked' | 'open';
export type UseResult = 'no-key' | 'wrong-side' | 'opened' | 'already-open';

export class ChestLock {
  key: KeyState = 'ground';
  chest: ChestState = 'locked';

  constructor(readonly keyholeSide: number) {}

  get hasKey(): boolean {
    return this.key === 'carried';
  }

  get opened(): boolean {
    return this.chest === 'open';
  }

  /** The player touched the floating key. Returns true the first time. */
  pickUp(): boolean {
    if (this.key !== 'ground') return false;
    this.key = 'carried';
    return true;
  }

  /** The player pressed use at the chest from `onCorrectSide`. */
  use(onCorrectSide: boolean): UseResult {
    if (this.chest === 'open') return 'already-open';
    if (this.key !== 'carried') return 'no-key';
    if (!onCorrectSide) return 'wrong-side';
    this.key = 'used';
    this.chest = 'open';
    return 'opened';
  }

  reset(): void {
    this.key = 'ground';
    this.chest = 'locked';
  }
}

// ───────────────────────────── Key placement ─────────────────────────────

export interface KeyCandidate {
  x: number;
  z: number;
}

/**
 * Deterministic candidate key spots around a chest, best first: a hash picks the starting
 * direction, then rings of 6.5..11.5 m are tried in 20 degree steps, nearer rings first.
 * The caller keeps the first one that passes its terrain checks.
 */
export function keyCandidates(index: number, cx: number, cz: number): KeyCandidate[] {
  const out: KeyCandidate[] = [];
  const start = ((hash32(index * 7919 + 3) % 360) * Math.PI) / 180;
  const rings = [8, 9.5, 7, 11, 6.5, 10.5, 11.5];
  for (const r of rings) {
    for (let k = 0; k < 18; k++) {
      // Alternate left/right of the start direction so near-start angles come first.
      const step = Math.ceil(k / 2) * (k % 2 === 0 ? 1 : -1);
      const a = start + (step * Math.PI * 2) / 18;
      out.push({ x: cx + Math.sin(a) * r, z: cz + Math.cos(a) * r });
    }
  }
  return out;
}

/** Pick the first candidate the terrain check accepts (or `fallback`). */
export function pickKeySpot(cands: readonly KeyCandidate[], accept: (c: KeyCandidate) => boolean): KeyCandidate | null {
  for (const c of cands) if (accept(c)) return c;
  return null;
}

// ───────────────────────────── Outfits ─────────────────────────────

export interface EquipResult {
  slot: OutfitSlot;
  /** Id that was in the slot before (null when it was empty). */
  replaced: string | null;
  /** The outfit is new to the collection. */
  unlocked: boolean;
}

/** One item per slot; a newer item replaces the older one. */
export class Loadout {
  private readonly slots = new Map<OutfitSlot, string>();
  private readonly owned: string[] = [];

  equip(def: Pick<OutfitDef, 'id' | 'slot'>): EquipResult {
    const unlocked = !this.owned.includes(def.id);
    if (unlocked) this.owned.push(def.id);
    const replaced = this.slots.get(def.slot) ?? null;
    this.slots.set(def.slot, def.id);
    return { slot: def.slot, replaced: replaced === def.id ? null : replaced, unlocked };
  }

  worn(slot: OutfitSlot): string | null {
    return this.slots.get(slot) ?? null;
  }

  isWorn(id: string): boolean {
    for (const v of this.slots.values()) if (v === id) return true;
    return false;
  }

  /** Every outfit unlocked so far (worn or replaced), in unlock order. */
  unlockedIds(): readonly string[] {
    return this.owned;
  }

  reset(): void {
    this.slots.clear();
    this.owned.length = 0;
  }
}
