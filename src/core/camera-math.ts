/** Pure camera maths (unit-tested). */

/**
 * Collision-resolved camera distance. Pulls in instantly when something is in the way,
 * eases back out at `easeRate` (1/s) when the view clears, never closer than `min`.
 */
export function resolveCameraDistance(
  current: number,
  desired: number,
  hitDistance: number | null,
  margin: number,
  min: number,
  easeRate: number,
  dt: number,
): number {
  const limit = hitDistance === null ? desired : Math.max(min, Math.min(desired, hitDistance - margin));
  if (limit <= current) return limit;
  const k = 1 - Math.exp(-easeRate * dt);
  return Math.min(limit, current + (limit - current) * k);
}

/**
 * Offset from the pivot to the camera for an orbit with look-yaw `yaw` (direction the camera
 * looks) and `pitch` (positive = camera above, looking down), at `distance`.
 */
export function orbitOffset(yaw: number, pitch: number, distance: number): { x: number; y: number; z: number } {
  const h = Math.cos(pitch) * distance;
  return { x: -Math.sin(yaw) * h, y: Math.sin(pitch) * distance, z: -Math.cos(yaw) * h };
}

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}
