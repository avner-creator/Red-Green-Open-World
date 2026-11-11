/** Ring Toss rules (pure): peg layout, the charge-and-release power bar, landing and capture. */

export interface Peg {
  x: number;
  z: number;
  /** Top of the table step the peg stands on (booth frame y). */
  base: number;
  points: number;
}

/** 3 × 3 pegs on a stepped table: further rows are higher and worth more. */
export const PEGS: readonly Peg[] = [0, 1, 2].flatMap((row) =>
  [-1.15, 0, 1.15].map((x) => ({ x: x * (1 + row * 0.08), z: -1.65 - row * 0.95, base: 0.95 + row * 0.18, points: row + 1 })),
);

export const PEG_H = 0.55;
/** Throws start at the hand (booth frame z) and fly this far for power 0 … 1. */
export const HAND_Z = 0.7;
export const MIN_DIST = 1.6;
export const MAX_DIST = 5.0;
/** A ring landing within this (xz, m) of a peg drops onto it — generous for small hands. */
export const CAPTURE = 0.4;
/** Seconds for the power bar to fill from empty to full (it then goes back down). */
export const CHARGE_TIME = 1.1;

/** Power bar value after charging for `t` seconds: 0 → 1 → 0 ping-pong. */
export function chargePower(t: number): number {
  const p = (t / CHARGE_TIME) % 2;
  return p <= 1 ? p : 2 - p;
}

/** Throw distance for a power. */
export function throwDistance(power: number): number {
  return MIN_DIST + Math.max(0, Math.min(1, power)) * (MAX_DIST - MIN_DIST);
}

/** Power needed to reach booth-frame z straight ahead (inverse of throwDistance). */
export function powerFor(dist: number): number {
  return Math.max(0, Math.min(1, (dist - MIN_DIST) / (MAX_DIST - MIN_DIST)));
}

/** Landing point (x, z) for an aim yaw (+ = left) and power. */
export function landingPoint(yaw: number, power: number, handX = 0): [number, number] {
  const d = throwDistance(power);
  return [handX - Math.sin(yaw) * d, HAND_Z - Math.cos(yaw) * d];
}

/** Index of the peg a ring landing at (x, z) drops onto, or −1. */
export function capturePeg(x: number, z: number, pegs: readonly Peg[] = PEGS, radius = CAPTURE): number {
  let best = -1;
  let bestD = radius;
  pegs.forEach((p, i) => {
    const d = Math.hypot(p.x - x, p.z - z);
    if (d <= bestD) {
      best = i;
      bestD = d;
    }
  });
  return best;
}
