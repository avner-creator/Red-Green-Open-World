/**
 * Arcade flight maths shared by the stunt plane and the friendly dragon. Pure: no three, no DOM.
 *
 * The craft always flies forward along (yaw, pitch); the stick turns and pitches it, it levels out
 * by itself when the stick is let go, and it can never crash: the ground, roofs and the sea bounce
 * it back up (a comic boing), and the island edge turns it round. Angles: yaw = atan2(vx, vz) like
 * the player, pitch + = nose up, roll + = banked right (left wing up).
 */

export interface V3 {
  x: number;
  y: number;
  z: number;
}

export interface FlyState {
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  roll: number;
  /** Air speed along the nose, m/s. */
  speed: number;
  /** Extra vertical speed on top of the nose direction (dragon flaps, bounces), m/s; decays. */
  lift: number;
  /** Smoothed turn rate, rad/s (+ = left). */
  yawRate: number;
}

export interface FlyControls {
  /** -1..1, + = turn right. */
  turn: number;
  /** -1..1, + = nose up. */
  climb: number;
  boost: boolean;
  /** Optional heading to steer towards ("steer where you look"); weight 0..1. */
  lookYaw?: number;
  lookWeight?: number;
}

export interface FlyTuning {
  cruise: number;
  boost: number;
  /** Speed change rate, 1/s. */
  accel: number;
  maxYawRate: number;
  maxPitch: number;
  maxBank: number;
  /** How fast pitch / bank follow the stick (and level out), 1/s. */
  pitchRate: number;
  bankRate: number;
  /** Lowest allowed height above the surface; below it the craft boings back up. */
  floor: number;
  /** Upward speed after a bounce, m/s. */
  bounceUp: number;
  /** Highest allowed altitude (absolute y); above it the nose is pushed down. */
  ceiling: number;
  /** Beyond this distance from the island centre the craft turns round. */
  edge: number;
  /** Constant sink while gliding (dragon), m/s. */
  sink: number;
  /** Lift decay rate, 1/s. */
  liftDecay: number;
}

export const PLANE_TUNING: FlyTuning = {
  cruise: 21,
  boost: 31,
  accel: 1.6,
  maxYawRate: 1.05,
  maxPitch: 0.55,
  maxBank: 0.9,
  pitchRate: 2.6,
  bankRate: 3.2,
  floor: 3,
  bounceUp: 11,
  ceiling: 95,
  edge: 180,
  sink: 0,
  liftDecay: 1.6,
};

export const DRAGON_TUNING: FlyTuning = {
  cruise: 17,
  boost: 25,
  accel: 1.2,
  maxYawRate: 1.0,
  maxPitch: 0.5,
  maxBank: 0.7,
  pitchRate: 2,
  bankRate: 2.5,
  floor: 4,
  bounceUp: 9,
  ceiling: 110,
  edge: 168,
  sink: 1.2,
  liftDecay: 1.1,
};

/** What `stepFly` reports for one step. */
export interface FlyEvents {
  /** Bounced off the ground, a roof or the sea this step. */
  bounced: boolean;
  /** The island edge is turning the craft round. */
  edge: boolean;
}

/** World queries the flight needs: the surface (terrain, roof or sea) under a point. */
export type SurfaceFn = (x: number, y: number, z: number) => number;

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/** Shortest signed angle from a to b, radians. */
export function angleDelta(a: number, b: number): number {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d <= -Math.PI) d += Math.PI * 2;
  return d;
}

/** Exponential smoothing factor. */
export function follow(rate: number, dt: number): number {
  return 1 - Math.exp(-rate * dt);
}

/** Unit nose direction for (yaw, pitch). */
export function noseDir(yaw: number, pitch: number, out: V3 = { x: 0, y: 0, z: 0 }): V3 {
  const c = Math.cos(pitch);
  out.x = Math.sin(yaw) * c;
  out.y = Math.sin(pitch);
  out.z = Math.cos(yaw) * c;
  return out;
}

export function createFlyState(x: number, y: number, z: number, yaw: number, speed = 0): FlyState {
  return { x, y, z, yaw, pitch: 0, roll: 0, speed, lift: 0, yawRate: 0 };
}

/** Velocity of the craft (nose * speed + lift - sink). */
export function flyVelocity(s: FlyState, t: FlyTuning, out: V3 = { x: 0, y: 0, z: 0 }): V3 {
  noseDir(s.yaw, s.pitch, out);
  out.x *= s.speed;
  out.y = out.y * s.speed + s.lift - t.sink;
  out.z *= s.speed;
  return out;
}

/**
 * Advance the craft by dt. Mutates `s`. The stick is blended with "steer where you look" and with
 * the safety rules (floor, ceiling, edge), so whatever the input the craft stays in the sky above
 * the island.
 */
export function stepFly(s: FlyState, c: FlyControls, t: FlyTuning, dt: number, surface: SurfaceFn): FlyEvents {
  const ev: FlyEvents = { bounced: false, edge: false };
  let turn = clamp(c.turn, -1, 1);
  let climb = clamp(c.climb, -1, 1);

  // Steer where you look: turn towards the look heading, as if the stick were pushed.
  if (c.lookYaw !== undefined && (c.lookWeight ?? 0) > 0) {
    const d = angleDelta(s.yaw, c.lookYaw);
    turn = clamp(turn - clamp(d * 1.6, -1, 1) * (c.lookWeight ?? 0), -1, 1);
  }

  // Island edge: steer back towards the centre.
  const r = Math.hypot(s.x, s.z);
  if (r > t.edge) {
    ev.edge = true;
    const home = Math.atan2(-s.x, -s.z);
    const d = angleDelta(s.yaw, home);
    turn = clamp(-d * 2, -1, 1);
  }

  // Altitude rules: stay above the floor, below the ceiling.
  const ground = surface(s.x, s.y, s.z);
  const agl = s.y - ground;
  if (agl < t.floor * 2.5) climb = Math.max(climb, 1 - agl / (t.floor * 2.5));
  if (s.y > t.ceiling) climb = Math.min(climb, -0.6);

  // Turn rate follows the stick; bank and pitch follow it too and level out when it is let go.
  const wantRate = -turn * t.maxYawRate;
  s.yawRate += (wantRate - s.yawRate) * follow(t.bankRate, dt);
  s.yaw += s.yawRate * dt;
  if (s.yaw > Math.PI) s.yaw -= Math.PI * 2;
  if (s.yaw < -Math.PI) s.yaw += Math.PI * 2;
  const wantBank = clamp((-s.yawRate / t.maxYawRate) * t.maxBank, -t.maxBank, t.maxBank);
  s.roll += (wantBank - s.roll) * follow(t.bankRate, dt);
  s.pitch += (climb * t.maxPitch - s.pitch) * follow(t.pitchRate, dt);

  const wantSpeed = c.boost ? t.boost : t.cruise;
  // Diving speeds you up a little, climbing slows you a little (feels like flying).
  const slope = -Math.sin(s.pitch) * 4;
  s.speed += (wantSpeed + slope - s.speed) * follow(t.accel, dt);
  s.lift *= Math.exp(-t.liftDecay * dt);

  const vy = Math.sin(s.pitch) * s.speed + s.lift - t.sink;
  const h = Math.cos(s.pitch) * s.speed;
  s.x += Math.sin(s.yaw) * h * dt;
  s.z += Math.cos(s.yaw) * h * dt;
  s.y += vy * dt;

  // Never crash: anything below the floor is a bounce back up.
  const g2 = surface(s.x, s.y, s.z);
  if (s.y < g2 + t.floor * 0.5) {
    s.y = g2 + t.floor * 0.5;
    if (vy < 0 || s.lift < t.bounceUp * 0.5) {
      s.lift = t.bounceUp;
      s.pitch = Math.max(s.pitch, 0.35);
      s.speed *= 0.85;
      ev.bounced = true;
    }
  }
  return ev;
}

/** How far a touring craft may stray from its route: above, below and to the side (m). */
export const LEASH = { up: 10, down: 14, side: 18 } as const;

/**
 * Keep a touring craft (the dragon) near its route, so mashing flap or holding a turn never leaves
 * the cloud-balloons and treasure far behind: above `up` m over the line the nose goes down and flap
 * lift fades; beyond `side` m to the side the stick is blended into a turn back. Mutates `c` and
 * caps `s.lift`. `line` = a point on the route a little ahead.
 */
export function leashControls(s: FlyState, c: FlyControls, line: V3, dt: number, l = LEASH): void {
  const above = s.y - line.y;
  if (above > l.up) {
    const k = clamp((above - l.up) / 6, 0, 1);
    c.climb = Math.min(c.climb, -0.8 * k);
    s.lift = Math.min(s.lift, Math.max(0, (l.up + 6 - above) * 1.2));
    s.lift -= s.lift * Math.min(1, dt * 4 * k);
  } else if (above < -l.down) {
    c.climb = Math.max(c.climb, clamp((-above - l.down) / 8, 0, 1));
  }
  const dx = line.x - s.x;
  const dz = line.z - s.z;
  const d = Math.hypot(dx, dz);
  if (d > l.side) {
    const k = clamp((d - l.side) / 10, 0, 1);
    const t = clamp(-angleDelta(s.yaw, Math.atan2(dx, dz)) * 1.6, -1, 1);
    c.turn += (t - c.turn) * k;
    c.lookWeight = (c.lookWeight ?? 0) * (1 - k);
  }
}

/**
 * Trick timeline for loops and barrel rolls (plane). A loop flies a real vertical circle; a roll
 * spins the plane round its nose while it keeps flying straight. `t` runs 0..1.
 */
export type TrickKind = 'loop' | 'roll';

export interface TrickRun {
  kind: TrickKind;
  t: number;
  duration: number;
  /** Roll direction for barrel rolls: +1 right, -1 left. */
  dir: number;
}

export const TRICKS = {
  loopSeconds: 2.4,
  rollSeconds: 1.1,
  /** Needed clearance under the plane for a loop (else it does a roll). */
  loopClearance: 26,
} as const;

/** Pick the trick for a skill press: a roll while turning or when low, else a loop. */
export function chooseTrick(turn: number, agl: number): TrickRun {
  if (Math.abs(turn) > 0.3 || agl < TRICKS.loopClearance) {
    return { kind: 'roll', t: 0, duration: TRICKS.rollSeconds, dir: turn < 0 ? -1 : 1 };
  }
  return { kind: 'loop', t: 0, duration: TRICKS.loopSeconds, dir: 1 };
}

/** Smooth 0..1 easing used for trick angles. */
export function smooth01(t: number): number {
  const k = clamp(t, 0, 1);
  return k * k * (3 - 2 * k);
}

/**
 * Advance a trick. Returns the extra pitch (loop) and roll (barrel roll) to add to the craft, and
 * whether it just finished. For loops the caller flies the plane along the pitched nose, so the
 * path is a real circle.
 */
export function stepTrick(run: TrickRun, dt: number): { pitch: number; roll: number; done: boolean } {
  run.t = Math.min(1, run.t + dt / run.duration);
  const k = smooth01(run.t);
  if (run.kind === 'loop') return { pitch: k * Math.PI * 2, roll: 0, done: run.t >= 1 };
  return { pitch: 0, roll: run.dir * k * Math.PI * 2, done: run.t >= 1 };
}

/** Cubic Bezier point (auto landings). */
export function bezier(p0: V3, p1: V3, p2: V3, p3: V3, t: number, out: V3 = { x: 0, y: 0, z: 0 }): V3 {
  const u = 1 - t;
  const a = u * u * u;
  const b = 3 * u * u * t;
  const c = 3 * u * t * t;
  const d = t * t * t;
  out.x = a * p0.x + b * p1.x + c * p2.x + d * p3.x;
  out.y = a * p0.y + b * p1.y + c * p2.y + d * p3.y;
  out.z = a * p0.z + b * p1.z + c * p2.z + d * p3.z;
  return out;
}

/** Ballistic water balloon step (gravity only). Mutates pos/vel. */
export function stepBalloon(pos: V3, vel: V3, dt: number, gravity = 18): void {
  vel.y -= gravity * dt;
  pos.x += vel.x * dt;
  pos.y += vel.y * dt;
  pos.z += vel.z * dt;
}

/**
 * Where a balloon dropped from `pos` with velocity `vel` meets the plane y = groundY (for the
 * aim marker). Returns null if it never gets there.
 */
export function predictImpact(pos: V3, vel: V3, groundY: number, gravity = 18): V3 | null {
  // y(t) = y0 + vy t - g t² / 2 = groundY
  const a = -gravity / 2;
  const b = vel.y;
  const c = pos.y - groundY;
  const disc = b * b - 4 * a * c;
  if (disc < 0) return null;
  const t = (-b - Math.sqrt(disc)) / (2 * a);
  if (!(t > 0)) return null;
  return { x: pos.x + vel.x * t, y: groundY, z: pos.z + vel.z * t };
}
