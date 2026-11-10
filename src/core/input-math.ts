/** Pure input helpers (unit-tested). */

export interface Vec2 {
  x: number;
  y: number;
}

/**
 * Radial dead zone with rescale: inside `dz` → 0; outside, the magnitude is remapped from
 * [dz, 1] to [0, 1] so small pushes past the dead zone still give fine control. Output length ≤ 1.
 */
export function radialDeadZone(x: number, y: number, dz: number): Vec2 {
  const len = Math.hypot(x, y);
  if (len <= dz || len === 0) return { x: 0, y: 0 };
  const scaled = Math.min(1, (len - dz) / (1 - dz));
  return { x: (x / len) * scaled, y: (y / len) * scaled };
}

/** Like `radialDeadZone` but with a gentle response curve for look sticks (fine aim near centre). */
export function lookCurve(x: number, y: number, dz: number): Vec2 {
  const v = radialDeadZone(x, y, dz);
  const len = Math.hypot(v.x, v.y);
  if (len === 0) return v;
  const curved = len * len * 0.6 + len * 0.4;
  return { x: (v.x / len) * curved, y: (v.y / len) * curved };
}

/** Keyboard direction from held keys; diagonal is normalised to length 1. */
export function keyboardMove(left: boolean, right: boolean, back: boolean, forward: boolean): Vec2 {
  const x = (right ? 1 : 0) - (left ? 1 : 0);
  const y = (forward ? 1 : 0) - (back ? 1 : 0);
  const len = Math.hypot(x, y);
  return len > 1 ? { x: x / len, y: y / len } : { x, y };
}

/** Merge two move vectors (keyboard + stick) and clamp the result to length 1. */
export function mergeMove(a: Vec2, b: Vec2): Vec2 {
  const x = a.x + b.x;
  const y = a.y + b.y;
  const len = Math.hypot(x, y);
  return len > 1 ? { x: x / len, y: y / len } : { x, y };
}

/** Reject absurd pointer-lock deltas (a known browser glitch right after locking). */
export function sanitizeMouseDelta(d: number): number {
  return Math.abs(d) > 400 ? 0 : d;
}
