/**
 * Bubble Ball kickabout (pure, no three.js): while no match is on, the giant ball lies on the pitch
 * as a real thing. A hero who walks onto the pitch shoves it along (never through it), a hero who
 * lands on top of it bounces off with a boing, and rolling it into a goal gives a little party.
 * The game also gives the ball a kinematic Rapier collider so the walk controller is blocked by it;
 * this module makes sure the ball moves out of the way first (a push, not a wall).
 * Pitch space as in `soccer.ts`; the walker's `y` is its feet above the deck top.
 */
import { collideWalls, integrate, makeBody } from './bodies';
import type { Body, Segment } from './bodies';
import { BALL, PITCH } from './soccer';
import type { Team } from './soccer';

export const KICKABOUT = {
  /** The walker's capsule radius (core PLAYER radius ≈ 0.35 + the controller's skin). */
  walkerR: 0.42,
  /** Contact slack: the ball starts moving this far before the capsule would touch it. */
  reach: 0.08,
  /** Ball speed = walker's speed into it × this (a light, big ball flies a bit faster). */
  kick: 1.35,
  /** Smallest shove (so even a slow nudge rolls it). */
  minKick: 1.4,
  /** Sprinting into it lofts it a little. */
  loft: 2.2,
  loftSpeed: 6,
  /** Landing on top: the walker's bounce speed. */
  topBounce: 7.5,
  /** After a goal the ball pops back to the centre spot after this long. */
  goalReset: 1.6,
  /** Physics sub-step (s). */
  sub: 1 / 120,
} as const;

export interface Kickabout {
  ball: Body;
  /** Seconds since a goal (−1 = none pending). */
  goalT: number;
  /** Visual squash spring of the ball. */
  squash: number;
  squashV: number;
}

export interface Walker {
  x: number;
  z: number;
  /** Feet height above the deck top. */
  y: number;
  vx: number;
  vz: number;
  vy?: number;
}

export interface KickResult {
  /** Move the walker by this to stay out of a ball that can't move (null = no correction). */
  block: { x: number; z: number } | null;
  /** The walker landed on top of the ball: bounce them up. */
  bounce: boolean;
  /** Ball speed given by a shove this step (0 = none). */
  kicked: number;
  /** Rolled into a goal this step (the +X goal is 'home's target). */
  goal: Team | null;
  /** Hardest wall hit this step (sound). */
  wall: number;
}

export function createKickabout(): Kickabout {
  return { ball: makeBody({ x: 0, z: 0, r: BALL.r, m: BALL.m, bounce: BALL.bounce, drag: BALL.drag, h: 2 * BALL.r }), goalT: -1, squash: 0, squashV: 0 };
}

export function resetKickabout(k: Kickabout, x = 0, z = 0): void {
  const b = k.ball;
  b.x = x;
  b.z = z;
  b.vx = b.vz = b.vy = b.y = 0;
  k.goalT = -1;
}

/** Is the walker's body at the ball's height (not jumping clean over it, not below the deck)? */
function sideOverlap(k: Kickabout, w: Walker): boolean {
  const b = k.ball;
  return w.y < b.y + 2 * b.r - 0.15 && w.y + 1.6 > b.y && w.y > -0.6;
}

export function stepKickabout(k: Kickabout, w: Walker, dt: number, walls: readonly Segment[], events: string[]): KickResult {
  const res: KickResult = { block: null, bounce: false, kicked: 0, goal: null, wall: 0 };
  const b = k.ball;
  k.squashV += (-120 * k.squash - 9 * k.squashV) * dt;
  k.squash += k.squashV * dt;
  if (k.goalT >= 0) {
    k.goalT += dt;
    if (k.goalT >= KICKABOUT.goalReset) {
      resetKickabout(k);
      k.squashV += 6;
      events.push('reset');
    }
  }
  const n = Math.max(1, Math.ceil(dt / KICKABOUT.sub - 1e-9));
  const h = dt / n;
  const min = KICKABOUT.walkerR + b.r;
  for (let s = 0; s < n; s++) {
    integrate(b, h);
    // Walker vs ball: the ball is shoved out of the way along the contact normal.
    if (sideOverlap(k, w)) {
      const dx = b.x - w.x;
      const dz = b.z - w.z;
      const d = Math.hypot(dx, dz);
      if (d < min + KICKABOUT.reach) {
        const nx = d > 1e-6 ? dx / d : 1;
        const nz = d > 1e-6 ? dz / d : 0;
        b.x = w.x + nx * (min + KICKABOUT.reach);
        b.z = w.z + nz * (min + KICKABOUT.reach);
        const into = w.vx * nx + w.vz * nz;
        const vn = b.vx * nx + b.vz * nz;
        const want = Math.max(KICKABOUT.minKick, into * KICKABOUT.kick);
        if (vn < want) {
          b.vx += (want - vn) * nx;
          b.vz += (want - vn) * nz;
          if (into > KICKABOUT.loftSpeed && b.y <= 0.02) b.vy = Math.max(b.vy, KICKABOUT.loft);
          if (want - vn > 1) {
            res.kicked = Math.max(res.kicked, want);
            k.squashV -= Math.min(6, (want - vn) * 0.8);
          }
        }
      }
    }
    res.wall = Math.max(res.wall, collideWalls(b, walls));
  }
  // A ball pinned on a wall can't get out of the way: hold the walker back instead.
  if (sideOverlap(k, w)) {
    const dx = w.x - b.x;
    const dz = w.z - b.z;
    const d = Math.hypot(dx, dz);
    if (d < min) {
      const nx = d > 1e-6 ? dx / d : -1;
      const nz = d > 1e-6 ? dz / d : 0;
      res.block = { x: nx * (min - d), z: nz * (min - d) };
    }
  }
  // Landing on top of the ball: boing.
  const top = b.y + 2 * b.r;
  if (Math.hypot(w.x - b.x, w.z - b.z) < b.r * 0.85 && w.y > top - 0.35 && w.y < top + 0.3 && (w.vy ?? 0) <= 0.5) {
    res.bounce = true;
    k.squashV -= 8;
    events.push('top');
  }
  if (res.kicked > 0) events.push('kick');
  // Goal: a little party, then the ball pops back to the centre spot.
  if (k.goalT < 0 && Math.abs(b.x) > PITCH.hx + 0.25 && Math.abs(b.z) < PITCH.goalHalf) {
    res.goal = b.x > 0 ? 'home' : 'away';
    k.goalT = 0;
    events.push('goal');
  }
  return res;
}
