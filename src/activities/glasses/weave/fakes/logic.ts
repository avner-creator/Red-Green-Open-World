/**
 * "The real gem among fakes" (pure, no three, no DOM): which gem spots get a cluster, where the
 * two fakes stand, which gem the hero touched first along its path, and the per-session tier.
 *
 * The three gems (real + 2 fakes) stand on the corners of an equilateral triangle; the real gem is
 * the corner `answer` (0..2), so its place in the cluster says nothing. Sides are long enough that
 * the real gem's pickup sphere and a fake's touch sphere never overlap: a child running through
 * the cluster always touches one of them strictly first.
 */
import type { GlassesTier } from '../../../../types';

export interface XZ {
  x: number;
  z: number;
}
export interface P3 {
  x: number;
  y: number;
  z: number;
}

export const FAKES = {
  /** Cluster spots per session world, and their minimum spacing (m). */
  count: 4,
  minGap: 25,
  /** A gem spot qualifies only if it floats at most this high over the ground (no fountain top, roofs, galleries). */
  maxFloat: 1.6,
  /**
   * Arming: inside `armNear` (m) the fakes always appear; between `armNear` and `armFar` they appear
   * as soon as the cluster is out of the camera's view (so a child walking up usually never sees
   * two gems pop in next to one they already saw). Beyond `disarm` an undecided cluster is removed.
   */
  armNear: 15,
  armFar: 28,
  disarm: 32,
  /** Triangle side (m): ≥ realRadius + fakeRadius + 0.4 so the spheres never overlap. */
  side: 3.3,
  /** Pickup radius of the real gem (= GEMS.pickupRadius) and touch radius of a fake (m). */
  realRadius: 1.6,
  fakeRadius: 1.0,
  /** Gems on top of the real gem's own pay for telling it apart. */
  bonus: 2,
  /** Hits in a row before the tell gets finer. */
  upAfter: 2,
  /** Poof length (s), and the delay before the untouched fake poofs after a miss. */
  poof: 0.45,
  afterMiss: 0.6,
  /** Clearances: glasses sites (beyond their radius + play radius), reserved footprints, anchors. */
  siteMargin: 4,
  reservedPad: 3,
  anchorMargin: 3,
} as const;

/** Spot tags that are ordinary ground gems (no rooftop, trampoline column, skydive, bridge, road, secret). */
export const FAKE_TAGS: readonly string[] = ['plaza', 'beach', 'ranch', 'lighthouse', 'silly'];

/** What gives a fake away, per tier (each fake differs from the real gem in this one way only). */
export type Tell = 'spin' | 'facets' | 'sparkle';
export const TELLS: Readonly<Record<GlassesTier, Tell>> = { 1: 'spin', 2: 'facets', 3: 'sparkle' };
/** Facets of the real gem (gems.ts `buildGemGeometry`) and of a tier-2 fake. */
export const REAL_FACETS = 8;
export const FAKE_FACETS = 5;

export interface SpotInfo {
  /** Index in `ctx.world.gemSpots` (gem id `gem<index>`). */
  index: number;
  x: number;
  y: number;
  z: number;
  tag: string;
  /** Ground height under the spot. */
  ground: number;
}

export interface Exclusions {
  /** Keep-clear circles (glasses sites, attraction anchors), radius already including the margin. */
  circles: readonly { x: number; z: number; r: number }[];
  /** True when (x, z) is inside a reserved footprint (with its pad). */
  reserved(x: number, z: number): boolean;
}

/** Ordinary low ground spots that are clear of glasses sites, reserved footprints and attractions. */
export function eligibleSpots(spots: readonly SpotInfo[], ex: Exclusions): SpotInfo[] {
  return spots.filter((s) => {
    if (!FAKE_TAGS.includes(s.tag)) return false;
    if (s.y - s.ground > FAKES.maxFloat) return false;
    if (ex.reserved(s.x, s.z)) return false;
    return ex.circles.every((c) => Math.hypot(s.x - c.x, s.z - c.z) >= c.r);
  });
}

/**
 * Pick up to `n` spots, pairwise ≥ `minGap` apart, in a random order from `rng`. The first pick is
 * a plaza spot when there is one (the plaza is where every session goes).
 */
export function pickSpots(cands: readonly SpotInfo[], rng: () => number, n: number = FAKES.count, minGap: number = FAKES.minGap): SpotInfo[] {
  const order = cands.map((c) => ({ c, k: rng() }));
  order.sort((a, b) => a.k - b.k);
  const list = order.map((o) => o.c);
  const firstPlaza = list.findIndex((c) => c.tag === 'plaza');
  if (firstPlaza > 0) list.unshift(...list.splice(firstPlaza, 1));
  const out: SpotInfo[] = [];
  for (const c of list) {
    if (out.length >= n) break;
    if (out.every((o) => Math.hypot(o.x - c.x, o.z - c.z) >= minGap)) out.push(c);
  }
  return out;
}

/**
 * Corners of the cluster triangle (side `side`, rotated by `angle`) placed so that corner
 * `answer` is exactly the real gem. Returns the three corners in order 0, 1, 2.
 */
export function triangle(real: XZ, answer: number, angle: number, side: number = FAKES.side): XZ[] {
  const R = side / Math.sqrt(3);
  const corner = (k: number): XZ => ({ x: Math.cos(angle + (k * 2 * Math.PI) / 3) * R, z: Math.sin(angle + (k * 2 * Math.PI) / 3) * R });
  const a = corner(answer);
  return [0, 1, 2].map((k) => {
    const c = corner(k);
    return { x: real.x + c.x - a.x, z: real.z + c.z - a.z };
  });
}

/**
 * Where along the segment a→b (0..1) the point first comes within `r` of `c`: 0 when `a` is
 * already inside, null when the segment never comes that close.
 */
export function firstEntry(a: P3, b: P3, c: P3, r: number): number | null {
  const fx = a.x - c.x;
  const fy = a.y - c.y;
  const fz = a.z - c.z;
  const C = fx * fx + fy * fy + fz * fz - r * r;
  if (C <= 0) return 0;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dz = b.z - a.z;
  const A = dx * dx + dy * dy + dz * dz;
  if (A < 1e-12) return null;
  const B = 2 * (fx * dx + fy * dy + fz * dz);
  const disc = B * B - 4 * A * C;
  if (disc < 0) return null;
  const t = (-B - Math.sqrt(disc)) / (2 * A);
  return t >= 0 && t <= 1 ? t : null;
}

export interface Touch {
  /** 'fake' = a fake was touched first (index in `fakes`); 'real' = the real gem first; null = neither. */
  first: 'real' | 'fake' | null;
  fake: number;
}

/**
 * Which gem the path a→b touched first. `real` is null when the real gem is gone; `realBefore`
 * means it was already collected on an earlier segment (it then counts as touched first).
 */
export function firstTouch(a: P3, b: P3, real: P3 | null, fakes: readonly (P3 | null)[], realBefore = false, rReal: number = FAKES.realRadius, rFake: number = FAKES.fakeRadius): Touch {
  let tf = Infinity;
  let fi = -1;
  fakes.forEach((f, i) => {
    if (!f) return;
    const t = firstEntry(a, b, f, rFake);
    if (t !== null && t < tf) {
      tf = t;
      fi = i;
    }
  });
  let tr: number | null = real ? firstEntry(a, b, real, rReal) : null;
  if (tr === null && realBefore) tr = -1;
  if (fi >= 0 && (tr === null || tf < tr)) return { first: 'fake', fake: fi };
  if (tr !== null) return { first: 'real', fake: -1 };
  return { first: null, fake: -1 };
}

export interface Ladder {
  tier: GlassesTier;
  /** Hits in a row since the last tier change or miss. */
  streak: number;
}

/** Tier rises after `upAfter` hits in a row, falls one step after a miss. */
export function nextLadder(l: Ladder, hit: boolean): Ladder {
  if (!hit) return { tier: (l.tier > 1 ? l.tier - 1 : 1) as GlassesTier, streak: 0 };
  const streak = l.streak + 1;
  if (streak >= FAKES.upAfter && l.tier < 3) return { tier: (l.tier + 1) as GlassesTier, streak: 0 };
  return { tier: l.tier, streak };
}
