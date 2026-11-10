/** Pure camera maths (unit-tested). */

/** Closest the camera may get to the pivot when a wall is right behind the player (m). */
export const CAMERA_HARD_MIN = 0.2;
/** Gap kept to a wall closer than `min` (just over the 0.1 m near plane). */
const TIGHT_MARGIN = 0.12;

/**
 * Collision-resolved camera distance. Pulls in instantly when something is in the way,
 * eases back out at `easeRate` (1/s) when the view clears. `min` is the preferred closest
 * distance; only a wall even closer than that pulls the camera in further (it never goes
 * through the wall, down to CAMERA_HARD_MIN).
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
  let limit = hitDistance === null ? desired : Math.min(desired, hitDistance - margin);
  if (hitDistance !== null && limit < min) limit = Math.min(min, Math.max(CAMERA_HARD_MIN, hitDistance - TIGHT_MARGIN));
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
