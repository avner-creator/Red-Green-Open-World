/**
 * Pure timing rules of the perfect-bounce ring (no three, no DOM): unit-tested in
 * `tests/activities/glasses-weave-bounce.test.ts`.
 *
 * One trampoline fall = from the apex (vy turns ≤ 0) to touchdown. A fall long enough gets a plan:
 * a random "perfect" moment between 20 % and 80 % of the fall (never in the landing zone: the
 * touchdown is visible to both eyes), and a hit window around it that narrows by tier.
 *
 * The attempt is exactly ONE press before the landing zone (`FallPresses`): no press, a press only
 * in the last 0.35 s (the ordinary landing press) or two and more presses (mashing) give no result.
 * The best FIXED guessing strategy is measured in the unit simulation (see the table there).
 */
import type { GlassesTier } from '../../../../types';

export const BOUNCE_RING = {
  /**
   * Shortest fall (s) that gets a ring. 0.95 s = a 10 m bounce: medium bounces get one too (the
   * walk-on 12 m, 1.04 s, and the decaying 10.7 m ones), not only held big bounces (QA8 m9).
   */
  minFall: 0.95,
  /** A press this close (s) to touchdown is the ordinary landing press: never counted. */
  landingIgnore: 0.35,
  /** The perfect moment lies between these shares of the fall. */
  earliest: 0.2,
  latest: 0.8,
  /** Half-width (s) of the hit window by tier: ±180 ms at tier 1 so an 8-year-old makes it (QA8 m9). */
  goodHalf: { 1: 0.18, 2: 0.15, 3: 0.12 } as Readonly<Record<GlassesTier, number>>,
  /** Within this share of the half-width the hit is "perfect". */
  perfectShare: 0.45,
  /** Keep the window's end this far (s) before the ignored landing zone. */
  margin: 0.02,
  /** Gems for a hit by tier. */
  gems: { 1: 1, 2: 2, 3: 3 } as Readonly<Record<GlassesTier, number>>,
  /** Perfects in a row for the streak bonus, and the bonus. */
  streakLength: 3,
  streakBonus: 3,
  /** Hits in a row to go up a tier. */
  hitsToRise: 2,
} as const;

export interface FallPlan {
  /** Fall duration (s) from the moment the ring appears to touchdown. */
  fall: number;
  /** Seconds after the fall start at which the closing ring meets its target. */
  perfect: number;
  /** Hit window half-width (s). */
  half: number;
  /** "Perfect" half-width (s). */
  perfectHalf: number;
  tier: GlassesTier;
}

/** The window half-width for a fall at a tier. */
export function windowHalf(_fall: number, tier: GlassesTier): number {
  return BOUNCE_RING.goodHalf[tier];
}

/** Earliest and latest perfect moment for a fall (s after the fall start), or null if too short. */
export function perfectRange(fall: number, tier: GlassesTier): { lo: number; hi: number } | null {
  const R = BOUNCE_RING;
  if (!(fall >= R.minFall)) return null;
  const half = windowHalf(fall, tier);
  const lo = R.earliest * fall;
  const hi = Math.min(R.latest * fall, fall - R.landingIgnore - half - R.margin);
  return hi > lo ? { lo, hi } : null;
}

/**
 * Plan a fall. `u` (0..1, from the part's seeded rng) picks the perfect moment; `share` (0..1,
 * test hook) picks it as a share of the allowed range instead. Null when the fall is too short.
 */
export function planFall(fall: number, tier: GlassesTier, u: number, share?: number | null): FallPlan | null {
  const range = perfectRange(fall, tier);
  if (!range) return null;
  const k = share ?? u;
  const perfect = range.lo + (range.hi - range.lo) * Math.min(1, Math.max(0, k));
  const half = windowHalf(fall, tier);
  return { fall, perfect, half, perfectHalf: half * BOUNCE_RING.perfectShare, tier };
}

export type PressGrade =
  | { kind: 'ignore' }
  | { kind: 'hit'; perfect: boolean; offset: number }
  | { kind: 'miss'; offset: number };

/** Grade a press `at` seconds after the fall start. */
export function gradePress(plan: FallPlan, at: number): PressGrade {
  if (at < 0 || at > plan.fall - BOUNCE_RING.landingIgnore) return { kind: 'ignore' };
  const offset = at - plan.perfect;
  const a = Math.abs(offset);
  if (a <= plan.half) return { kind: 'hit', perfect: a <= plan.perfectHalf, offset };
  return { kind: 'miss', offset };
}

/** True when a press `at` s after the fall start lies in the landing zone (never counted). */
export function inLandingZone(plan: FallPlan, at: number): boolean {
  return at > plan.fall - BOUNCE_RING.landingIgnore;
}

export type FallOutcome = PressGrade | { kind: 'none' } | { kind: 'mash' };

/**
 * The presses of one fall. Presses in the landing zone are ignored entirely; the fall is settled
 * once the landing zone starts: exactly one press = graded, none = no result, two or more = mashing
 * (no result).
 */
export class FallPresses {
  presses = 0;
  firstAt = -1;

  press(plan: FallPlan, at: number): void {
    if (inLandingZone(plan, at)) return;
    this.presses++;
    if (this.presses === 1) this.firstAt = at;
  }

  settle(plan: FallPlan): FallOutcome {
    if (this.presses === 0) return { kind: 'none' };
    if (this.presses > 1) return { kind: 'mash' };
    return gradePress(plan, this.firstAt);
  }
}

/** Session progress: tier, hits in a row, perfects in a row. */
export interface BounceStreak {
  tier: GlassesTier;
  hitsInRow: number;
  perfectsInRow: number;
}

export const freshStreak = (): BounceStreak => ({ tier: 1, hitsInRow: 0, perfectsInRow: 0 });

/**
 * Apply a graded press: returns the gems to pay (0 on a miss) and updates `s` in place. The tier
 * rises after `hitsToRise` hits in a row and falls after a miss; three perfects in a row add the
 * streak bonus.
 */
export function applyGrade(s: BounceStreak, g: PressGrade): number {
  const R = BOUNCE_RING;
  if (g.kind === 'ignore') return 0;
  if (g.kind === 'miss') {
    s.hitsInRow = 0;
    s.perfectsInRow = 0;
    s.tier = s.tier > 1 ? ((s.tier - 1) as GlassesTier) : 1;
    return 0;
  }
  let gems: number = R.gems[s.tier];
  s.perfectsInRow = g.perfect ? s.perfectsInRow + 1 : 0;
  if (s.perfectsInRow >= R.streakLength) {
    gems += R.streakBonus;
    s.perfectsInRow = 0;
  }
  s.hitsInRow += 1;
  if (s.hitsInRow >= R.hitsToRise) {
    s.hitsInRow = 0;
    if (s.tier < 3) s.tier = (s.tier + 1) as GlassesTier;
  }
  return gems;
}
