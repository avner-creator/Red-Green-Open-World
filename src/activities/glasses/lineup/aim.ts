/**
 * Line-up targets: pure aiming maths (no scene, unit-tested).
 *
 * The weak-eye magic ring sits at a fixed OFFSET from the screen centre and moves 1:1 with the
 * camera, so a child who sees it can steer it onto a bubble easily. The offset is redrawn after
 * every press and every time-out, uniformly BY AREA from a large region: 5°–14° from the centre
 * in every direction except the lower sector where the hero's body would hide it. A player who
 * cannot see the ring can only guess where it is: one guess per bubble (press to pop), with the
 * hit chance of a blind guess ≈ (ring area × bubbles) / region area.
 */
import type { GlassesTier } from '../../../types';

export interface V3 {
  x: number;
  y: number;
  z: number;
}

const DEG = Math.PI / 180;

export const AIM = {
  thetaMin: 5 * DEG,
  thetaMax: 14 * DEG,
  /** Excluded sector: directions within this half-angle of straight down (the hero's body). */
  downHalf: 40 * DEG,
  /** Ring radius = how far a bubble's centre may be from the ring's centre and still count, by tier. */
  tolerance: { 1: 3.0 * DEG, 2: 2.3 * DEG, 3: 1.7 * DEG } as Readonly<Record<GlassesTier, number>>,
  /** Seconds the ring glides to a newly drawn offset. */
  glideSeconds: 0.3,
} as const;

/** Offset of the ring from the screen centre: angle `theta` from the centre, direction `phi` (0 = right, 90° = up). */
export interface Offset {
  theta: number;
  phi: number;
}

export const tolerance = (tier: GlassesTier): number => AIM.tolerance[tier];

/** Is a screen direction `phi` inside the allowed region (not in the lower sector)? */
export function inRegion(o: Offset): boolean {
  if (o.theta < AIM.thetaMin - 1e-9 || o.theta > AIM.thetaMax + 1e-9) return false;
  const fromDown = Math.abs(Math.atan2(Math.sin(o.phi + Math.PI / 2), Math.cos(o.phi + Math.PI / 2)));
  return fromDown >= AIM.downHalf - 1e-9;
}

/** Region area in square radians (small-angle, flat). */
export function regionArea(): number {
  const frac = 1 - (2 * AIM.downHalf) / (2 * Math.PI);
  return frac * Math.PI * (AIM.thetaMax ** 2 - AIM.thetaMin ** 2);
}

/** Draw an offset uniformly by area over the region. */
export function drawOffset(rng: () => number): Offset {
  const t2 = AIM.thetaMin ** 2 + rng() * (AIM.thetaMax ** 2 - AIM.thetaMin ** 2);
  const span = 2 * Math.PI - 2 * AIM.downHalf;
  // Start just after the excluded sector (down + downHalf, counter-clockwise).
  const phi = -Math.PI / 2 + AIM.downHalf + rng() * span;
  return { theta: Math.sqrt(t2), phi: Math.atan2(Math.sin(phi), Math.cos(phi)) };
}

/** Flat screen-angle coordinates (radians) of an offset. */
export const toXY = (o: Offset): { x: number; y: number } => ({ x: o.theta * Math.cos(o.phi), y: o.theta * Math.sin(o.phi) });
export const fromXY = (x: number, y: number): Offset => ({ theta: Math.hypot(x, y), phi: Math.atan2(y, x) });

/** The ring's offset `t` seconds into a glide from `a` to `b` (straight on the screen, eased). */
export function glide(a: Offset, b: Offset, t: number): Offset {
  const k = Math.min(1, Math.max(0, t / AIM.glideSeconds));
  const e = k * k * (3 - 2 * k);
  const p = toXY(a);
  const q = toXY(b);
  return fromXY(p.x + (q.x - p.x) * e, p.y + (q.y - p.y) * e);
}

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

/** The ring's direction for a camera looking along `forward`. */
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

/** The camera direction that puts the ring exactly on `target` (test aimer). */
export function aimForReticle(target: V3, o: Offset): V3 {
  const t = normalize(target);
  let f = t;
  for (let k = 0; k < 8; k++) {
    const r = reticleDirection(f, o);
    f = normalize({ x: f.x + (t.x - r.x), y: f.y + (t.y - r.y), z: f.z + (t.z - r.z) });
  }
  return f;
}

/** Is a bubble (direction from the camera to its centre) inside the ring? */
export function onTarget(reticle: V3, toBubble: V3, tier: GlassesTier): boolean {
  return angleBetween(reticle, toBubble) <= tolerance(tier);
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
