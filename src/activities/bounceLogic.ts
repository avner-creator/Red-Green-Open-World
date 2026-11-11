/** Pure bounce maths (no three, no DOM) so it can be unit tested. */
import { PLAYER } from '../config';
import { BOUNCE, BOUNCE_STARS, PADS } from './constants';

export const BOUNCE_THRESHOLDS: readonly { height: number; stars: number }[] = BOUNCE_STARS.map((height, i) => ({
  height,
  stars: i + 1,
}));

export function apexFromSpeed(speed: number, gravity: number = PLAYER.gravity): number {
  return (speed * speed) / (2 * gravity);
}

export function speedFromApex(apex: number, gravity: number = PLAYER.gravity): number {
  return Math.sqrt(2 * gravity * Math.max(0, apex));
}

/** Time up and down for a vertical launch that peaks at `apex`. */
export function flightTime(apex: number, gravity: number = PLAYER.gravity): number {
  return (2 * speedFromApex(apex, gravity)) / gravity;
}

/**
 * Apex of the next trampoline bounce, or 0 when the bounce stops.
 * `prev` is the previous apex of the chain (0 = chain not running: walking on, or dropping in).
 */
export function nextBounceApex(prev: number, held: boolean, airPeak = 0): number {
  if (prev <= 0) {
    const fall = Math.min(BOUNCE.maxFromFall, airPeak * BOUNCE.fromFallShare);
    return Math.min(Math.max(BOUNCE.firstBounce, fall), BOUNCE.maxHeight);
  }
  if (held) return Math.min(prev * BOUNCE.growth, BOUNCE.maxHeight);
  const next = prev * BOUNCE.releaseDecay;
  return next < BOUNCE.stopBelow ? 0 : next;
}

/**
 * Apply a character skill's bounce boost (`player.skill.bounceBoost`): 1 = none, 1.25 after a
 * super-bounce, Infinity after a ground-pound landing (= straight to `max`).
 */
export function boostedApex(apex: number, boost: number, max: number = BOUNCE.maxHeight): number {
  if (!(boost > 1) || apex <= 0) return apex;
  return Math.min(max, apex * boost);
}

/** Apex of a bounce-pad launch with a skill boost: +25% at most, so the exact pad arc still lands. */
export function boostedPadApex(apex: number, boost: number): number {
  return boostedApex(apex, Math.min(boost, PADS.maxBoost), apex * PADS.maxBoost);
}

/** Awards each height threshold once until `reset`. */
export class ThresholdAwards {
  private done = new Set<number>();
  /** Thresholds newly reached by `apex`. */
  reached(apex: number): { height: number; stars: number }[] {
    const out: { height: number; stars: number }[] = [];
    for (const t of BOUNCE_THRESHOLDS) {
      if (apex + 1e-6 >= t.height && !this.done.has(t.height)) {
        this.done.add(t.height);
        out.push(t);
      }
    }
    return out;
  }
  reset(): void {
    this.done.clear();
  }
}

/** Horizontal push so a pad launch of `apex` lands `distance` metres away. */
export function pushSpeed(distance: number, apex: number, gravity: number = PLAYER.gravity): number {
  return distance / flightTime(apex, gravity);
}

/** Counts pad launches that follow each other closely. */
export class PadChain {
  count = 0;
  private last = -Infinity;
  private awarded = false;
  /** Register a pad launch at time `now`; returns true exactly once when the chain hits the big-air length. */
  hit(now: number): boolean {
    this.count = now - this.last <= PADS.chainWindow ? this.count + 1 : 1;
    this.last = now;
    if (this.count === 1) this.awarded = false;
    if (this.count >= PADS.chainForBigAir && !this.awarded) {
      this.awarded = true;
      return true;
    }
    return false;
  }
  reset(): void {
    this.count = 0;
    this.last = -Infinity;
    this.awarded = false;
  }
}

/** Pad positions in the anchor's local frame (+Z front): a gentle arc. */
export function padLocalPositions(count: number, spacing: number): { x: number; z: number }[] {
  const arcR = 14;
  const step = 2 * Math.asin(spacing / (2 * arcR));
  const out: { x: number; z: number }[] = [];
  for (let i = 0; i < count; i++) {
    const a = (i - (count - 1) / 2) * step;
    out.push({ x: arcR * Math.sin(a), z: arcR * Math.cos(a) - arcR });
  }
  return out;
}

/** Stars for a rocket launch: one for the landing, one per rotation landed cleanly (max 3). */
export function launchStars(rotations: number, upright: boolean): number {
  return Math.min(3, 1 + (upright ? Math.min(2, rotations) : 0));
}

/** Stars for one completed trick rotation (the n-th of the flight). */
export function trickStars(n: number): number {
  return n >= 3 ? 2 : 1;
}

// ---------------------------------------------------------------------------------------------
// Surprise bounces: every chained trampoline bounce rolls a little randomness (seeded, so tests
// can pin it): a sideways kick that never throws you off the bed, an occasional SUPER BOING, a
// random auto trick, and a bonus star hanging somewhere up the column.

/** Small fast seeded RNG (mulberry32): 0 <= r < 1. */
export function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const SURPRISE = {
  /** Largest random sideways kick, m/s (scaled up a little with height). */
  kickMax: 1.6,
  kickPerMetre: 0.035,
  /** About 1 in 6 chained bounces is a SUPER BOING (from this apex up). */
  superChance: 1 / 6,
  superMinApex: 4,
  /** Apex multiplier for a SUPER BOING (at least `superMinGain` metres more), capped at the max. */
  superMul: 1.6,
  superMinGain: 6,
  /** Chance of a random auto trick (front flip, back flip, cartwheel, twirl) on bounces >= 6 m. */
  trickChance: 0.3,
  trickMinApex: 6,
  /** Chance of a bonus star in the column, and how far off the straight line up it may hang (m). */
  starChance: 0.4,
  starMinApex: 5,
  starOffset: 1.2,
  /** Landing spots stay within this share of the mat radius (the kick never throws you off). */
  safeShare: 0.72,
} as const;

export type AutoTrick = 'none' | 'frontFlip' | 'backFlip' | 'cartwheel' | 'twirl';
const TRICKS: readonly AutoTrick[] = ['frontFlip', 'backFlip', 'cartwheel', 'twirl'];

export interface BounceSurprise {
  kickX: number;
  kickZ: number;
  superBoing: boolean;
  trick: AutoTrick;
  /** Bonus star height as a share of the apex (0.35..0.95), or -1 for none. */
  starAt: number;
  starX: number;
  starZ: number;
}

/** Roll the surprises for a chained bounce of `apex` metres (`max` = the trampoline's top). */
export function rollSurprise(rng: () => number, apex: number, max: number): BounceSurprise {
  const a = rng() * Math.PI * 2;
  const mag = (SURPRISE.kickMax + SURPRISE.kickPerMetre * apex) * (0.35 + 0.65 * rng());
  const superBoing = apex >= SURPRISE.superMinApex && apex < max && rng() < SURPRISE.superChance;
  const top = superBoing ? superApex(apex, max) : apex;
  const trick = top >= SURPRISE.trickMinApex && rng() < SURPRISE.trickChance ? (TRICKS[Math.floor(rng() * TRICKS.length)] ?? 'twirl') : 'none';
  let starAt = -1;
  let starX = 0;
  let starZ = 0;
  if (top >= SURPRISE.starMinApex && rng() < SURPRISE.starChance) {
    starAt = 0.35 + 0.6 * rng();
    const sa = rng() * Math.PI * 2;
    const sr = SURPRISE.starOffset * rng();
    starX = Math.cos(sa) * sr;
    starZ = Math.sin(sa) * sr;
  }
  return { kickX: Math.cos(a) * mag, kickZ: Math.sin(a) * mag, superBoing, trick, starAt, starX, starZ };
}

/** Apex of a SUPER BOING launched from a normal bounce of `apex`. */
export function superApex(apex: number, max: number): number {
  return Math.min(max, Math.max(apex * SURPRISE.superMul, apex + SURPRISE.superMinGain));
}

/**
 * Shrink a random kick so the landing stays on the bed: (lx, lz) is the landing offset from the
 * mat centre without the kick, `T` the flight time. A landing that is already outside (the child
 * steered/ran off) is left alone apart from the kick being dropped.
 */
export function keepOnBed(lx: number, lz: number, kx: number, kz: number, T: number, safeR: number): { kx: number; kz: number } {
  if (Math.hypot(lx, lz) > safeR) return { kx: 0, kz: 0 };
  let s = 1;
  for (let i = 0; i < 8 && Math.hypot(lx + kx * T * s, lz + kz * T * s) > safeR; i++) s *= 0.6;
  if (Math.hypot(lx + kx * T * s, lz + kz * T * s) > safeR) s = 0;
  return { kx: kx * s, kz: kz * s };
}

/** Auto-trick pose at progress u (0..1, eased): flip pitch, cartwheel roll, twirl yaw (radians). */
export function autoTrickPose(trick: AutoTrick, u: number): { pitch: number; roll: number; yaw: number } {
  const k = Math.min(1, Math.max(0, u));
  const e = k * k * (3 - 2 * k);
  const turn = e * Math.PI * 2;
  switch (trick) {
    case 'frontFlip':
      return { pitch: turn, roll: 0, yaw: 0 };
    case 'backFlip':
      return { pitch: -turn, roll: 0, yaw: 0 };
    case 'cartwheel':
      return { pitch: 0, roll: turn, yaw: 0 };
    case 'twirl':
      return { pitch: 0, roll: 0, yaw: turn * 2 };
    default:
      return { pitch: 0, roll: 0, yaw: 0 };
  }
}
