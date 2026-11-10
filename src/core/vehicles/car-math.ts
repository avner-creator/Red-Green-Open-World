/**
 * Pure arcade-handling maths for the buggy (unit-tested). No three.js / Rapier here.
 * Conventions: speeds in m/s along the car's forward axis (+ = forwards), accelerations in m/s².
 */

export interface DriveTuning {
  /** Top speed on roads and paved pads. */
  topSpeedRoad: number;
  /** Top speed on grass/dirt. */
  topSpeedOffroad: number;
  reverseTopSpeed: number;
  /** Launch acceleration from standstill (fades towards top speed). */
  engineAccel: number;
  reverseAccel: number;
  brakeDecel: number;
  /** Rolling resistance with no throttle. */
  coastDecel: number;
  /** Decel used to pull speed back down when above the current top speed (grass after road). */
  overSpeedDecel: number;
  /** Below this speed with no throttle the car holds still (parking brake, even on slopes). */
  holdSpeed: number;
  wheelbase: number;
  /** Max front-wheel steer angle at a standstill / at top speed (radians). */
  steerLow: number;
  steerHigh: number;
  /** Cap on the yaw rate (rad/s) so the buggy never spins like a top. */
  maxYawRate: number;
  /** How fast the body's yaw rate follows the steering (1/s). */
  yawFollow: number;
  /** Sideways-velocity removal rate (1/s): high = on rails, low = drifty. */
  grip: number;
  /** Grip at full steer and full speed is reduced by this fraction (a little playful slide). */
  slideAtSpeed: number;
  /** Grip while the handbrake is held (power-slide). */
  handbrakeGrip: number;
  /** Steering input smoothing (1/s) towards / back to centre. */
  steerRate: number;
  steerReturnRate: number;
}

export const DRIVE: DriveTuning = {
  topSpeedRoad: 16,
  topSpeedOffroad: 11,
  reverseTopSpeed: 6,
  engineAccel: 12,
  reverseAccel: 8,
  brakeDecel: 22,
  coastDecel: 3.2,
  overSpeedDecel: 5,
  holdSpeed: 3,
  wheelbase: 2.3,
  steerLow: 0.62,
  steerHigh: 0.2,
  maxYawRate: 2.4,
  yawFollow: 10,
  grip: 11,
  slideAtSpeed: 0.4,
  handbrakeGrip: 1.6,
  steerRate: 7,
  steerReturnRate: 11,
};

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * Longitudinal acceleration for forward speed `v`, throttle `t` (−1..1: negative = brake, then
 * reverse once stopped) and the current top speed. Positive = along the car's nose.
 */
export function driveAccel(v: number, t: number, top: number, d: DriveTuning = DRIVE): number {
  const throttle = clamp(t, -1, 1);
  if (throttle > 0.01) {
    if (v < -0.4) return d.brakeDecel * throttle; // rolling backwards: brake first
    const cap = top * throttle;
    if (v > cap) return -Math.min(d.overSpeedDecel, (v - cap) * 3);
    const u = clamp(v / Math.max(0.1, cap), 0, 1);
    // Strong launch that eases off near the cap (feels quick but lands softly on top speed).
    return d.engineAccel * throttle * (1 - u * u * u) + 0.6;
  }
  if (throttle < -0.01) {
    const amt = -throttle;
    if (v > 0.4) return -d.brakeDecel * amt;
    const cap = d.reverseTopSpeed * amt;
    if (-v > cap) return Math.min(d.overSpeedDecel, (-v - cap) * 3);
    const u = clamp(-v / Math.max(0.1, cap), 0, 1);
    return -d.reverseAccel * amt * (1 - u * u);
  }
  // No throttle: roll to a stop, then hold.
  if (Math.abs(v) > top) return -Math.sign(v) * Math.min(d.overSpeedDecel, (Math.abs(v) - top) * 3);
  const decel = Math.abs(v) < d.holdSpeed ? d.brakeDecel * 0.5 : d.coastDecel;
  return -Math.sign(v) * Math.min(decel, Math.abs(v) * 30);
}

/** Apply `driveAccel` over dt without overshooting zero when braking/coasting. */
export function integrateSpeed(v: number, accel: number, dt: number, throttle: number): number {
  const next = v + accel * dt;
  // Coasting/holding or braking never reverses direction on its own.
  if (Math.abs(throttle) <= 0.01 && Math.sign(next) !== Math.sign(v) && v !== 0) return 0;
  if (throttle < -0.01 && v > 0.4 && next < 0) return 0;
  if (throttle > 0.01 && v < -0.4 && next > 0) return 0;
  return next;
}

/** Front-wheel steer angle: tight at low speed, softer at speed. */
export function steerAngle(steer: number, speed: number, top: number, d: DriveTuning = DRIVE): number {
  const k = clamp(Math.abs(speed) / Math.max(1, top), 0, 1);
  return clamp(steer, -1, 1) * lerp(d.steerLow, d.steerHigh, k * k * (3 - 2 * k));
}

/** Bicycle-model yaw rate for forward speed `v` and steer angle (rad/s, + = turning left). */
export function yawRateFor(v: number, angle: number, d: DriveTuning = DRIVE): number {
  return clamp((v * Math.tan(angle)) / d.wheelbase, -d.maxYawRate, d.maxYawRate);
}

/** Sideways grip rate (1/s) for the current speed, steering and handbrake. */
export function gripRate(speed: number, steer: number, top: number, handbrake: boolean, d: DriveTuning = DRIVE): number {
  if (handbrake) return d.handbrakeGrip;
  const k = clamp(Math.abs(speed) / Math.max(1, top), 0, 1);
  return d.grip * (1 - d.slideAtSpeed * Math.abs(clamp(steer, -1, 1)) * k * k);
}

/** Smooth a digital steering input (keyboard) so it ramps in and snaps back. */
export function smoothSteer(current: number, target: number, dt: number, d: DriveTuning = DRIVE): number {
  const returning = Math.abs(target) < Math.abs(current) || Math.sign(target) !== Math.sign(current);
  const rate = returning ? d.steerReturnRate : d.steerRate;
  return current + (target - current) * (1 - Math.exp(-rate * dt));
}

/**
 * Speed cap in water of `depth` metres (0 = dry): shallow water slows the buggy right down and
 * deeper water stops it, so the sea gently turns you around instead of swallowing the car.
 */
export function waterSpeedCap(top: number, depth: number): number {
  if (depth <= 0.05) return top;
  return Math.max(1.5, top * (1 - clamp((depth - 0.05) / 0.6, 0, 1)));
}

/** Engine loop parameters from speed and throttle: intensity 0..1, pitch ~0.6..1.8. */
export function engineSound(speed: number, throttle: number, top: number): { intensity: number; pitch: number } {
  const k = clamp(Math.abs(speed) / Math.max(1, top), 0, 1.2);
  return { intensity: clamp(0.3 + 0.45 * Math.abs(throttle) + 0.25 * k, 0, 1), pitch: 0.65 + 1.05 * k + 0.12 * Math.abs(throttle) };
}

/** Squared distance from point (px,pz) to segment (ax,az)-(bx,bz). */
export function segmentDistSq(px: number, pz: number, ax: number, az: number, bx: number, bz: number): number {
  const dx = bx - ax;
  const dz = bz - az;
  const len2 = dx * dx + dz * dz;
  const t = len2 > 0 ? clamp(((px - ax) * dx + (pz - az) * dz) / len2, 0, 1) : 0;
  const qx = ax + dx * t - px;
  const qz = az + dz * t - pz;
  return qx * qx + qz * qz;
}

/** Closest point on a polyline to (px,pz) with the segment direction there. */
export function closestOnPolyline(
  px: number,
  pz: number,
  pts: readonly (readonly [number, number])[],
): { x: number; z: number; dist: number; dirX: number; dirZ: number } {
  let best = { x: pts[0][0], z: pts[0][1], dist: Infinity, dirX: 0, dirZ: 1 };
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i];
    const [bx, bz] = pts[i + 1];
    const dx = bx - ax;
    const dz = bz - az;
    const len2 = dx * dx + dz * dz;
    if (len2 === 0) continue;
    const t = clamp(((px - ax) * dx + (pz - az) * dz) / len2, 0, 1);
    const x = ax + dx * t;
    const z = az + dz * t;
    const dist = Math.hypot(x - px, z - pz);
    if (dist < best.dist) {
      const l = Math.sqrt(len2);
      best = { x, z, dist, dirX: dx / l, dirZ: dz / l };
    }
  }
  return best;
}
