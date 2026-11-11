/**
 * Strength Bell rules (pure): the swinging gauge needle, where the (weak-eye-only) sweet spot sits,
 * stomp power → tier → puck height, rival stomps and the round score.
 *
 * Needle position `u` runs −1 (left end of the dial) … +1 (right end). The sweet spot moves to a new
 * place on the dial before every stomp, so the evenly ticked both-eye dial says nothing about it:
 * only the weak eye sees the bright arc.
 */
import type { Rng } from '../rng';

export const STOMPS = 3;
/** Seconds for the needle to swing from one end to the other and back. */
export const NEEDLE_PERIOD = 2.4;
/** Dial half-angle (rad) for |u| = 1. */
export const DIAL_ANGLE = (75 * Math.PI) / 180;
/** |u − sweet| inside this rings the bell (the bright weak-eye core). */
export const PERFECT = 0.13;
/** Half-width of the dimmer "good" zone drawn around the core (tier 5 and up). */
export const GOOD = 0.25;
/** Sweet spot centres stay inside ±this. */
export const SWEET_RANGE = 0.68;
/** A new sweet spot is at least this far from the previous one (a fresh hunt each stomp). */
export const SWEET_MIN_MOVE = 0.35;
/** Extra power for a ground-pound stomp (hero skill). */
export const POUND_BONUS = 0.15;
/** Power at which the puck rings the bell. */
export const BELL_POWER = 0.97;
/** Lowest power a stomp can have (every stomp moves the puck). */
export const MIN_POWER = 0.12;
/** Power where tiers 2..5 start (forgiving: tier 5 is a wide band around the sweet spot). */
export const TIER_AT: readonly number[] = [0.22, 0.38, 0.55, 0.75];
/** Points for ringing the bell (tier 5 + 1 bonus). */
export const BELL_POINTS = 6;

/** Tower geometry (booth frame, metres). */
export const TOWER_X: readonly number[] = [0, -1.5, 1.5];
export const TOWER_Z = -2.2;
export const PUCK_REST = 0.45;
export const BAND_Y0 = 0.8;
export const BAND_H = 1.0;
export const BELL_Y = 6.75;
/** Puck centre when it strikes the bell. */
export const BELL_HIT_Y = 5.86;

/** Needle position (−1..1) at time `t`: a steady triangle sweep that starts in the middle. */
export function needleAt(t: number, period = NEEDLE_PERIOD): number {
  const p = (((t / period + 0.25) % 1) + 1) % 1; // 0..1, starts at u = 0 going right
  return p < 0.5 ? -1 + 4 * p : 3 - 4 * p;
}

/** Stomp power 0..1 for the needle at `u` with the sweet spot at `sweet` (+ ground-pound bonus). */
export function stompPower(u: number, sweet: number, bonus = 0): number {
  const d = Math.abs(u - sweet);
  // Steep fall-off: a stomp at a random moment rarely gets past the middle (timing wins).
  const base = d <= PERFECT ? 1 : Math.max(MIN_POWER, 0.95 - (d - PERFECT) * 1.6);
  return Math.min(1, base + bonus);
}

export function rings(power: number): boolean {
  return power >= BELL_POWER;
}

/** Tier 1..5 reached by a puck launched with `power`. */
export function tierOf(power: number): number {
  let t = 1;
  for (const at of TIER_AT) if (power >= at) t++;
  return t;
}

/** Points for a stomp: the tier, or BELL_POINTS for a ring. */
export function pointsFor(power: number): number {
  return rings(power) ? BELL_POINTS : tierOf(power);
}

/** Bottom of tier band `tier` (1..5). */
export function bandBottom(tier: number): number {
  return BAND_Y0 + (tier - 1) * BAND_H;
}

/** Puck peak height: inside the band of its tier (so the picture always matches the score), or the bell. */
export function peakFor(power: number): number {
  if (rings(power)) return BELL_HIT_Y;
  const tier = tierOf(power);
  const lo = tier === 1 ? 0 : TIER_AT[tier - 2];
  const hi = tier === 5 ? BELL_POWER : TIER_AT[tier - 1];
  const f = Math.min(1, Math.max(0, (power - lo) / (hi - lo)));
  return bandBottom(tier) + (0.2 + 0.6 * f) * BAND_H;
}

/** Seconds for the puck to rise to `peak` (and to fall back). */
export function riseTime(peak: number): number {
  return 0.3 + 0.55 * Math.sqrt(Math.max(0, peak - PUCK_REST) / (BELL_HIT_Y - PUCK_REST));
}

/** Puck height during the rise (ease-out, like a thrown weight), s in 0..1. */
export function riseY(peak: number, s: number): number {
  const k = 1 - (1 - s) * (1 - s);
  return PUCK_REST + (peak - PUCK_REST) * k;
}

/** Puck height during the fall (ease-in), s in 0..1. */
export function fallY(peak: number, s: number): number {
  return peak - (peak - PUCK_REST) * s * s;
}

/** A new sweet spot within ±SWEET_RANGE, at least SWEET_MIN_MOVE from `prev` (when given). */
export function pickSweet(rng: Rng, prev: number | null = null): number {
  for (let i = 0; i < 20; i++) {
    const s = (rng() * 2 - 1) * SWEET_RANGE;
    if (prev === null || Math.abs(s - prev) >= SWEET_MIN_MOVE) return s;
  }
  return prev !== null && prev > 0 ? -SWEET_RANGE * 0.6 : SWEET_RANGE * 0.6;
}

/** A friend's stomp: a good stomp lands tier 3..5 (rarely the bell), a fumble tier 1..3. */
export function rivalPower(rng: Rng, success: boolean): number {
  return success ? 0.55 + rng() * 0.44 : MIN_POWER + rng() * 0.4;
}

/** Total score of a list of stomp powers. */
export function scoreOf(powers: readonly number[]): number {
  return powers.reduce((a, p) => a + pointsFor(p), 0);
}
