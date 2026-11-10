/**
 * Line-up targets: pure aiming maths (no scene, unit-tested).
 *
 * The weak-eye reticle follows the camera aim with an offset that slowly orbits over the upper
 * half of the screen (so it never hides behind the hero): `theta` (angle from the screen centre)
 * stays within 4°–7°, `phi` (direction around the centre, 0 = right, 90° = up) sweeps 25°–155°.
 * Every tolerance is well below the smallest offset, so putting a bubble in the middle of the
 * screen can never pop it: only the reticle (which only the weak eye sees) can.
 */
import type { GlassesTier } from '../../../types';
import { TIERS } from '../../../vision/toolkit';

export interface V3 {
  x: number;
  y: number;
  z: number;
}

const DEG = Math.PI / 180;

export const AIM = {
  thetaMin: 4 * DEG,
  thetaMax: 7 * DEG,
  phiMin: 25 * DEG,
  phiMax: 155 * DEG,
  /** Sweep rates (rad/s of phase) at tier 1; higher tiers multiply by `TIERS[t].speed`. */
  phiRate: 0.24,
  thetaRate: 0.37,
  /** Max angle between the reticle and a bubble's centre that counts as "on it", by tier. */
  tolerance: { 1: 3.0 * DEG, 2: 2.3 * DEG, 3: 1.7 * DEG } as Readonly<Record<GlassesTier, number>>,
  /** Seconds the reticle must stay on a bubble. */
  holdSeconds: 1,
  /** Hold drains at this rate (per second) while off target, so a brief slip is forgiven. */
  holdDecay: 1.6,
} as const;

export interface Offset {
  theta: number;
  phi: number;
}

/** Orbit speed factor for a tier. */
export const orbitSpeed = (tier: GlassesTier): number => TIERS[tier].speed;

/** Offset at orbit clock `clock` (seconds × the tier's speed, accumulated by the caller). */
export function orbitAt(clock: number, phase = 0): Offset {
  const midP = (AIM.phiMin + AIM.phiMax) / 2;
  const ampP = (AIM.phiMax - AIM.phiMin) / 2;
  const midT = (AIM.thetaMin + AIM.thetaMax) / 2;
  const ampT = (AIM.thetaMax - AIM.thetaMin) / 2;
  return {
    phi: midP + ampP * Math.sin(clock * AIM.phiRate + phase),
    theta: midT + ampT * Math.sin(clock * AIM.thetaRate + 1.3 + phase * 1.7),
  };
}

export const tolerance = (tier: GlassesTier): number => AIM.tolerance[tier];

const len = (v: V3): number => Math.hypot(v.x, v.y, v.z);
export function normalize(v: V3): V3 {
  const l = len(v) || 1;
  return { x: v.x / l, y: v.y / l, z: v.z / l };
}
const cross = (a: V3, b: V3): V3 => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x });
const dot = (a: V3, b: V3): number => a.x * b.x + a.y * b.y + a.z * b.z;

/** Screen right / up for a camera looking along `forward` (world up = +Y, no roll). */
export function basis(forward: V3): { f: V3; right: V3; up: V3 } {
  const f = normalize(forward);
  let right = cross(f, { x: 0, y: 1, z: 0 });
  if (len(right) < 1e-6) right = { x: 1, y: 0, z: 0 };
  right = normalize(right);
  const up = cross(right, f);
  return { f, right, up };
}

/** The reticle's direction for a camera looking along `forward`. */
export function reticleDirection(forward: V3, o: Offset): V3 {
  const { f, right, up } = basis(forward);
  const c = Math.cos(o.theta);
  const s = Math.sin(o.theta);
  const cp = Math.cos(o.phi);
  const sp = Math.sin(o.phi);
  return normalize({
    x: f.x * c + s * (cp * right.x + sp * up.x),
    y: f.y * c + s * (cp * right.y + sp * up.y),
    z: f.z * c + s * (cp * right.z + sp * up.z),
  });
}

/** Angle (radians) between two directions. */
export function angleBetween(a: V3, b: V3): number {
  const d = dot(normalize(a), normalize(b));
  return Math.acos(Math.max(-1, Math.min(1, d)));
}

/** The camera direction that puts the reticle exactly on `target` (test aimer / autopilot). */
export function aimForReticle(target: V3, o: Offset): V3 {
  const t = normalize(target);
  let f = t;
  for (let k = 0; k < 8; k++) {
    const r = reticleDirection(f, o);
    f = normalize({ x: f.x + (t.x - r.x), y: f.y + (t.y - r.y), z: f.z + (t.z - r.z) });
  }
  return f;
}

/** Is the reticle on a bubble (direction from the camera to its centre)? */
export function onTarget(reticle: V3, toBubble: V3, tier: GlassesTier): boolean {
  return angleBetween(reticle, toBubble) <= tolerance(tier);
}

/** Hold progress (seconds) after `dt`: fills while on target, drains while off. */
export function holdStep(hold: number, on: boolean, dt: number): number {
  return on ? hold + dt : Math.max(0, hold - AIM.holdDecay * dt);
}

/** Line-up tier ladder: two pops in a row climb one tier, a miss drops one. */
export interface TierState {
  tier: GlassesTier;
  streak: number;
}

export function nextTier(s: TierState, hit: boolean): TierState {
  if (!hit) return { tier: Math.max(1, s.tier - 1) as GlassesTier, streak: 0 };
  const streak = s.streak + 1;
  if (streak >= 2 && s.tier < 3) return { tier: (s.tier + 1) as GlassesTier, streak: 0 };
  return { tier: s.tier, streak };
}
