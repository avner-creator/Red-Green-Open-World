/**
 * Pure maths for the buggy-race glasses part (`./index.ts`): the weak-eye beat on the next boost
 * pad. No three, no DOM; unit-tested.
 *
 * The beat is a steady cycle of `BOOST.period` seconds. `t` = position in the cycle (0..1); the
 * closing ring meets its target ring at `perfectAt`, and the pad is "hot" while
 * |t − perfectAt| ≤ half the tier's window. Each pad gets a random phase offset, so the beat cannot
 * be learned from the clock or the track.
 */
import type { GlassesTier } from '../../../../types';

export const BOOST = {
  /** Beat period, seconds (steady at every tier). */
  period: 1.2,
  /** Hot window, seconds, by tier. By-luck hit rate = window / period: 28 %, 22.5 %, 16.7 %. */
  window: { 1: 0.34, 2: 0.27, 3: 0.2 } as Readonly<Record<GlassesTier, number>>,
  /** Cycle position where the closing ring sits on the target ring (middle of the hot window). */
  perfectAt: 0.75,
  /** The beat shows on the next pad from this far ahead (metres along the lap)… */
  showAhead: 40,
  /** …fading in over the last few metres before that. */
  fadeIn: 6,
  /** A pad more than this far behind (metres) was passed without touching it: no result. */
  passedBehind: 4,
  /** The beat must have been on show this long (seconds) before a crossing is judged. */
  minSeen: 0.5,
  /** Gems for a turbo pad by tier. */
  pay: { 1: 1, 2: 2, 3: 3 } as Readonly<Record<GlassesTier, number>>,
  /** Hits in a row that raise the tier. */
  hitsToRise: 2,
  /**
   * Look (metres): an upright ring standing across the road at the pad, its centre just above the
   * road, so the road hides the lower half and it reads as an arch whose legs stand beside the
   * buggy (the chase camera looks over the buggy at the pad). Closing ring start, line width.
   */
  ringRadius: 3.4,
  ringStart: 6.8,
  ringThickness: 0.7,
  ringHeight: 0.1,
  /** Weak-eye flash after a turbo pad, seconds. */
  flashSeconds: 0.75,
} as const;

/** Cycle position 0..1 at `clock` seconds for a pad whose phase offset is `offset` (0..1). */
export function cycleAt(offset: number, clock: number, period: number = BOOST.period): number {
  const v = offset + clock / period;
  return v - Math.floor(v);
}

/** Half the hot window in cycle units. */
export function halfWindowT(tier: GlassesTier): number {
  return BOOST.window[tier] / BOOST.period / 2;
}

/** Is the beat hot at cycle position `t`? */
export function isHot(t: number, tier: GlassesTier): boolean {
  return Math.abs(t - BOOST.perfectAt) <= halfWindowT(tier);
}

/** Chance that a child who ignores the beat lands a pad crossing in the hot window. */
export function luckRate(tier: GlassesTier): number {
  return BOOST.window[tier] / BOOST.period;
}

/** The phase offset that puts the cycle at `t` exactly `inSeconds` from `clock`. */
export function offsetFor(t: number, clock: number, inSeconds = 0, period: number = BOOST.period): number {
  const v = t - (clock + inSeconds) / period;
  return v - Math.floor(v);
}

/** Signed lap distance from `from` to `to` on a loop of length `L`, in [−L/2, L/2). */
export function lapDelta(from: number, to: number, L: number): number {
  if (!(L > 0)) return to - from;
  const d = (((to - from) % L) + L) % L;
  return d >= L / 2 ? d - L : d;
}

export interface PadAt {
  readonly s: number;
}

/**
 * Index of the next pad ahead of `progress` (the nearest one no more than `passedBehind` behind),
 * and how far ahead it is (negative = just behind). −1 if there are no pads.
 */
export function nextPad(pads: readonly PadAt[], progress: number, L: number): { index: number; ahead: number } {
  let best = -1;
  let bestD = Infinity;
  for (let i = 0; i < pads.length; i++) {
    const d = lapDelta(progress, pads[i].s, L);
    if (d < -BOOST.passedBehind) continue;
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return { index: best, ahead: best < 0 ? Infinity : bestD };
}

/** The pad nearest to `progress` along the lap (the one the race just counted as hit). */
export function nearestPad(pads: readonly PadAt[], progress: number, L: number): number {
  let best = -1;
  let bestD = Infinity;
  for (let i = 0; i < pads.length; i++) {
    const d = Math.abs(lapDelta(progress, pads[i].s, L));
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

/** Beat visibility (0..1) for a pad `ahead` metres away. */
export function showFade(ahead: number): number {
  if (ahead > BOOST.showAhead) return 0;
  const k = (BOOST.showAhead - ahead) / BOOST.fadeIn;
  return k >= 1 ? 1 : k <= 0 ? 0 : k * k * (3 - 2 * k);
}

export type Outcome = 'hit' | 'miss' | null;

/**
 * A pad crossing. Judged only for the pad that carried the beat, once it had been on show
 * `minSeen` seconds: hot = hit, cold = miss. Anything else (another pad, a beat not yet seen) gives
 * no result.
 */
export function judge(crossed: number, target: number, seen: number, t: number, tier: GlassesTier): Outcome {
  if (crossed < 0 || crossed !== target || seen < BOOST.minSeen) return null;
  return isHot(t, tier) ? 'hit' : 'miss';
}

/** Per-session staircase: up after `hitsToRise` hits in a row, down after a miss. */
export function stepTier(tier: GlassesTier, streak: number, hit: boolean): { tier: GlassesTier; streak: number } {
  if (!hit) return { tier: tier <= 1 ? 1 : ((tier - 1) as GlassesTier), streak: 0 };
  const s = streak + 1;
  if (s >= BOOST.hitsToRise) return { tier: tier >= 3 ? 3 : ((tier + 1) as GlassesTier), streak: 0 };
  return { tier, streak: s };
}
