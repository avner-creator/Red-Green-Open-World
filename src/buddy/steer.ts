/**
 * Pip's follow steering (pure maths, no three.js). Pip has no physics body: he steers on the
 * ground plane (x, z) and the caller snaps him to the terrain.
 */
export interface V2 {
  x: number;
  z: number;
}

export const FOLLOW = {
  /** Sideways offset from the hero (m). */
  side: 1.05,
  /** How far ahead Pip trots while the hero walks (m, at full walking speed). */
  lead: 1.6,
  /** Closer than this to the slot = arrived. */
  stopDist: 0.18,
  /** Slow down inside this radius (m). */
  slowRadius: 1.4,
  /** Base top speed (m/s); `catchUpSpeed` raises it when he falls behind. */
  baseSpeed: 6.5,
  maxSpeed: 15,
  accel: 26,
  /** Never closer to the hero's feet than this (m). */
  personal: 0.75,
  /** Left further behind than this → pop back next to the hero. */
  teleportDist: 25,
} as const;

/** Unit forward vector for a yaw (three.js: yaw 0 faces +Z). */
export function forward(yaw: number): V2 {
  return { x: Math.sin(yaw), z: Math.cos(yaw) };
}

/** Unit right vector for a yaw (facing +Z, right is -X). */
export function right(yaw: number): V2 {
  return { x: -Math.cos(yaw), z: Math.sin(yaw) };
}

/**
 * Where Pip wants to be: beside the hero, a little ahead while walking (he likes to lead), level
 * or slightly behind when the hero stops. `side` is +1 (right) or -1 (left).
 */
export function followSlot(hero: V2, heroYaw: number, heroSpeed: number, side: number): V2 {
  const f = forward(heroYaw);
  const r = right(heroYaw);
  const moving = Math.min(1, Math.max(0, heroSpeed / 5));
  const lead = -0.25 + (FOLLOW.lead + 0.25) * moving;
  const s = FOLLOW.side * (1 - 0.15 * moving) * Math.sign(side || 1);
  return { x: hero.x + f.x * lead + r.x * s, z: hero.z + f.z * lead + r.z * s };
}

/** Top speed that lets Pip catch up: faster than the hero, faster still when far away. */
export function catchUpSpeed(distToSlot: number, heroSpeed: number): number {
  const v = Math.max(FOLLOW.baseSpeed, heroSpeed * 1.2 + 1) + Math.max(0, distToSlot - 1.5) * 1.6;
  return Math.min(FOLLOW.maxSpeed, v);
}

/**
 * "Arrive" steering: accelerate towards `target`, slow down inside `slowRadius`, stop at
 * `stopDist`. Returns the new velocity (acceleration-limited).
 */
export function arrive(pos: V2, vel: V2, target: V2, dt: number, maxSpeed: number, accel: number = FOLLOW.accel): V2 {
  const dx = target.x - pos.x;
  const dz = target.z - pos.z;
  const dist = Math.hypot(dx, dz);
  let wantX = 0;
  let wantZ = 0;
  if (dist > FOLLOW.stopDist) {
    const speed = Math.min(maxSpeed, (maxSpeed * dist) / FOLLOW.slowRadius);
    wantX = (dx / dist) * speed;
    wantZ = (dz / dist) * speed;
  }
  let ax = wantX - vel.x;
  let az = wantZ - vel.z;
  const a = Math.hypot(ax, az);
  const lim = accel * dt;
  if (a > lim && a > 0) {
    ax *= lim / a;
    az *= lim / a;
  }
  return { x: vel.x + ax, z: vel.z + az };
}

/** Push a point out of a circle (keeps Pip off the hero's feet). */
export function keepClear(p: V2, center: V2, radius: number): V2 {
  const dx = p.x - center.x;
  const dz = p.z - center.z;
  const d = Math.hypot(dx, dz);
  if (d >= radius) return p;
  if (d < 1e-4) return { x: center.x + radius, z: center.z };
  return { x: center.x + (dx / d) * radius, z: center.z + (dz / d) * radius };
}

export function shouldTeleport(pip: V2, hero: V2, limit: number = FOLLOW.teleportDist): boolean {
  return Math.hypot(pip.x - hero.x, pip.z - hero.z) > limit;
}

/** Spot to pop in at when teleporting: behind and beside the hero (off camera-centre). */
export function teleportSpot(hero: V2, heroYaw: number, side: number): V2 {
  const f = forward(heroYaw);
  const r = right(heroYaw);
  return { x: hero.x - f.x * 1.6 + r.x * 1.2 * side, z: hero.z - f.z * 1.6 + r.z * 1.2 * side };
}

/** Shortest signed angle from a to b. */
export function angleDelta(a: number, b: number): number {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/** Turn `yaw` towards `target` by at most `rate * dt`. */
export function turnTowards(yaw: number, target: number, rate: number, dt: number): number {
  const d = angleDelta(yaw, target);
  const step = rate * dt;
  return yaw + Math.max(-step, Math.min(step, d));
}

/** Yaw that faces from `a` to `b`. */
export function yawTo(a: V2, b: V2): number {
  return Math.atan2(b.x - a.x, b.z - a.z);
}

/**
 * The intro's "general way" to the nearest gem spot: the direction snapped to one of 8 compass
 * sectors, and a stop point only `dist` metres from the hero (never the spot itself).
 */
export function generalWay(hero: V2, spot: V2, dist: number): V2 {
  const yaw = yawTo(hero, spot);
  const snapped = Math.round(yaw / (Math.PI / 4)) * (Math.PI / 4);
  const f = forward(snapped);
  return { x: hero.x + f.x * dist, z: hero.z + f.z * dist };
}
