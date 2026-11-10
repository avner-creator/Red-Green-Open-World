/** Pure bounce maths (no three, no DOM) so it can be unit tested. */
import { PLAYER, TRAMPOLINE } from '../config';
import { BOUNCE, PADS } from './constants';

export const BOUNCE_THRESHOLDS: readonly { height: number; stars: number }[] = [
  { height: 10, stars: 1 },
  { height: 20, stars: 1 },
  { height: 30, stars: 2 },
  { height: 40, stars: 3 },
];

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
 * `prev` is the previous apex of the chain (0 = chain not running).
 */
export function nextBounceApex(prev: number, held: boolean, airPeak = 0): number {
  const max = TRAMPOLINE.maxHeight;
  if (prev <= 0) {
    const fall = Math.min(BOUNCE.maxFromFall, airPeak * BOUNCE.fromFallShare);
    const base = Math.max(TRAMPOLINE.firstBounce * (held ? 1 : BOUNCE.gentleFirst), held ? fall : 0);
    return Math.min(base, max);
  }
  if (held) return Math.min(prev * TRAMPOLINE.growth, max);
  const next = prev * BOUNCE.releaseDecay;
  return next < BOUNCE.stopBelow ? 0 : next;
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
