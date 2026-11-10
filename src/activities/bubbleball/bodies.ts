/**
 * Tiny arcade physics for the bumper games (Bubble Ball and Dino Sumo): circles on a flat floor
 * (x, z) with an optional hop height (y). Everything bounces; nothing is ever hurt. Pure maths, no
 * three.js, so it is unit-tested and deterministic.
 */

export interface Body {
  x: number;
  z: number;
  vx: number;
  vz: number;
  /** Height above the floor (hop / lofted ball) and its vertical speed. */
  y: number;
  vy: number;
  r: number;
  /** Mass (relative). */
  m: number;
  /** Restitution 0..1 used for body-body and wall bounces. */
  bounce: number;
  /** Horizontal drag per second (fraction of speed lost per second, as an exponential rate). */
  drag: number;
  /** Vertical extent for body-body contact: bodies overlap vertically if |Δy| < (h + other.h) / 2. */
  h: number;
  /** Optional: ignore collisions with every other body (ghost) while > 0 seconds. */
  ghost?: number;
}

export interface Segment {
  ax: number;
  az: number;
  bx: number;
  bz: number;
}

export interface Contact {
  a: number;
  b: number;
  /** Size of the impulse along the contact normal (≥ 0). */
  impulse: number;
  /** Relative closing speed before the bounce, m/s. */
  speed: number;
  /** Contact normal from a to b. */
  nx: number;
  nz: number;
}

export interface WallHit {
  body: number;
  speed: number;
}

export const GRAVITY = 18;

export function makeBody(p: Partial<Body> & Pick<Body, 'x' | 'z' | 'r'>): Body {
  return { vx: 0, vz: 0, y: 0, vy: 0, m: 1, bounce: 0.8, drag: 1.2, h: 2 * p.r, ...p };
}

/** Exponential smoothing factor for a rate (1/s) over dt. */
export function follow(rate: number, dt: number): number {
  return 1 - Math.exp(-rate * dt);
}

/** Integrate positions, drag and the hop arc (floor at y = 0). */
export function integrate(b: Body, dt: number, gravity = GRAVITY): void {
  const k = Math.exp(-b.drag * dt);
  b.vx *= k;
  b.vz *= k;
  b.x += b.vx * dt;
  b.z += b.vz * dt;
  if (b.y > 0 || b.vy > 0) {
    b.vy -= gravity * dt;
    b.y += b.vy * dt;
    if (b.y <= 0) {
      b.y = 0;
      // Small bounce on landing, then settle.
      b.vy = b.vy < -3 ? -b.vy * 0.35 : 0;
    }
  }
  if (b.ghost !== undefined && b.ghost > 0) b.ghost = Math.max(0, b.ghost - dt);
}

/**
 * Resolve every overlapping pair once: push apart by inverse mass and bounce along the normal.
 * Returns the contacts that actually closed (approaching bodies), for gameplay (flips, scoring).
 */
export function collideBodies(bodies: Body[], out: Contact[] = []): Contact[] {
  out.length = 0;
  for (let i = 0; i < bodies.length; i++) {
    const a = bodies[i];
    if (a.ghost) continue;
    for (let j = i + 1; j < bodies.length; j++) {
      const b = bodies[j];
      if (b.ghost) continue;
      if (Math.abs(a.y + a.h / 2 - (b.y + b.h / 2)) >= (a.h + b.h) / 2) continue;
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const rr = a.r + b.r;
      const d2 = dx * dx + dz * dz;
      if (d2 >= rr * rr) continue;
      let d = Math.sqrt(d2);
      let nx: number;
      let nz: number;
      if (d < 1e-6) {
        // Exactly on top of each other: separate along x.
        nx = 1;
        nz = 0;
        d = 0;
      } else {
        nx = dx / d;
        nz = dz / d;
      }
      const ia = 1 / a.m;
      const ib = 1 / b.m;
      const pen = rr - d;
      const sa = (pen * ia) / (ia + ib);
      const sb = (pen * ib) / (ia + ib);
      a.x -= nx * sa;
      a.z -= nz * sa;
      b.x += nx * sb;
      b.z += nz * sb;
      const vrel = (b.vx - a.vx) * nx + (b.vz - a.vz) * nz;
      if (vrel >= 0) continue; // already separating
      const e = Math.min(a.bounce, b.bounce);
      const j2 = (-(1 + e) * vrel) / (ia + ib);
      a.vx -= j2 * ia * nx;
      a.vz -= j2 * ia * nz;
      b.vx += j2 * ib * nx;
      b.vz += j2 * ib * nz;
      out.push({ a: i, b: j, impulse: j2, speed: -vrel, nx, nz });
    }
  }
  return out;
}

/** Closest point on a segment to (x, z), as a parameter 0..1. */
function segParam(s: Segment, x: number, z: number): number {
  const ex = s.bx - s.ax;
  const ez = s.bz - s.az;
  const l2 = ex * ex + ez * ez;
  if (l2 < 1e-9) return 0;
  return Math.max(0, Math.min(1, ((x - s.ax) * ex + (z - s.az) * ez) / l2));
}

/**
 * Keep a body out of a set of wall segments (two-sided). Bounces with the body's restitution.
 * Returns the closing speed of the hardest wall hit this call (0 = none).
 */
export function collideWalls(b: Body, walls: readonly Segment[]): number {
  let hardest = 0;
  for (const s of walls) {
    const t = segParam(s, b.x, b.z);
    const px = s.ax + (s.bx - s.ax) * t;
    const pz = s.az + (s.bz - s.az) * t;
    const dx = b.x - px;
    const dz = b.z - pz;
    const d2 = dx * dx + dz * dz;
    if (d2 >= b.r * b.r) continue;
    const d = Math.sqrt(d2);
    let nx: number;
    let nz: number;
    if (d < 1e-6) {
      // On the line: push out along the segment's left normal.
      const ex = s.bx - s.ax;
      const ez = s.bz - s.az;
      const l = Math.hypot(ex, ez) || 1;
      nx = -ez / l;
      nz = ex / l;
    } else {
      nx = dx / d;
      nz = dz / d;
    }
    b.x = px + nx * b.r;
    b.z = pz + nz * b.r;
    const vn = b.vx * nx + b.vz * nz;
    if (vn < 0) {
      b.vx -= (1 + b.bounce) * vn * nx;
      b.vz -= (1 + b.bounce) * vn * nz;
      hardest = Math.max(hardest, -vn);
    }
  }
  return hardest;
}

/** Accelerate toward a wanted velocity (vx, vz) with a max acceleration (m/s²). */
export function steerToward(b: Body, wantVx: number, wantVz: number, accel: number, dt: number): void {
  const dvx = wantVx - b.vx;
  const dvz = wantVz - b.vz;
  const dv = Math.hypot(dvx, dvz);
  const max = accel * dt;
  if (dv <= max || dv < 1e-9) {
    b.vx = wantVx;
    b.vz = wantVz;
    return;
  }
  b.vx += (dvx / dv) * max;
  b.vz += (dvz / dv) * max;
}

/** Small deterministic PRNG (mulberry32) so test runs and AI are repeatable. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Rotate a local (x, z) by yaw into world (three.js: yaw about +Y, local +Z → world (sin, cos)). */
export function localToWorld(lx: number, lz: number, yaw: number): { x: number; z: number } {
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  return { x: lx * c + lz * s, z: -lx * s + lz * c };
}

/** Inverse of `localToWorld`. */
export function worldToLocal(wx: number, wz: number, yaw: number): { x: number; z: number } {
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  return { x: wx * c - wz * s, z: wx * s + wz * c };
}
