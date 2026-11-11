/**
 * Walk-over for the near (booth-side) puffy sideline (pure, unit-tested; QA6 m9). Outside a match,
 * a walker pushing into that inflatable wall from either side for a moment gets a comic boing
 * over it: a plain walk from the booth gets onto the pitch (before, only a jump did, or the one
 * walk-in gate), and a plain walk gets off again. The wall stays solid for the match ball.
 */
import { ARENA } from './arena';
import { PITCH } from './soccer';

export const HOP = {
  /** How far out from a wall face (m, body centre) a push counts. */
  band: 0.8,
  /** Seconds of pushing before the boing. */
  push: 0.15,
  /** Stick component toward the wall needed. */
  toward: 0.45,
  /** Take-off speeds (m/s): up, and across the wall. */
  vy: 9.2,
  vh: 3.4,
} as const;

/** Inner (pitch side) and outer face of the near sideline (pitch-local z). */
export const NEAR_WALL = { inner: -PITCH.hz, outer: -(PITCH.hz + 2 * ARENA.wallR) } as const;

/**
 * Which way to boing for a walker at pitch-local (x, z) pushing the stick along local `dir`:
 * +1 = onto the pitch (+z), −1 = off it, 0 = none. `gate`: the walk-in gap (no wall there).
 */
export function hopSide(x: number, z: number, dir: { x: number; z: number }, gate: { x0: number; x1: number }): -1 | 0 | 1 {
  if (Math.abs(x) > PITCH.hx - 0.2) return 0;
  if (x > gate.x0 - 0.2 && x < gate.x1 + 0.2) return 0;
  const l = Math.hypot(dir.x, dir.z);
  if (l < 0.3) return 0;
  const dz = dir.z / l;
  if (z <= NEAR_WALL.outer + 0.05 && z >= NEAR_WALL.outer - HOP.band && dz > HOP.toward) return 1;
  if (z >= NEAR_WALL.inner - 0.05 && z <= NEAR_WALL.inner + HOP.band && dz < -HOP.toward) return -1;
  return 0;
}

/** Push timer: returns the side once the same push has lasted `HOP.push` s. */
export class HopWatch {
  private t = 0;
  private side: -1 | 0 | 1 = 0;
  update(dt: number, side: -1 | 0 | 1): -1 | 0 | 1 {
    if (side === 0 || side !== this.side) {
      this.side = side;
      this.t = 0;
      return 0;
    }
    this.t += dt;
    if (this.t < HOP.push) return 0;
    this.t = 0;
    this.side = 0;
    return side;
  }
}
