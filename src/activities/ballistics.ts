/** Pure ballistic maths shared by the trampoline, pads and rocket pads (no three, no DOM). */
import { PLAYER } from '../config';

/** Time for a vertical launch speed `vy0` to come DOWN to `dy` above the start; NaN if never reached. */
export function timeToReach(vy0: number, dy: number, gravity: number = PLAYER.gravity): number {
  const disc = vy0 * vy0 - 2 * gravity * dy;
  if (disc < 0) return Number.NaN;
  return (vy0 + Math.sqrt(disc)) / gravity;
}

export interface LaunchSolution {
  vx: number;
  vy: number;
  vz: number;
  /** Flight time to the target. */
  time: number;
  /** Peak height above the start. */
  apex: number;
}

/**
 * Velocity that flies from the origin to (dx, dy, dz) on the way down, peaking `apex` metres above
 * the start (raised if the target is higher than that).
 */
export function solveLaunch(dx: number, dy: number, dz: number, apex: number, gravity: number = PLAYER.gravity): LaunchSolution {
  const peak = Math.max(apex, dy + 0.5, 0.5);
  const vy = Math.sqrt(2 * gravity * peak);
  const time = timeToReach(vy, dy, gravity);
  return { vx: dx / time, vy, vz: dz / time, time, apex: peak };
}

export interface VerticalStep {
  y: number;
  vy: number;
  /** The arc came down to `endY` during this step. */
  arrived: boolean;
  /** Seconds of the step actually used. */
  used: number;
}

/** One exact constant-gravity step; stops exactly on `endY` when coming down through it. */
export function stepVertical(y: number, vy: number, dt: number, endY: number, gravity: number = PLAYER.gravity): VerticalStep {
  const ny = y + vy * dt - 0.5 * gravity * dt * dt;
  const nvy = vy - gravity * dt;
  if (nvy < 0 && ny <= endY) {
    const t = timeToReach(vy, endY - y, gravity);
    const used = Number.isFinite(t) ? Math.min(dt, Math.max(0, t)) : dt;
    return { y: endY, vy: vy - gravity * used, arrived: true, used };
  }
  return { y: ny, vy: nvy, arrived: false, used: dt };
}

/** Seconds until an arc at height `y` with vertical speed `vy` comes down to `endY`. */
export function timeToLand(y: number, vy: number, endY: number, gravity: number = PLAYER.gravity): number {
  const t = timeToReach(vy, endY - y, gravity);
  return Number.isFinite(t) ? Math.max(0, t) : 0;
}

/** Point on a launch arc `t` seconds after the start. */
export function arcPoint(
  start: { x: number; y: number; z: number },
  v: { vx: number; vy: number; vz: number },
  t: number,
  gravity: number = PLAYER.gravity,
): { x: number; y: number; z: number } {
  return { x: start.x + v.vx * t, y: start.y + v.vy * t - 0.5 * gravity * t * t, z: start.z + v.vz * t };
}
