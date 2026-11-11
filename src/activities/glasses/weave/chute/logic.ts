/**
 * Pure maths for the skydive glasses part (`./index.ts`): the parachute-open ring (timeIt) and the
 * weak-eye gem that only counts through a strong-eye hoop (lineUp). No three, no DOM; unit-tested.
 */
import type { GlassesTier } from '../../../../types';

export interface P3 {
  x: number;
  y: number;
  z: number;
}

export const CHUTE = {
  /** Target height above ground for the perfect open: random in [min, max] each jump. */
  targetMin: 70,
  targetMax: 120,
  /** Hit window (± metres of the target) by tier. */
  window: { 1: 8, 2: 5, 3: 3 } as Readonly<Record<GlassesTier, number>>,
  /** A manual open farther than the window but within this of the target is a miss. */
  nearMiss: 20,
  /** Gems for a ring hit by tier. */
  pay: { 1: 2, 2: 3, 3: 5 } as Readonly<Record<GlassesTier, number>>,
  /** The closing ring starts this many metres above the target and meets it at `perfectAt`. */
  span: 45,
  perfectAt: 0.8,
  /** Ring look (metres): target ring round the hero, closing ring's start, line width. */
  ringRadius: 1.9,
  ringStart: 5.2,
  ringThickness: 0.34,
  /** Flash after a hit (on the weak layer): seconds. */
  flashSeconds: 0.9,
} as const;

export const HOOP = {
  /** Hoop radius (metres): a pass whose crossing point is within it went through. */
  radius: 3,
  thickness: 0.55,
  /** The gem counts as inside while its centre is within this of the hoop centre (in the plane). */
  inside: 2.6,
  /** Hoop height above ground: random in [min, max]. */
  heightMin: 100,
  heightMax: 130,
  /** Sideways from the gem trail (hands-off freefall passes beside it), and from every trail gem. */
  offset: 8.5,
  minSpotDistance: 8,
  /** Orbit period (seconds) at tier 1 (tier speed scales it). */
  period: 6.5,
  /** Gems for a hit. */
  pay: 3,
  /** Gem scale at tier 1 (the game's gem mesh is ~1 m across). */
  gemScale: 1.9,
  /** Target fraction of time the gem is inside the hoop. */
  insideFraction: 0.4,
} as const;

// ───────────────────────────── tiers ─────────────────────────────

/** Staircase per session: up one after a hit, down one after a miss. */
export function stepTier(tier: GlassesTier, hit: boolean): GlassesTier {
  if (hit) return tier >= 3 ? 3 : ((tier + 1) as GlassesTier);
  return tier <= 1 ? 1 : ((tier - 1) as GlassesTier);
}

// ───────────────────────────── ring (timeIt) ─────────────────────────────

/** Random target height, not a round number (continuous). */
export function pickTarget(rng: () => number): number {
  return CHUTE.targetMin + (CHUTE.targetMax - CHUTE.targetMin) * rng();
}

/** Closing-ring position 0..1 for a height above ground: 0 at target + span, `perfectAt` at the target. */
export function ringT(agl: number, target: number): number {
  const t = ((target + CHUTE.span - agl) / CHUTE.span) * CHUTE.perfectAt;
  return t < 0 ? 0 : t > 1 ? 1 : t;
}

/** The hit window in `t` units (for the timing ring's "now" highlight). */
export function windowT(tier: GlassesTier): number {
  return (CHUTE.window[tier] / CHUTE.span) * CHUTE.perfectAt;
}

export type Outcome = 'hit' | 'miss' | null;

/**
 * Result of a parachute open at `openAgl`. `auto` (the ride's own safety open) never counts; a
 * manual open within the tier's window is a hit, within `nearMiss` a miss, anything farther no
 * result (the child was not playing the ring).
 */
export function ringOutcome(openAgl: number, target: number, tier: GlassesTier, auto: boolean): Outcome {
  if (auto) return null;
  const d = Math.abs(openAgl - target);
  if (d <= CHUTE.window[tier]) return 'hit';
  if (d <= CHUTE.nearMiss) return 'miss';
  return null;
}

// ───────────────────────────── hoop gem (lineUp) ─────────────────────────────

/**
 * The gem's orbit in the hoop's (horizontal) plane: a circle of radius `r` whose centre sits `r`
 * from the hoop centre, so it passes right through the middle of the hoop and swings out past the
 * rim. Solved so the gem is inside the hoop a `fraction` of the time (40 %: r ≈ 2.2 m, so the gem
 * swings out to ≈ 4.4 m, well past the 3 m rim).
 */
export function orbitRadius(inside: number = HOOP.inside, fraction: number = HOOP.insideFraction): number {
  // Inside ⇔ |c + r(cos θ, sin θ)| < inside with |c| = r ⇔ 2r²(1 + cos θ') < inside², θ' = θ − angle(c) − π.
  // Fraction of θ inside = 1 − acos(inside² / (2r²) − 1) / π  →  solve for r.
  const c = Math.cos(Math.PI * (1 - fraction));
  return inside / Math.sqrt(2 * (1 + c));
}

/** Gem offset from the hoop centre (x, z) at orbit angle `theta` (θ = π is the hoop centre). */
export function gemOffset(theta: number, r: number = orbitRadius(), dir = 0): { x: number; z: number } {
  // Orbit centre at r along `dir`; θ measured from that direction.
  const cx = Math.cos(dir) * r;
  const cz = Math.sin(dir) * r;
  return { x: cx + Math.cos(dir + theta) * r, z: cz + Math.sin(dir + theta) * r };
}

export function gemIsInside(theta: number, r: number = orbitRadius()): boolean {
  const o = gemOffset(theta, r);
  return Math.hypot(o.x, o.z) < HOOP.inside;
}

/** An orbit angle deep inside (the hoop centre) or deep outside (the far side of the orbit). */
export function thetaFor(inside: boolean): number {
  return inside ? Math.PI : 0;
}

/**
 * Did the segment a → b pass DOWN or UP through the horizontal disc (centre `c`, radius `radius`)?
 * Returns the crossing point's distance from the centre, or null when it did not cross the plane
 * (or crossed it outside the radius). Exact for any segment length, so fast falls cannot skip it.
 */
export function crossDisc(a: P3, b: P3, c: P3, radius: number): number | null {
  const da = a.y - c.y;
  const db = b.y - c.y;
  if (da === db || (da > 0 && db > 0) || (da < 0 && db < 0)) return null;
  if (da === 0 && db === 0) return null;
  const k = da / (da - db);
  const x = a.x + (b.x - a.x) * k - c.x;
  const z = a.z + (b.z - a.z) * k - c.z;
  const d = Math.hypot(x, z);
  return d <= radius ? d : null;
}

/** Did the segment a → b cross the hoop's plane at all (inside or outside the rim)? */
export function crossesPlane(a: P3, b: P3, c: P3): boolean {
  const da = a.y - c.y;
  const db = b.y - c.y;
  return (da >= 0 && db < 0) || (da <= 0 && db > 0);
}

export function hoopOutcome(throughHoop: boolean, gemInside: boolean): Outcome {
  if (!throughHoop) return null;
  return gemInside ? 'hit' : 'miss';
}

/**
 * Hoop placement: on the gem trail (sorted highest first) at `height` above the ground, pushed
 * `offset` sideways (side ±1) so the hands-off freefall passes beside it, and at least
 * `HOOP.minSpotDistance` from every trail gem. Returns null if the trail is too short.
 */
export function placeHoop(trailDown: readonly P3[], groundAt: (x: number, z: number) => number, height: number, side: 1 | -1, offset: number = HOOP.offset): P3 | null {
  for (let i = 0; i + 1 < trailDown.length; i++) {
    const a = trailDown[i];
    const b = trailDown[i + 1];
    const ha = a.y - groundAt(a.x, a.z);
    const hb = b.y - groundAt(b.x, b.z);
    if (!(ha >= height && hb <= height)) continue;
    const k = ha === hb ? 0.5 : Math.min(0.85, Math.max(0.15, (ha - height) / (ha - hb)));
    const p = { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, z: a.z + (b.z - a.z) * k };
    let dx = b.x - a.x;
    let dz = b.z - a.z;
    const len = Math.hypot(dx, dz) || 1;
    dx /= len;
    dz /= len;
    // Perpendicular, pushed further out until it is clear of every trail gem.
    for (let push = offset; push < offset + 20; push += 1) {
      const q = { x: p.x - dz * push * side, y: p.y, z: p.z + dx * push * side };
      if (trailDown.every((s) => Math.hypot(s.x - q.x, s.y - q.y, s.z - q.z) >= HOOP.minSpotDistance)) return q;
    }
    return null;
  }
  return null;
}
