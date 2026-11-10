/**
 * Glow Dodge rules (pure): lanes, foam-ball paths, the hit test, the hop, spawn pacing and the
 * autopilot. Booth frame: balls leave the tunnels at the back of the tent (z = SPAWN_Z) and travel
 * towards +Z, where the contestants stand. Tuned to be forgiving for an 8-year-old.
 */
import { STAND_Z } from '../layout';

export type BallKind = 'roll' | 'lob';

export const DURATION = 30;
/** Balls leave the dark back of the tent here. */
export const SPAWN_Z = -4.4;
/** Contestant z (player at the stand spot, friends a step further out). */
export const PLAYER_Z = STAND_Z;
export const FRIEND_Z = 1.2;
/** Friends' lane centres are ±FRIEND_LANE_X (lane lines at ±0.85 and ±2.35). */
export const FRIEND_LANE_X = 1.6;
/** How far a contestant can step from the lane centre (body stays inside the tape). */
export const PLAYER_HALF = 0.6;
export const FRIEND_HALF = 0.45;
/** Sidestep speed, m/s. */
export const MOVE_SPEED = 4;
export const BALL_R: Readonly<Record<BallKind, number>> = { roll: 0.2, lob: 0.18 };
/** The contestant as a capsule-ish box: radius and height (from the feet). */
export const BODY_R = 0.24;
export const BODY_H = 1.45;
/** A roller that only grazes the shoes doesn't count. */
export const FORGIVE = 0.12;
export const HOP_V = 4.2;
export const GRAVITY = 14;
/** First ball for the player leaves this long after GO. */
export const GRACE = 1.2;
/** Random aim error around the contestant's current x. */
export const AIM_JITTER = 0.25;
export const LOB_START_Y = 0.75;
/** A lob crosses the contestant at chest height. */
export const LOB_CROSS_Y = 1.0;
/** Added to a friend's carnival skill when deciding a dodge (0: their usual, beatable selves). */
export const FRIEND_BONUS = 0;
/** Seconds a ball keeps going after it passed (then it's gone). */
export const FLY_ON = 0.4;

export interface BallPlan {
  /** 0 = player, 1/2 = friends. */
  who: number;
  kind: BallKind;
  x0: number;
  /** x where it crosses the contestant's z. */
  tx: number;
  tz: number;
  /** Seconds from the tunnel to the contestant. */
  dur: number;
  /** Extra arc height of a lob (0 for rollers). */
  apex: number;
}

const clamp = (v: number, a: number, b: number): number => Math.min(b, Math.max(a, v));

/** 0 at GO → 1 at the end: things speed up a little. */
function ramp(t: number): number {
  return clamp(t / DURATION, 0, 1);
}

/** Travel time tunnel → contestant: 1.6 s at the start, ~1.3 s at the end (never under 1.2 s). */
export function travelTime(t: number, rng: () => number): number {
  return Math.max(1.2, 1.6 - 0.3 * ramp(t) + (rng() - 0.5) * 0.12);
}

/** Seconds until the next ball for the same contestant: ~1.95 s at the start, ~1.45 s at the end. */
export function nextGap(t: number, rng: () => number): number {
  return clamp(1.95 - 0.5 * ramp(t) + (rng() - 0.5) * 0.1, 1.4, 2.0);
}

/** First ball is a roller (teaches the hop); never three of the same kind in a row. */
export function pickKind(rng: () => number, recent: readonly BallKind[]): BallKind {
  if (!recent.length) return 'roll';
  const n = recent.length;
  if (n >= 2 && recent[n - 1] === recent[n - 2]) return recent[n - 1] === 'roll' ? 'lob' : 'roll';
  return rng() < 0.5 ? 'roll' : 'lob';
}

export function clampLane(x: number, center: number, half: number): number {
  return clamp(x, center - half, center + half);
}

/** Aim at where the contestant is now, with a little randomness, never outside their lane. */
export function planBall(
  rng: () => number,
  who: number,
  kind: BallKind,
  lane: { center: number; half: number; z: number },
  targetX: number,
  t: number,
): BallPlan {
  const tx = clampLane(targetX + (rng() * 2 - 1) * AIM_JITTER, lane.center, lane.half);
  const x0 = lane.center + (rng() - 0.5) * 0.3;
  return { who, kind, x0, tx, tz: lane.z, dur: travelTime(t, rng), apex: kind === 'lob' ? 1.1 + rng() * 0.35 : 0 };
}

export interface P3 {
  x: number;
  y: number;
  z: number;
}

/** Ball centre `s` seconds after launch (s > dur continues past the contestant, on the floor). */
export function ballAt(p: BallPlan, s: number, out: P3 = { x: 0, y: 0, z: 0 }): P3 {
  const u = s / p.dur;
  const r = BALL_R[p.kind];
  out.x = p.x0 + (p.tx - p.x0) * u;
  out.z = SPAWN_Z + (p.tz - SPAWN_Z) * u;
  out.y = p.kind === 'roll' ? r : Math.max(r, LOB_START_Y + (LOB_CROSS_Y - LOB_START_Y) * u + 4 * p.apex * u * (1 - u));
  return out;
}

/** Does a ball at (bx, by) bonk a contestant at x `px` whose feet are `hopY` off the floor? */
export function hits(kind: BallKind, bx: number, by: number, px: number, hopY: number): boolean {
  const r = BALL_R[kind];
  if (Math.abs(bx - px) >= BODY_R + r) return false;
  return by + r - FORGIVE > hopY && by - r < hopY + BODY_H;
}

export interface Hop {
  y: number;
  vy: number;
}

/** Start a hop if on the floor. */
export function startHop(h: Hop): boolean {
  if (h.y > 0 || h.vy !== 0) return false;
  h.vy = HOP_V;
  return true;
}

export function hopStep(h: Hop, dt: number): void {
  if (h.y <= 0 && h.vy <= 0) {
    h.y = 0;
    h.vy = 0;
    return;
  }
  h.vy -= GRAVITY * dt;
  h.y += h.vy * dt;
  if (h.y <= 0) {
    h.y = 0;
    h.vy = 0;
  }
}

/** Where to sidestep to dodge a lob crossing at `tx`: the lane edge farther from it. */
export function dodgeX(tx: number, center: number, half: number): number {
  const a = center - half;
  const b = center + half;
  return Math.abs(a - tx) >= Math.abs(b - tx) ? a : b;
}

export interface Threat {
  kind: BallKind;
  tx: number;
  /** Seconds until it crosses. */
  eta: number;
}

/** Hop as a roller is about this far away (s). */
export const HOP_LEAD = 0.28;

/** A good player: hop rollers just in time, step away from lobs, drift home when it's calm. */
export function botInput(threats: readonly Threat[], px: number, hopY: number, center: number, half: number): { moveX: number; jump: boolean } {
  let next: Threat | null = null;
  for (const t of threats) if (t.eta > -0.02 && (!next || t.eta < next.eta)) next = t;
  const toward = (x: number): number => (Math.abs(x - px) < 0.04 ? 0 : clamp((x - px) * 6, -1, 1));
  if (!next) return { moveX: toward(center), jump: false };
  if (next.kind === 'roll') return { moveX: next.eta > 0.6 ? toward(center) : 0, jump: next.eta < HOP_LEAD && hopY === 0 };
  const danger = Math.abs(next.tx - px) < BODY_R + BALL_R.lob + 0.12;
  return { moveX: danger ? toward(dodgeX(next.tx, center, half)) : 0, jump: false };
}
