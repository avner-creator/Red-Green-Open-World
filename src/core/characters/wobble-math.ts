/**
 * Pure maths for the floppy-hero layer (no three.js): damped springs driven by the body's
 * acceleration. Exported for unit tests.
 */

export interface Spring {
  x: number;
  v: number;
}

/**
 * One step of x'' = -ω²x - 2ζωx' + force, sub-stepped so a long frame (or a hitch) cannot blow
 * up; the result is clamped to ±limit (a floppy head, never a broken neck).
 */
export function springStep(s: Spring, force: number, omega: number, zeta: number, dt: number, limit: number): number {
  if (!(dt > 0) || !Number.isFinite(force)) return s.x;
  const n = Math.min(8, Math.max(1, Math.ceil(dt / (1 / 120))));
  const h = Math.min(dt, 0.1) / n;
  for (let i = 0; i < n; i++) {
    const a = -omega * omega * s.x - 2 * zeta * omega * s.v + force;
    s.v += a * h;
    s.x += s.v * h;
    if (s.x > limit) {
      s.x = limit;
      if (s.v > 0) s.v *= -0.3;
    } else if (s.x < -limit) {
      s.x = -limit;
      if (s.v < 0) s.v *= -0.3;
    }
  }
  return s.x;
}

/** Clamp a vector's components to ±m (a teleport or a crash landing must not fling the head). */
export function clampAbs(v: number, m: number): number {
  return v > m ? m : v < -m ? -m : Number.isFinite(v) ? v : 0;
}

/** World acceleration (x, z) → body frame for a hero facing `yaw` (three.js: forward = +Z). */
export function toBodyFrame(ax: number, az: number, yaw: number): { side: number; fwd: number } {
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  return { side: ax * c - az * s, fwd: ax * s + az * c };
}

/** Shortest signed angle a − b in (−π, π]. */
export function angleDelta(a: number, b: number): number {
  let d = (a - b) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d <= -Math.PI) d += Math.PI * 2;
  return d;
}
