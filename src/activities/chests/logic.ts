/**
 * Pure chest logic (no three, no DOM): the key/symbol-lock state machine, the button ring layout,
 * the once-per-approach hints, key placement candidates and the outfit slot rules.
 *
 * There is no "right side" to a chest: any direction works. Sides are only used to lay out the
 * key slots on the four plates (0 = +Z front, 1 = +X, 2 = -Z, 3 = -X).
 */
import type { OutfitDef, OutfitSlot } from '../../types';

export const CHEST_RULES = {
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

/** Which of the three symbols (0 star, 1 moon, 2 circle) opens chest `index`. Fixed per chest per session. */
export function rightSymbol(index: number): number {
  return hash32(index * 131 + 5) % 3;
}

/** Unit direction (x, z) of a side in the chest's local frame (0 = +Z, 1 = +X, 2 = -Z, 3 = -X). */
export function sideDirection(side: number): { x: number; z: number } {
  const a = (side * Math.PI) / 2;
  return { x: Math.round(Math.sin(a)) + 0, z: Math.round(Math.cos(a)) + 0 };
}

// ───────────────────────────── Symbol ring ─────────────────────────────

export const RING = {
  /** Six floor buttons: three symbols, each twice (opposite each other), so a right one is always near. */
  count: 6,
  /** Metres from the chest centre to a button centre. */
  radius: 2.3,
  /** Button width, metres. */
  size: 1.2,
  /** A button counts as stepped on when the player's feet are this close to its centre. */
  stepRadius: 0.62,
  /** Seconds a wrong button stays sunk. */
  sunkSeconds: 2,
  /** Pressing E picks the nearest button within this distance. */
  useReach: 2.6,
} as const;

export interface RingButton {
  /** 0..count-1 */
  index: number;
  /** 0 star, 1 moon, 2 circle. */
  symbol: number;
  /** Angle in the chest's local frame (0 = +Z, +pi/2 = +X). */
  angle: number;
}

/** Symbols go star, moon, circle, star, moon, circle: each appears twice, opposite its twin. */
export function ringButtons(count: number = RING.count): RingButton[] {
  return Array.from({ length: count }, (_, i) => ({ index: i, symbol: i % 3, angle: (i * Math.PI * 2) / count }));
}

/** World x,z of a ring button for a chest at `cx,cz` turned by `yaw`. */
export function buttonWorld(cx: number, cz: number, yaw: number, angle: number, radius: number = RING.radius): { x: number; z: number } {
  const lx = Math.sin(angle) * radius;
  const lz = Math.cos(angle) * radius;
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  return { x: cx + c * lx + s * lz, z: cz - s * lx + c * lz };
}

/** Index of the button nearest to `px,pz` within `reach` (or -1). `pts` are button world positions. */
export function nearestButton(pts: readonly { x: number; z: number }[], px: number, pz: number, reach: number): number {
  let best = -1;
  let bd = reach * reach;
  pts.forEach((p, i) => {
    const d = (p.x - px) ** 2 + (p.z - pz) ** 2;
    if (d <= bd) {
      bd = d;
      best = i;
    }
  });
  return best;
}

export type HintKind = 'find-key' | 'step-shape';

/**
 * Says each hint once per approach: "Find the key!" when a player without the key comes near, and
 * "Step on the right shape!" once the key is in hand while near. Leaving (beyond `exitRadius`)
 * re-arms both. Pure: feed it the distance and key state every frame.
 */
export class ApproachHints {
  private said = { find: false, shape: false };
  private near = false;

  constructor(
    readonly enterRadius = 5,
    readonly exitRadius = 7.5,
  ) {}

  /** Is the player inside the approach zone right now? */
  get isNear(): boolean {
    return this.near;
  }

  update(dist: number, hasKey: boolean, open: boolean): HintKind | null {
    if (open) {
      this.near = false;
      return null;
    }
    if (this.near && dist > this.exitRadius) {
      this.near = false;
      this.said = { find: false, shape: false };
    } else if (!this.near && dist <= this.enterRadius) {
      this.near = true;
    }
    if (!this.near) return null;
    if (!hasKey && !this.said.find) {
      this.said.find = true;
      return 'find-key';
    }
    if (hasKey && !this.said.shape) {
      this.said.shape = true;
      return 'step-shape';
    }
    return null;
  }

  reset(): void {
    this.said = { find: false, shape: false };
    this.near = false;
  }
}

// ───────────────────────────── Key / lock state machine ─────────────────────────────

export type KeyState = 'ground' | 'carried' | 'used';
export type ChestState = 'locked' | 'open';
export type UseResult = 'no-key' | 'wrong-symbol' | 'opened' | 'already-open';

export class ChestLock {
  key: KeyState = 'ground';
  chest: ChestState = 'locked';
  /** Wrong shapes tried with the key in hand (for a friendly guide; never a penalty). */
  wrongTries = 0;

  constructor(readonly symbol: number) {}

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

  /** The player stepped on (or pressed E at) a button showing `symbol`, from any direction. */
  press(symbol: number): UseResult {
    if (this.chest === 'open') return 'already-open';
    if (this.key !== 'carried') return 'no-key';
    if (symbol !== this.symbol) {
      this.wrongTries++;
      return 'wrong-symbol';
    }
    this.key = 'used';
    this.chest = 'open';
    return 'opened';
  }

  reset(): void {
    this.key = 'ground';
    this.chest = 'locked';
    this.wrongTries = 0;
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

// ───────────────────────────── Both-eye key area hint ─────────────────────────────

export const AREA = {
  /** Radius of the dotted "search here" circle, metres. */
  radius: 3.2,
  /** The circle's centre is this far from the key, so the key is never at its centre. */
  offset: 2.0,
  /** The offset turns at most this far (radians) from the chest → key direction (keeps the circle off the chest's buttons). */
  maxTurn: 1.2,
  /** Dots on the circle and the spacing of the trail dots, metres. */
  ringDots: 16,
  trailGap: 0.9,
} as const;

export interface KeyArea {
  /** Centre of the dotted circle (the key lies inside it, never at its centre). */
  x: number;
  z: number;
  r: number;
  /** Dots from the chest's button ring out to the circle's edge. */
  trail: { x: number; z: number }[];
  /** Dots on the circle. */
  ring: { x: number; z: number }[];
}

/**
 * The both-eye hint for where to look for chest `index`'s key: a short dotted trail from the chest
 * that ends in a dotted circle. The key (weak-eye only) is somewhere inside the circle but never at
 * its centre, so the strong eye learns only the area, never the spot. Deterministic per chest.
 */
export function keyArea(index: number, cx: number, cz: number, kx: number, kz: number): KeyArea {
  const base = Math.atan2(kx - cx, kz - cz);
  const turn = ((hash32(index * 977 + 41) % 1000) / 1000 - 0.5) * 2 * AREA.maxTurn;
  const a = base + turn;
  const x = kx + Math.sin(a) * AREA.offset;
  const z = kz + Math.cos(a) * AREA.offset;
  const dx = x - cx;
  const dz = z - cz;
  const d = Math.hypot(dx, dz) || 1;
  const ux = dx / d;
  const uz = dz / d;
  const from = RING.radius + 1.2;
  const to = d - AREA.radius;
  const trail: { x: number; z: number }[] = [];
  const n = Math.max(0, Math.floor((to - from) / AREA.trailGap));
  for (let i = 0; i <= n; i++) {
    const t = from + i * AREA.trailGap;
    if (t > to) break;
    trail.push({ x: cx + ux * t, z: cz + uz * t });
  }
  const ring = Array.from({ length: AREA.ringDots }, (_, i) => {
    const b = (i / AREA.ringDots) * Math.PI * 2;
    return { x: x + Math.sin(b) * AREA.radius, z: z + Math.cos(b) * AREA.radius };
  });
  return { x, z, r: AREA.radius, trail, ring };
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
