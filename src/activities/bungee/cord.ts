/**
 * Bungee cord maths (pure, no three.js): a point mass (the rider's body centre) on an elastic
 * cord that only pulls when stretched (spring + dashpot), with gentle air drag, camera-relative
 * steering inside a soft box, and a hard floor guard.
 *
 * The cord is planned per jump from the real ground below: its rest length and stiffness are chosen
 * so the deepest point of the first drop stops `clearance` metres above the ground, using the full
 * launch energy (so damping and steering can only make it shallower). The step function also has a
 * guard that never lets the rider's lowest point (`centre.y - BODY_HALF`) below ground + 2 m.
 */

export interface V3 {
  x: number;
  y: number;
  z: number;
}

/** Half the body height: the rider's head (inverted) is this far below the body centre. */
export const BODY_HALF = 0.85;

export const CORD = {
  /** Ride gravity (a touch floatier than walking, so the fall reads). */
  gravity: 20,
  /** Rest length as a share of the planned anchor → deepest-point drop. */
  restShare: 0.5,
  /** Dashpot along the cord (1/s, per unit mass). Tuned so the first rebound nearly reaches the deck. */
  damping: 0.06,
  /** Quadratic air drag coefficient (1/m). */
  drag: 0.0012,
  /** Lowest allowed head height above the ground, metres (hard guard). */
  minClearance: 2,
  /** Planned head clearance at the deepest point for a weak (0) and a perfect (1) dive. */
  clearanceWeak: 9,
  clearancePerfect: 3,
  /** Soft guard: below this clearance the cord stiffens progressively. */
  softFrom: 2.8,
  /** Steering acceleration (m/s²) at full stick. */
  steer: 7,
  /** Soft box around the anchor's plumb line the rider may swing in (metres). */
  boxWest: 9,
  boxEast: 1.4,
  boxSide: 5,
  /** Spring that pushes back from the box walls (1/s²). */
  wall: 30,
  /** Dive launch: speed along the facing direction and upwards, for power 0 and 1. */
  hopForward: [1.0, 1.8] as readonly [number, number],
  hopUp: [3.2, 5.2] as readonly [number, number],
} as const;

export interface CordPlan {
  /** Rest (slack) length, metres. */
  rest: number;
  /** Stiffness per unit mass (1/s²). */
  k: number;
  /** Planned lowest body-centre height. */
  lowestCentre: number;
}

const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));

/** Head clearance planned for a dive of `power` (0..1). */
export function plannedClearance(power: number): number {
  return CORD.clearanceWeak + (CORD.clearancePerfect - CORD.clearanceWeak) * clamp01(power);
}

/**
 * Choose rest length and stiffness so that, without damping, the rider (starting at `start` with
 * velocity `vel`) stops with the head `clearance` metres above `groundY` at the bottom of the first
 * drop. Energy is counted in full (horizontal too), which can only make the real drop shallower.
 */
export function planCord(anchor: V3, start: V3, vel: V3, groundY: number, clearance: number): CordPlan {
  const g = CORD.gravity;
  const lowestCentre = groundY + Math.max(CORD.minClearance + 0.5, clearance) + BODY_HALF;
  const drop = Math.max(4, anchor.y - lowestCentre);
  const rest = drop * CORD.restShare;
  const stretch = drop - rest;
  const energy = g * Math.max(0.5, start.y - lowestCentre) + 0.5 * (vel.x * vel.x + vel.y * vel.y + vel.z * vel.z);
  const k = (2 * energy) / (stretch * stretch);
  return { rest, k, lowestCentre };
}

export interface CordState {
  pos: V3;
  vel: V3;
}

export interface StepResult {
  /** Current cord length (anchor → body centre). */
  length: number;
  /** Stretch beyond the rest length (0 when slack). */
  stretch: number;
  /** The hard floor guard had to act this step. */
  guarded: boolean;
}

/**
 * Advance the rider by `dt` (sub-stepped internally). `steer` is a world-space horizontal
 * direction (length ≤ 1). `groundAt(x, z)` is the surface height below.
 */
export function stepCord(
  s: CordState,
  anchor: V3,
  plan: CordPlan,
  steer: { x: number; z: number },
  groundAt: (x: number, z: number) => number,
  dt: number,
): StepResult {
  const n = Math.max(1, Math.ceil(dt / (1 / 240)));
  const h = dt / n;
  const p = s.pos;
  const v = s.vel;
  let guarded = false;
  let len = 0;
  let stretch = 0;
  for (let i = 0; i < n; i++) {
    const dx = p.x - anchor.x;
    const dy = p.y - anchor.y;
    const dz = p.z - anchor.z;
    len = Math.hypot(dx, dy, dz);
    let ax = steer.x * CORD.steer;
    let ay = -CORD.gravity;
    let az = steer.z * CORD.steer;
    stretch = Math.max(0, len - plan.rest);
    if (stretch > 0 && len > 1e-6) {
      const ux = dx / len;
      const uy = dy / len;
      const uz = dz / len;
      const vr = v.x * ux + v.y * uy + v.z * uz;
      // Spring + dashpot along the cord (a cord can pull, never push).
      const pull = Math.max(0, plan.k * stretch + CORD.damping * vr);
      ax -= ux * pull;
      ay -= uy * pull;
      az -= uz * pull;
    }
    // Soft guard: progressively stiffer cushion just above the hard limit.
    const ground = groundAt(p.x, p.z);
    const head = p.y - BODY_HALF - ground;
    if (head < CORD.softFrom) {
      const d = CORD.softFrom - head;
      ay += 400 * d * d + (v.y < 0 ? -8 * v.y : 0);
    }
    // Soft box around the plumb line (keeps the swing off the bridge and the canyon walls).
    const west = -CORD.boxWest - dx;
    const east = dx - CORD.boxEast;
    if (west > 0) ax += CORD.wall * west - 4 * Math.min(0, v.x);
    if (east > 0) ax -= CORD.wall * east + 4 * Math.max(0, v.x);
    const side = Math.abs(dz) - CORD.boxSide;
    if (side > 0) az -= Math.sign(dz) * CORD.wall * side + 4 * (Math.sign(dz) === Math.sign(v.z) ? v.z : 0);
    // Air drag.
    const sp = Math.hypot(v.x, v.y, v.z);
    ax -= CORD.drag * sp * v.x;
    ay -= CORD.drag * sp * v.y;
    az -= CORD.drag * sp * v.z;

    v.x += ax * h;
    v.y += ay * h;
    v.z += az * h;
    p.x += v.x * h;
    p.y += v.y * h;
    p.z += v.z * h;

    // Hard guard: the head never goes below ground + minClearance.
    const floor = groundAt(p.x, p.z) + CORD.minClearance + BODY_HALF;
    if (p.y < floor) {
      p.y = floor;
      if (v.y < 0) v.y = -v.y * 0.3;
      guarded = true;
    }
  }
  return { length: len, stretch, guarded };
}

/** Launch velocity for a dive of `power` (0..1) facing `yaw` (atan2(x, z) convention). */
export function diveVelocity(yaw: number, power: number): V3 {
  const k = clamp01(power);
  const f = CORD.hopForward[0] + (CORD.hopForward[1] - CORD.hopForward[0]) * k;
  const u = CORD.hopUp[0] + (CORD.hopUp[1] - CORD.hopUp[0]) * k;
  return { x: Math.sin(yaw) * f, y: u, z: Math.cos(yaw) * f };
}

/**
 * Springboard pump: the board bobs with this phase (0..1 = 0 at rest, 1 at the top of the bob).
 * Pressing jump near the top of a bob gives the best dive.
 */
export function pumpPower(t: number, period = 1.25): number {
  return 0.5 - 0.5 * Math.cos((2 * Math.PI * t) / period);
}

/** Stars for a dive that went `depth` metres below the deck, out of the `maxDepth` possible. */
export function depthStars(depth: number, maxDepth: number): number {
  const r = maxDepth > 0 ? depth / maxDepth : 0;
  if (r >= 0.93) return 3;
  if (r >= 0.82) return 2;
  if (r >= 0.6) return 1;
  return 0;
}

/**
 * Body orientation that lines the rider up with the cord, feet towards the anchor (head down):
 * returns the tilt (pitch, roll) for `PlayerApi.setTilt` given the cord direction `u` (anchor → body,
 * normalised, world space) and the player's yaw.
 */
export function hangTilt(u: V3, yaw: number): { pitch: number; roll: number } {
  // Into the yaw frame (inverse yaw rotation about Y).
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  const lx = c * u.x - s * u.z;
  const lz = s * u.x + c * u.z;
  const ly = u.y;
  const roll = -Math.asin(Math.max(-1, Math.min(1, lx)));
  const pitch = Math.atan2(lz, ly);
  return { pitch, roll };
}

/** `a` moved to the equivalent angle (± 2π k) nearest to `ref`. */
export function unwrapNear(a: number, ref: number): number {
  const TAU = Math.PI * 2;
  return a + Math.round((ref - a) / TAU) * TAU;
}

/** Smooth 0..1 (smootherstep). */
export function smooth01(t: number): number {
  const k = clamp01(t);
  return k * k * k * (k * (k * 6 - 15) + 10);
}

/**
 * Lowering path: from `from` (with velocity `v0`) to `to`, a cubic Hermite curve in time `T`.
 * Returns the position at time `t`.
 */
export function hermite(from: V3, v0: V3, to: V3, T: number, t: number): V3 {
  const u = clamp01(t / T);
  const h00 = 2 * u * u * u - 3 * u * u + 1;
  const h10 = u * u * u - 2 * u * u + u;
  const h01 = -2 * u * u * u + 3 * u * u;
  return {
    x: h00 * from.x + h10 * T * v0.x + h01 * to.x,
    y: h00 * from.y + h10 * T * v0.y + h01 * to.y,
    z: h00 * from.z + h10 * T * v0.z + h01 * to.z,
  };
}
