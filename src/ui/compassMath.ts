/** Pure maths for the icon compass strip (no DOM, unit tested). */

/** Wrap an angle to (-PI, PI]. */
export function wrapAngle(a: number): number {
  const t = Math.PI * 2;
  let r = (a + Math.PI) % t;
  if (r <= 0) r += t;
  return r - Math.PI;
}

/**
 * Bearing of a target relative to the camera: 0 = straight ahead, + = to the right, radians.
 * Camera forward is (sin yaw, cos yaw) on the ground plane; its right is (-cos yaw, sin yaw).
 */
export function relativeBearing(yaw: number, from: { x: number; z: number }, to: { x: number; z: number }): number {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const forward = dx * Math.sin(yaw) + dz * Math.cos(yaw);
  const right = -dx * Math.cos(yaw) + dz * Math.sin(yaw);
  return Math.atan2(right, forward);
}

/** The strip shows this many radians either side of straight ahead. */
export const STRIP_HALF_RANGE = (100 * Math.PI) / 180;
/** Markers never go closer to the strip's end than this (fraction of half width). */
export const STRIP_EDGE = 0.9;

export interface StripPos {
  /** -1 (left end) .. 1 (right end). */
  x: number;
  /** True when the target is outside the strip range and pinned to an end (show an arrow). */
  clamped: boolean;
  side: -1 | 0 | 1;
}

/** Map a relative bearing to a position on the strip. Targets behind pin to the nearer side. */
export function stripPosition(rel: number, halfRange = STRIP_HALF_RANGE): StripPos {
  const r = wrapAngle(rel);
  if (Math.abs(r) > halfRange) {
    const side = r < 0 ? -1 : 1;
    return { x: side * STRIP_EDGE, clamped: true, side };
  }
  return { x: (r / halfRange) * STRIP_EDGE, clamped: false, side: 0 };
}

/** Distance in metres to 1..5 dots (more dots = closer). */
export function distanceDots(d: number): 1 | 2 | 3 | 4 | 5 {
  if (d <= 18) return 5;
  if (d <= 45) return 4;
  if (d <= 90) return 3;
  if (d <= 150) return 2;
  return 1;
}

export interface Candidate {
  rel: number;
  dist: number;
}

/** Index of the marker to enlarge: the one you face (within 22 deg), else the nearest; -1 if none. */
export function pickHighlight(items: readonly Candidate[]): number {
  let best = -1;
  let bestRel = (22 * Math.PI) / 180;
  items.forEach((c, i) => {
    const a = Math.abs(wrapAngle(c.rel));
    if (a < bestRel) {
      bestRel = a;
      best = i;
    }
  });
  if (best >= 0) return best;
  let bd = Infinity;
  items.forEach((c, i) => {
    if (c.dist < bd) {
      bd = c.dist;
      best = i;
    }
  });
  return best;
}
