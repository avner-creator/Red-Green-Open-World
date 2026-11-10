/**
 * Pure maths for the island's critters and townsfolk (no three.js objects, so unit tests can run it):
 * angles, steering, the ground-bird scatter flock, the "hop aside" dodge that keeps sheep and
 * chickens from ever being touched by the player or a vehicle, fish arcs and the wind gusts.
 * Everything is deterministic: randomness comes from the caller's seeded `Rng`.
 */

export const TAU = Math.PI * 2;

/** Wrap an angle to (-π, π]. */
export function wrapAngle(a: number): number {
  a = (a + Math.PI) % TAU;
  if (a < 0) a += TAU;
  return a - Math.PI;
}

/** Yaw (around +Y, 0 = facing +Z) that looks from (fx, fz) towards (tx, tz). */
export function yawTo(fx: number, fz: number, tx: number, tz: number): number {
  return Math.atan2(tx - fx, tz - fz);
}

/** Turn `cur` towards `target` by at most `maxStep` radians (shortest way round). */
export function turnToward(cur: number, target: number, maxStep: number): number {
  const d = wrapAngle(target - cur);
  if (Math.abs(d) <= maxStep) return wrapAngle(target);
  return wrapAngle(cur + Math.sign(d) * maxStep);
}

/** Frame-rate independent exponential approach: fraction to move this frame for a rate (1/s). */
export function damp(rate: number, dt: number): number {
  return 1 - Math.exp(-rate * dt);
}

/**
 * Closest approach between a still point P and a mover T moving with velocity V, within `horizon`
 * seconds: the time (0..horizon) and the distance then.
 */
export function closestApproach(px: number, pz: number, tx: number, tz: number, vx: number, vz: number, horizon: number): { t: number; d: number } {
  const rx = px - tx;
  const rz = pz - tz;
  const vv = vx * vx + vz * vz;
  let t = vv > 1e-6 ? (rx * vx + rz * vz) / vv : 0;
  t = Math.min(horizon, Math.max(0, t));
  return { t, d: Math.hypot(rx - vx * t, rz - vz * t) };
}

/**
 * Which way to hop to get out of a mover's way: perpendicular to its velocity, on the side the
 * critter is already on (so it never hops across the path). A slow or still mover → straight away.
 * Returns a unit vector [x, z].
 */
export function dodgeDir(px: number, pz: number, tx: number, tz: number, vx: number, vz: number): [number, number] {
  const sp = Math.hypot(vx, vz);
  const rx = px - tx;
  const rz = pz - tz;
  if (sp < 1.5) {
    const l = Math.hypot(rx, rz);
    return l > 1e-6 ? [rx / l, rz / l] : [1, 0];
  }
  const nx = -vz / sp;
  const nz = vx / sp;
  const side = rx * nx + rz * nz >= 0 ? 1 : -1;
  // A little forward bias away from the mover's nose looks more natural than a pure sidestep.
  const fx = vx / sp;
  const fz = vz / sp;
  const ahead = rx * fx + rz * fz > 0 ? 0.25 : -0.1;
  const dx = nx * side + fx * ahead;
  const dz = nz * side + fz * ahead;
  const l = Math.hypot(dx, dz);
  return [dx / l, dz / l];
}

// ───────────────────────────── waddlers (sheep, chickens) ─────────────────────────────

export interface Threat {
  x: number;
  z: number;
  vx: number;
  vz: number;
  /** Half-width of the mover (player ≈ 0.4, buggy ≈ 1.2, horse ≈ 0.8). */
  radius: number;
}

export interface WaddlerParams {
  /** Body radius, m. */
  radius: number;
  /** Walk speed when grazing / fleeing, m/s. */
  walk: number;
  flee: number;
  /** Hop distance, m, and duration, s. */
  hopLen: number;
  hopTime: number;
  hopHeight: number;
  /** Wander radius around home, m. */
  roam: number;
}

export interface Waddler {
  x: number;
  z: number;
  /** Height above ground from a hop (m). */
  lift: number;
  yaw: number;
  homeX: number;
  homeZ: number;
  tx: number;
  tz: number;
  /** Seconds to wait before picking a new graze target. */
  pause: number;
  /** Hop in progress: time left (0 = not hopping), start and end. */
  hop: number;
  hx0: number;
  hz0: number;
  hx1: number;
  hz1: number;
  /** Current walking speed (drives the leg animation). */
  speed: number;
  /** Count of hops (tests, squeak sounds). */
  hops: number;
}

/** Movers faster than this (m/s) are dodged sideways; slower ones are leapt away from. */
const FAST = 8;

export function makeWaddler(x: number, z: number): Waddler {
  return { x, z, lift: 0, yaw: 0, homeX: x, homeZ: z, tx: x, tz: z, pause: 0, hop: 0, hx0: x, hz0: z, hx1: x, hz1: z, speed: 0, hops: 0 };
}

/**
 * One step of a sheep/chicken. Grazes around home; walks away from a nearby player; HOPS out of the
 * way of anything whose path would come within reach in the next ~1.2 s (or that is already very
 * close). Never moves onto a spot where `ok(x, z)` is false if the other side is free.
 * Returns true when a new hop started (for the squeak).
 */
export function stepWaddler(
  w: Waddler,
  p: WaddlerParams,
  threats: readonly Threat[],
  dt: number,
  rnd: () => number,
  ok: (x: number, z: number) => boolean = () => true,
): boolean {
  if (w.hop > 0) {
    w.hop = Math.max(0, w.hop - dt);
    const k = 1 - w.hop / p.hopTime;
    const e = k * k * (3 - 2 * k);
    w.x = w.hx0 + (w.hx1 - w.hx0) * e;
    w.z = w.hz0 + (w.hz1 - w.hz0) * e;
    w.lift = 4 * p.hopHeight * k * (1 - k);
    w.speed = 0;
    if (w.hop > 0) return false;
    w.lift = 0;
  }
  // Danger: worst threat in the next 1.2 s.
  let worst: Threat | null = null;
  let worstD = Infinity;
  let fleeX = 0;
  let fleeZ = 0;
  for (const t of threats) {
    const reach = t.radius + p.radius + 0.9;
    const now = Math.hypot(w.x - t.x, w.z - t.z);
    const ca = closestApproach(w.x, w.z, t.x, t.z, t.vx, t.vz, 1.2);
    if ((ca.d < reach && Math.hypot(t.vx, t.vz) > 1.5) || now < reach) {
      if (ca.d < worstD) {
        worstD = ca.d;
        worst = t;
      }
    } else if (now < reach + 3.5) {
      // Comfortable distance: amble away.
      const l = Math.max(now, 1e-3);
      fleeX += (w.x - t.x) / l;
      fleeZ += (w.z - t.z) / l;
    }
  }
  if (worst) {
    const sp = Math.hypot(worst.vx, worst.vz);
    let dx: number;
    let dz: number;
    let len: number;
    if (sp > FAST) {
      // Fast vehicle: sidestep out of its path, far enough to clear its half-width and our body.
      [dx, dz] = dodgeDir(w.x, w.z, worst.x, worst.z, worst.vx, worst.vz);
      len = Math.max(p.hopLen, worst.radius + p.radius + 1.0);
    } else {
      // Something slower (a running player): a big comic boing away, a bit to one side, always
      // faster than the chaser so it can never catch up.
      let ax = w.x - worst.x;
      let az = w.z - worst.z;
      const al = Math.hypot(ax, az) || 1;
      ax /= al;
      az /= al;
      const side = rnd() < 0.5 ? -0.45 : 0.45;
      dx = ax - az * side;
      dz = az + ax * side;
      const dl = Math.hypot(dx, dz);
      dx /= dl;
      dz /= dl;
      len = Math.max(p.hopLen, sp * p.hopTime + 1.8);
    }
    if (!ok(w.x + dx * len, w.z + dz * len)) {
      // Blocked (water, edge of the pen): for a slow chaser try the two sideways leaps instead.
      if (sp <= FAST) {
        for (const s of [1, -1]) {
          const tx = -dz * s;
          const tz = dx * s;
          if (ok(w.x + tx * len, w.z + tz * len)) {
            dx = tx;
            dz = tz;
            break;
          }
        }
      }
    }
    w.hx0 = w.x;
    w.hz0 = w.z;
    w.hx1 = w.x + dx * len;
    w.hz1 = w.z + dz * len;
    w.hop = p.hopTime;
    w.yaw = Math.atan2(dx, dz);
    w.tx = w.hx1;
    w.tz = w.hz1;
    w.pause = 1.5 + rnd() * 2;
    w.hops++;
    return true;
  }
  let vx = 0;
  let vz = 0;
  if (fleeX !== 0 || fleeZ !== 0) {
    const l = Math.hypot(fleeX, fleeZ);
    vx = (fleeX / l) * p.flee;
    vz = (fleeZ / l) * p.flee;
    w.tx = w.x;
    w.tz = w.z;
    w.pause = 0.6;
  } else {
    // Graze: walk to the target, pause, pick another spot near home.
    const dx = w.tx - w.x;
    const dz = w.tz - w.z;
    const d = Math.hypot(dx, dz);
    if (d > 0.15) {
      vx = (dx / d) * p.walk;
      vz = (dz / d) * p.walk;
    } else if ((w.pause -= dt) <= 0) {
      const a = rnd() * TAU;
      const r = p.roam * Math.sqrt(rnd());
      w.tx = w.homeX + Math.cos(a) * r;
      w.tz = w.homeZ + Math.sin(a) * r;
      if (!ok(w.tx, w.tz)) {
        w.tx = w.homeX;
        w.tz = w.homeZ;
      }
      w.pause = 1 + rnd() * 3;
    }
  }
  const nx = w.x + vx * dt;
  const nz = w.z + vz * dt;
  if (ok(nx, nz)) {
    w.x = nx;
    w.z = nz;
  }
  // Wandered too far while fleeing: drift back towards home a little.
  const fh = Math.hypot(w.x - w.homeX, w.z - w.homeZ);
  if (fh > p.roam * 2.5) {
    w.tx = w.homeX;
    w.tz = w.homeZ;
  }
  w.speed = Math.hypot(vx, vz);
  if (w.speed > 0.05) w.yaw = turnToward(w.yaw, Math.atan2(vx, vz), 6 * dt);
  return false;
}

// ───────────────────────────── ground-bird flock ─────────────────────────────

export type FlockState = 'ground' | 'flying' | 'landing';

export interface Bird {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  /** Spot on the ground relative to the flock's landing point. */
  ox: number;
  oz: number;
}

export interface Flock {
  state: FlockState;
  /** Seconds in the current state. */
  t: number;
  /** Landing spots (x, z); `spot` indexes the current one. */
  spots: readonly (readonly [number, number])[];
  spot: number;
  /** Where the flock heads while airborne. */
  gx: number;
  gy: number;
  gz: number;
  birds: Bird[];
  /** Times the flock has scattered (tests). */
  scatters: number;
}

export const FLOCK = {
  /** Scare distance for the player on foot / a vehicle (m). */
  scare: 5.5,
  scareVehicle: 9,
  /** Seconds in the air before trying to land again. */
  minAir: 5,
  /** A landing spot must be at least this far from the player. */
  landClear: 11,
  speed: 7,
  accel: 14,
} as const;

/**
 * Steer a velocity towards a target point (arrive behaviour): accelerate at most `accel`, cruise at
 * most `maxSpeed`, slowing inside `slowR`. Mutates and returns `b`.
 */
export function steer(b: Bird, tx: number, ty: number, tz: number, maxSpeed: number, accel: number, slowR: number, dt: number): Bird {
  const dx = tx - b.x;
  const dy = ty - b.y;
  const dz = tz - b.z;
  const d = Math.hypot(dx, dy, dz);
  const want = d > 1e-6 ? Math.min(maxSpeed, (maxSpeed * d) / slowR) / d : 0;
  let ax = dx * want - b.vx;
  let ay = dy * want - b.vy;
  let az = dz * want - b.vz;
  const al = Math.hypot(ax, ay, az);
  const lim = accel * dt;
  if (al > lim) {
    ax *= lim / al;
    ay *= lim / al;
    az *= lim / al;
  }
  b.vx += ax;
  b.vy += ay;
  b.vz += az;
  return b;
}

/**
 * Advance a ground-bird flock. `threat` is the player (or null); `vehicleNear` adds a wider scare
 * radius. `groundAt` gives the terrain height. Returns true on the frame the flock scatters.
 */
export function stepFlock(
  f: Flock,
  threat: { x: number; z: number; vehicle: boolean } | null,
  dt: number,
  groundAt: (x: number, z: number) => number,
  rnd: () => number,
): boolean {
  f.t += dt;
  const [sx, sz] = f.spots[f.spot];
  let scattered = false;
  if (f.state === 'ground') {
    if (threat) {
      const r = threat.vehicle ? FLOCK.scareVehicle : FLOCK.scare;
      let near = false;
      for (const b of f.birds) if (Math.hypot(b.x - threat.x, b.z - threat.z) < r) near = true;
      if (near) {
        f.state = 'flying';
        f.t = 0;
        f.scatters++;
        scattered = true;
        // Head up and away from the threat.
        let ax = sx - threat.x;
        let az = sz - threat.z;
        const l = Math.hypot(ax, az) || 1;
        ax /= l;
        az /= l;
        f.gx = sx + ax * 18;
        f.gz = sz + az * 18;
        f.gy = groundAt(sx, sz) + 9 + rnd() * 4;
        for (const b of f.birds) {
          // Burst: each bird jumps up and away from the threat with a little spread.
          let bx = b.x - threat.x;
          let bz = b.z - threat.z;
          const bl = Math.hypot(bx, bz) || 1;
          bx /= bl;
          bz /= bl;
          b.vx = bx * (3 + rnd() * 2) + (rnd() - 0.5) * 2;
          b.vz = bz * (3 + rnd() * 2) + (rnd() - 0.5) * 2;
          b.vy = 4 + rnd() * 2;
        }
      }
    }
    if (!scattered) {
      // Pecking about: tiny hops towards the spot offsets.
      for (const b of f.birds) {
        b.x += (sx + b.ox - b.x) * damp(2, dt);
        b.z += (sz + b.oz - b.z) * damp(2, dt);
        b.y = groundAt(b.x, b.z);
        b.vx = b.vy = b.vz = 0;
      }
      return false;
    }
  }
  if (f.state === 'flying') {
    // Circle the goal point in a loose ring; after a while pick the landing spot furthest from
    // the threat (if it is clear) and go there.
    const ang = f.t * 0.9;
    for (let i = 0; i < f.birds.length; i++) {
      const b = f.birds[i];
      const a = ang + (i / f.birds.length) * TAU;
      steer(b, f.gx + Math.cos(a) * 4, f.gy + Math.sin(a * 1.7) * 1.2, f.gz + Math.sin(a) * 4, FLOCK.speed, FLOCK.accel, 3, dt);
    }
    if (f.t > FLOCK.minAir) {
      let best = -1;
      let bestD = -1;
      for (let i = 0; i < f.spots.length; i++) {
        const d = threat ? Math.hypot(f.spots[i][0] - threat.x, f.spots[i][1] - threat.z) : Infinity;
        if (d > FLOCK.landClear && d > bestD) {
          bestD = d;
          best = i;
        }
      }
      if (best >= 0) {
        f.spot = best;
        f.state = 'landing';
        f.t = 0;
      }
    }
  } else if (f.state === 'landing') {
    const [lx, lz] = f.spots[f.spot];
    let down = 0;
    for (const b of f.birds) {
      const tx = lx + b.ox;
      const tz = lz + b.oz;
      const ty = groundAt(tx, tz);
      steer(b, tx, ty, tz, FLOCK.speed, FLOCK.accel, 4, dt);
      if (Math.hypot(tx - b.x, ty - b.y, tz - b.z) < 0.35) down++;
    }
    // Spooked again on the way down: back up.
    if (threat && Math.hypot(lx - threat.x, lz - threat.z) < FLOCK.landClear * 0.6) {
      f.state = 'flying';
      f.t = 0;
    } else if (down === f.birds.length || f.t > 8) {
      f.state = 'ground';
      f.t = 0;
    }
  }
  for (const b of f.birds) {
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.z += b.vz * dt;
    const g = groundAt(b.x, b.z);
    if (b.y < g) b.y = g;
  }
  // Separation: keep birds from overlapping in the air.
  for (let i = 0; i < f.birds.length; i++) {
    for (let j = i + 1; j < f.birds.length; j++) {
      const a = f.birds[i];
      const c = f.birds[j];
      const dx = a.x - c.x;
      const dy = a.y - c.y;
      const dz = a.z - c.z;
      const d = Math.hypot(dx, dy, dz);
      if (d > 1e-4 && d < 0.6 && f.state !== 'ground') {
        const push = ((0.6 - d) / d) * 0.5;
        a.x += dx * push;
        a.y += dy * push;
        a.z += dz * push;
        c.x -= dx * push;
        c.y -= dy * push;
        c.z -= dz * push;
      }
    }
  }
  return scattered;
}

// ───────────────────────────── misc ─────────────────────────────

/** Fish jump: progress k 0..1 → height above water (parabola) and pitch (nose up → nose down). */
export function fishArc(k: number, height: number): { y: number; pitch: number } {
  const y = 4 * height * k * (1 - k);
  const slope = 4 * height * (1 - 2 * k);
  return { y, pitch: -Math.atan(slope / 1.6) };
}

/** Smooth deterministic wind strength over time, about 0.6..1.5, with occasional gusts. */
export function gust(t: number): number {
  const base = 0.95 + 0.18 * Math.sin(t * 0.21) + 0.1 * Math.sin(t * 0.53 + 1.3);
  const g = Math.max(0, Math.sin(t * 0.13 + 0.7)) ** 6 * 0.45 + Math.max(0, Math.sin(t * 0.37 + 2.1)) ** 8 * 0.25;
  return base + g;
}

/** Nearest entry of `places` to (x, z). */
export function nearest<T extends { x: number; z: number }>(x: number, z: number, places: readonly T[]): T | null {
  let best: T | null = null;
  let bd = Infinity;
  for (const p of places) {
    const d = Math.hypot(p.x - x, p.z - z);
    if (d < bd) {
      bd = d;
      best = p;
    }
  }
  return best;
}

/** Distance from point to segment (2D). */
export function segDist(px: number, pz: number, ax: number, az: number, bx: number, bz: number): number {
  const vx = bx - ax;
  const vz = bz - az;
  const l2 = vx * vx + vz * vz;
  const t = l2 > 0 ? Math.max(0, Math.min(1, ((px - ax) * vx + (pz - az) * vz) / l2)) : 0;
  return Math.hypot(px - ax - vx * t, pz - az - vz * t);
}
