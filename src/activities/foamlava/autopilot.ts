/**
 * A simple bot that plays the course through the same SimInput a kid gives (unit tests, the e2e
 * test hook and medal-time calibration). It walks waypoint to waypoint, jumps where told, and
 * waits for the foam cannons' rhythm.
 */
import { CANNONS } from './layout';
import { cannonState } from './sim';
import type { CourseSim, SimInput } from './sim';

export interface Waypoint {
  x: number;
  z: number;
  /** Press jump when this waypoint is reached. */
  jump?: boolean;
  /** Before leaving this waypoint, wait until the first cannon has just puffed. */
  waitCannon?: boolean;
  /** Reach radius (default 0.35). */
  r?: number;
}

const W = (x: number, z: number, extra: Partial<Waypoint> = {}): Waypoint => ({ x, z, ...extra });

/** The main route (no secret tiles, takes the rope swing). */
export const MAIN_PLAN: readonly Waypoint[] = [
  W(3.4, 3.9), W(4.2, 6.3), W(2.6, 8.4), W(4.1, 10.6),
  W(3.5, 13.0), W(2.6, 14.9), W(3.6, 16.5), W(2.8, 18.0), W(3.3, 20.8),
  W(2.7, 23.4), W(3.9, 24.5), W(2.7, 25.6), W(3.9, 26.7), W(3.3, 27.9),
  W(3.3, 35.95), W(3.3, 39.0), W(1.9, 40.3, { r: 0.6 }),
  W(-3.8, 40.2, { r: 0.6 }), W(-3.8, 37.0),
  W(-3.8, 25.6, { r: 0.8 }), W(-3.8, 22.5, { waitCannon: true }), W(-3.8, 7.6), W(-3.8, 5.9), W(-3.6, 0.3),
];

/** Same, but from checkpoint 3 along the weak-eye shortcut tiles. */
export const SHORTCUT_PLAN: readonly Waypoint[] = [
  ...MAIN_PLAN.slice(0, MAIN_PLAN.findIndex((w) => w.waitCannon)),
  W(-2.3, 23.0), W(-1.7, 22.0), W(-1.7, 3.2), W(-2.4, 0.3),
];

export class Autopilot {
  index = 0;
  private lap = 0;
  constructor(readonly plan: readonly Waypoint[]) {}

  /** Skip to the waypoint nearest to the hero (after a respawn). */
  resync(sim: CourseSim): void {
    let best = this.index;
    let bestD = Infinity;
    for (let i = 0; i < this.plan.length; i++) {
      const w = this.plan[i];
      const d = Math.hypot(w.x - sim.p.x, w.z - sim.p.z);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    this.index = best;
  }

  input(sim: CourseSim): SimInput {
    const out: SimInput = { mx: 0, mz: 0, sprint: false, jumpPressed: false };
    // A new lap (after the bubble express): start the plan again.
    if (sim.lap > this.lap) {
      this.lap = sim.lap;
      this.index = 0;
    }
    if (sim.mode === 'lift') return out;
    if (this.index >= this.plan.length) return out;
    let w = this.plan[this.index];
    const reach = w.r ?? 0.35;
    if (Math.hypot(w.x - sim.p.x, w.z - sim.p.z) < reach) {
      if (w.waitCannon) {
        const c = cannonState(sim.cannonClock(), CANNONS[0].offset);
        if (!(c.state === 'idle' && c.t < 0.04)) return out;
      }
      if (w.jump) out.jumpPressed = true;
      this.index++;
      if (this.index >= this.plan.length) return out;
      w = this.plan[this.index];
    }
    const dx = w.x - sim.p.x;
    const dz = w.z - sim.p.z;
    const d = Math.hypot(dx, dz);
    if (d > 1e-6) {
      out.mx = dx / d;
      out.mz = dz / d;
    }
    return out;
  }
}
