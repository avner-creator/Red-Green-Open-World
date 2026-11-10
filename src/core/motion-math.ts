/** Pure movement maths for the player (unit-tested). */

/** Apex height of a ballistic jump: v² / 2g. */
export function apexHeight(upSpeed: number, gravity: number): number {
  return upSpeed > 0 ? (upSpeed * upSpeed) / (2 * gravity) : 0;
}

/** Initial upward speed needed to reach `height`. */
export function speedForApex(height: number, gravity: number): number {
  return Math.sqrt(Math.max(0, 2 * gravity * height));
}

/**
 * Exact constant-gravity integration over `dt` (independent of frame rate):
 * returns the vertical displacement and the new vertical speed.
 */
export function integrateVertical(vy: number, gravity: number, dt: number): { dy: number; vy: number } {
  return { dy: vy * dt - 0.5 * gravity * dt * dt, vy: vy - gravity * dt };
}

/** Move `current` towards `target` by at most `maxDelta`. */
export function approach(current: number, target: number, maxDelta: number): number {
  if (current < target) return Math.min(current + maxDelta, target);
  return Math.max(current - maxDelta, target);
}

/** Shortest signed angle from `a` to `b` in (−π, π]. */
export function angleDelta(a: number, b: number): number {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d <= -Math.PI) d += Math.PI * 2;
  return d;
}

/** Frame-rate independent exponential smoothing factor for a rate in 1/s. */
export function damp(rate: number, dt: number): number {
  return 1 - Math.exp(-rate * dt);
}

/**
 * Move a 2D horizontal velocity towards a target velocity, limited by `accel * dt`.
 * Mutates and returns `v`.
 */
export function approachVec2(v: { x: number; z: number }, tx: number, tz: number, maxDelta: number): { x: number; z: number } {
  const dx = tx - v.x;
  const dz = tz - v.z;
  const len = Math.hypot(dx, dz);
  if (len <= maxDelta || len === 0) {
    v.x = tx;
    v.z = tz;
  } else {
    v.x += (dx / len) * maxDelta;
    v.z += (dz / len) * maxDelta;
  }
  return v;
}

/** Forgiving jump: a buffered press within `buffer` s AND ground contact within `coyote` s. */
export function canJump(sinceGrounded: number, sincePressed: number, coyote: number, buffer: number): boolean {
  return sinceGrounded <= coyote && sincePressed <= buffer;
}

/**
 * Camera-relative move direction: forward follows the camera's look yaw
 * (facing vector (sin yaw, 0, cos yaw)), right is (−cos yaw, 0, sin yaw).
 */
export function cameraRelative(moveX: number, moveY: number, camYaw: number): { x: number; z: number } {
  const s = Math.sin(camYaw);
  const c = Math.cos(camYaw);
  return { x: s * moveY - c * moveX, z: c * moveY + s * moveX };
}

/**
 * Exact first-order follow of a target that moved linearly from `prevTarget` to `target` during
 * this frame: solves x' = rate·(T(t) − x) over `dt`. Unlike `x += (target − x)·damp(rate, dt)`,
 * the steady lag behind a target moving at constant speed is the same (speed/rate) at every
 * frame time, so a chase camera doesn't twitch when frame times vary (16/33 ms, 144 Hz, hitches).
 * A jump bigger than `maxStep` (a teleport) is treated as a jump, not as speed.
 */
export function followMoving(x: number, prevTarget: number, target: number, rate: number, dt: number, maxStep = 3): number {
  if (!(dt > 0) || !(rate > 0)) return x;
  const moved = target - prevTarget;
  const v = Math.abs(moved) > maxStep ? 0 : moved / dt;
  const e0 = x - (Math.abs(moved) > maxStep ? target : prevTarget);
  const lag = v / rate;
  return target - lag + (e0 + lag) * Math.exp(-rate * dt);
}
