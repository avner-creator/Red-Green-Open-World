/**
 * Free-ride unstick (QA7 M1, m5): a child holds W into a booth or a rim and nothing happens. After
 * a couple of seconds of pushing without getting anywhere, the ride hops back and turns toward the
 * most open direction, and a reset hint shows. Pure (unit-tested); the buggy and the horses use it.
 */

export const FREE_UNSTICK = {
  /** Seconds of pushing without progress before the hop. */
  seconds: 2.5,
  /** Moving this far (m) from where the push started counts as getting somewhere. */
  progress: 1.2,
  /** |throttle| above this counts as pushing. */
  throttle: 0.5,
  /** Directions within this angle (rad) of the blocked way are not picked. */
  avoid: Math.PI / 4,
  /** Clearance (m) beyond which every open direction is as good as any other. */
  enough: 25,
} as const;

/** Watches one ride: pushing on the throttle but not leaving a 1.2 m circle for 2.5 s = wedged. */
export class WedgeWatch {
  private t = 0;
  private ax = 0;
  private az = 0;
  private armed = false;

  reset(): void {
    this.t = 0;
    this.armed = false;
  }

  /** Seconds pushed so far without progress (for an early hint). */
  get seconds(): number {
    return this.t;
  }

  /** Feed one frame. Returns true once when the ride counts as wedged (the watch restarts). */
  update(dt: number, throttle: number, x: number, z: number): boolean {
    if (!(Math.abs(throttle) > FREE_UNSTICK.throttle)) {
      this.reset();
      return false;
    }
    if (!this.armed || Math.hypot(x - this.ax, z - this.az) > FREE_UNSTICK.progress) {
      this.ax = x;
      this.az = z;
      this.t = 0;
      this.armed = true;
      return false;
    }
    this.t += dt;
    if (this.t < FREE_UNSTICK.seconds) return false;
    this.reset();
    return true;
  }
}

const wrap = (a: number): number => Math.atan2(Math.sin(a), Math.cos(a));

/**
 * The most open heading to turn to: `n` directions round the circle, scored by clearance (capped
 * at `enough`), a small bonus for a smaller turn from `heading`, and never within `avoid` of
 * `blocked` (the way the ride was pushing). `clearance(yaw)` = free metres along (sin, 0, cos).
 */
export function openYaw(heading: number, blocked: number, clearance: (yaw: number) => number, n = 16): number {
  let best = wrap(blocked + Math.PI);
  let bestScore = -Infinity;
  for (let i = 0; i < n; i++) {
    const yaw = wrap(heading + (i / n) * Math.PI * 2);
    if (Math.abs(wrap(yaw - blocked)) < FREE_UNSTICK.avoid) continue;
    const c = Math.min(FREE_UNSTICK.enough, Math.max(0, clearance(yaw)));
    const score = c - (2 * Math.abs(wrap(yaw - heading))) / Math.PI;
    if (score > bestScore) {
      bestScore = score;
      best = yaw;
    }
  }
  return best;
}
