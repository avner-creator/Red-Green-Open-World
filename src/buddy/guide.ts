/**
 * Pip leads the way (pure maths, no three.js): he runs a few metres ahead towards a destination,
 * stops, looks back and waits until the hero is close, then runs on. If the hero does not come,
 * he runs back to fetch them and starts again from there.
 *
 * RULE: destinations are both-eye places only (attraction anchors, sites). Never pass the
 * position of a weak-eye or strong-eye object (gem, key, lock symbol, mini-game layer object):
 * `tests/buddy/guide.test.ts` checks the director never does.
 */
import type { V2 } from './steer';

export const LEAD = {
  /** Metres per hop ahead. */
  hop: 7,
  /** Pip runs on once the hero is this close to him (m). */
  waitFor: 6,
  /** At his hop spot = this close (m). */
  atSpot: 1,
  /** Seconds waiting with the hero far away before he runs back to fetch them. */
  fetchAfter: 5,
  /** Fetching is over when Pip is this close to the hero (m). */
  fetched: 2.6,
} as const;

export type LeadState = 'run' | 'wait' | 'fetch' | 'arrived';

export interface LeadOut {
  target: V2;
  state: LeadState;
  /** True on the frame Pip starts waiting (look back + bark). */
  startedWaiting: boolean;
}

const dist = (a: V2, b: V2): number => Math.hypot(a.x - b.x, a.z - b.z);

function toward(from: V2, to: V2, d: number): V2 {
  const l = dist(from, to);
  if (l < 1e-6) return { x: to.x, z: to.z };
  const k = Math.min(d, l) / l;
  return { x: from.x + (to.x - from.x) * k, z: from.z + (to.z - from.z) * k };
}

export class Leader {
  dest: V2 | null = null;
  /** Hero within this radius of `dest` = arrived. */
  arriveRadius = 6;
  private spot: V2 | null = null;
  private waitT = 0;
  private waiting = false;
  private fetching = false;

  /** `walkable(from, to)`: the straight run from `from` to `to` is on land and not blocked. */
  constructor(private readonly walkable: (from: V2, to: V2) => boolean = () => true) {}

  /** Lead to `dest` (null = stop leading). `fetchFirst`: run to the hero before leading. */
  set(dest: V2 | null, arriveRadius = 6, fetchFirst = false): void {
    this.dest = dest ? { x: dest.x, z: dest.z } : null;
    this.arriveRadius = arriveRadius;
    this.spot = null;
    this.waiting = false;
    this.waitT = 0;
    this.fetching = fetchFirst;
  }

  get active(): boolean {
    return this.dest !== null;
  }

  /** A walkable hop spot from `from` towards the destination (tries small detours first). */
  private hopFrom(from: V2, dest: V2): V2 {
    const base = Math.atan2(dest.x - from.x, dest.z - from.z);
    const d = Math.min(LEAD.hop, dist(from, dest));
    for (const off of [0, 0.45, -0.45, 0.9, -0.9, 1.4, -1.4]) {
      const a = base + off;
      const p = { x: from.x + Math.sin(a) * d, z: from.z + Math.cos(a) * d };
      if (this.walkable(from, p)) return p;
    }
    return toward(from, dest, d);
  }

  update(dt: number, pip: V2, hero: V2): LeadOut | null {
    const dest = this.dest;
    if (!dest) return null;
    if (dist(hero, dest) < this.arriveRadius) {
      this.waiting = false;
      return { target: toward(dest, pip, Math.min(this.arriveRadius * 0.6, 3)), state: 'arrived', startedWaiting: false };
    }
    if (this.fetching) {
      if (dist(pip, hero) < LEAD.fetched) {
        this.fetching = false;
        this.spot = null;
      } else return { target: toward(hero, pip, 1.4), state: 'fetch', startedWaiting: false };
    }
    if (!this.spot) {
      // First hop: ahead of the hero (Pip may be anywhere near them).
      this.spot = this.hopFrom(hero, dest);
      this.waiting = false;
    }
    let started = false;
    if (dist(pip, this.spot) < LEAD.atSpot) {
      if (!this.waiting) {
        this.waiting = true;
        this.waitT = 0;
        started = true;
      }
      this.waitT += dt;
      if (dist(pip, hero) < LEAD.waitFor || dist(hero, dest) < dist(pip, dest)) {
        // The hero caught up: next hop.
        this.spot = this.hopFrom(this.spot, dest);
        this.waiting = false;
        started = false;
      } else if (this.waitT > LEAD.fetchAfter) {
        this.fetching = true;
        this.waiting = false;
        return { target: toward(hero, pip, 1.4), state: 'fetch', startedWaiting: false };
      }
    }
    return { target: this.spot, state: this.waiting ? 'wait' : 'run', startedWaiting: started };
  }
}
