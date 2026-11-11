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
  /** Watchdog: "run" without moving this long (s) = re-plan the hop. */
  stallSeconds: 4,
  /** Pip moved less than this (m) = not moving. */
  stallMove: 0.5,
  /** Running this long (s) without getting 1 m closer to the destination = give up on it. */
  giveUpSeconds: 10,
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

/**
 * A walkable way from `from` to `dest` round fences and walls (A* on a `step`-metre grid; an edge
 * counts when `clear(a, b)`; then shortcuts wherever a straight run is clear). Returns the corner
 * points ending at `dest`, or null when nothing was found within `maxExpand` cells (the caller then
 * goes straight). Pure: `clear` does the physics. QA round 5: Pip led over rail fences that the
 * hero could not cross, because every straight hop was blocked and he went through anyway.
 */
export function planPath(from: V2, dest: V2, clear: (a: V2, b: V2) => boolean, step = 2.5, maxExpand = 900): V2[] | null {
  if (clear(from, dest)) return [{ x: dest.x, z: dest.z }];
  const key = (i: number, j: number): string => `${i},${j}`;
  const at = (i: number, j: number): V2 => ({ x: from.x + i * step, z: from.z + j * step });
  const h = (p: V2): number => dist(p, dest);
  interface Node { i: number; j: number; g: number; f: number; parent: Node | null }
  const open: Node[] = [{ i: 0, j: 0, g: 0, f: h(from), parent: null }];
  const best = new Map<string, number>([[key(0, 0), 0]]);
  const closed = new Set<string>();
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]] as const;
  let expanded = 0;
  let end: Node | null = null;
  while (open.length && expanded < maxExpand) {
    let bi = 0;
    for (let k = 1; k < open.length; k++) if (open[k].f < open[bi].f) bi = k;
    const n = open.splice(bi, 1)[0];
    const nk = key(n.i, n.j);
    if (closed.has(nk)) continue;
    closed.add(nk);
    expanded++;
    const p = at(n.i, n.j);
    if (dist(p, dest) < step * 4 && clear(p, dest)) {
      end = n;
      break;
    }
    for (const [di, dj] of dirs) {
      const i = n.i + di;
      const j = n.j + dj;
      const k = key(i, j);
      if (closed.has(k)) continue;
      const q = at(i, j);
      const g = n.g + step * Math.hypot(di, dj);
      if (g >= (best.get(k) ?? Infinity)) continue;
      if (!clear(p, q)) continue;
      best.set(k, g);
      open.push({ i, j, g, f: g + h(q), parent: n });
    }
  }
  if (!end) return null;
  const pts: V2[] = [{ x: dest.x, z: dest.z }];
  for (let n: Node | null = end; n && n.parent; n = n.parent) pts.unshift(at(n.i, n.j));
  // Shortcuts: from each point, jump to the farthest later point that is in clear sight.
  const out: V2[] = [];
  let cur = from;
  let i = 0;
  while (i < pts.length) {
    let j = pts.length - 1;
    while (j > i && !clear(cur, pts[j])) j--;
    out.push(pts[j]);
    cur = pts[j];
    i = j + 1;
  }
  return out;
}

export class Leader {
  dest: V2 | null = null;
  /** Hero within this radius of `dest` = arrived. */
  arriveRadius = 6;
  private spot: V2 | null = null;
  private waitT = 0;
  private waiting = false;
  private fetching = false;
  /** Watchdog: where Pip was when the current "not moving" stretch began, and for how long. */
  private stallFrom: V2 | null = null;
  private stallT = 0;
  /** Closest Pip got to the destination, and seconds of running since he last got closer. */
  private bestD = Infinity;
  private noProgT = 0;
  /** Re-plans since `set` (rotates the detour order so a re-plan tries another way). */
  replans = 0;
  /** The destination cannot be reached (no progress for LEAD.giveUpSeconds): pick another. */
  gaveUp = false;
  /** Why the last re-plan / give-up happened (debug, `__rgBuddy.lead().why`). */
  why: string | null = null;

  /** The planned way (corner points) and the next corner Pip heads for. */
  private path: V2[] | null = null;
  private pathIdx = 0;

  /**
   * `walkable(from, to)`: a hop from `from` to `to` ends on land and nothing blocks it (a wall right
   * at the end is fine). `clear(from, to)` (optional): strictly nothing in between, used to plan a
   * way round fences (`planPath`); without it Pip goes straight with small detours.
   */
  constructor(
    private readonly walkable: (from: V2, to: V2) => boolean = () => true,
    private readonly clear: ((from: V2, to: V2) => boolean) | null = null,
  ) {}

  /** The planned way, if any (debug / tests). */
  get route(): readonly V2[] | null {
    return this.path;
  }

  /** Plan the way from `from` (the hero, or Pip after a stall). */
  private plan(from: V2, dest: V2): void {
    this.path = this.clear ? planPath(from, dest, this.clear) : null;
    this.pathIdx = 0;
  }

  /** Metres left to go from `p`: along the planned way, else straight. */
  private left(p: V2, dest: V2): number {
    const path = this.path;
    if (!path) return dist(p, dest);
    let d = dist(p, path[this.pathIdx]);
    for (let i = this.pathIdx; i < path.length - 1; i++) d += dist(path[i], path[i + 1]);
    return d;
  }

  /** Lead to `dest` (null = stop leading). `fetchFirst`: run to the hero before leading. */
  set(dest: V2 | null, arriveRadius = 6, fetchFirst = false): void {
    this.dest = dest ? { x: dest.x, z: dest.z } : null;
    this.arriveRadius = arriveRadius;
    this.spot = null;
    this.waiting = false;
    this.waitT = 0;
    this.fetching = fetchFirst;
    this.stallFrom = null;
    this.stallT = 0;
    this.bestD = Infinity;
    this.noProgT = 0;
    this.replans = 0;
    this.gaveUp = false;
    this.why = null;
    this.path = null;
    this.pathIdx = 0;
  }

  get active(): boolean {
    return this.dest !== null;
  }

  /** The next hop spot: along the planned way when there is one, else straight with detours. */
  private hopFrom(from: V2, dest: V2, avoid: V2 | null = null): V2 {
    const path = this.path;
    if (path) {
      while (this.pathIdx < path.length - 1 && dist(from, path[this.pathIdx]) < LEAD.atSpot + 0.5) this.pathIdx++;
      return toward(from, path[this.pathIdx], LEAD.hop);
    }
    return this.straightHop(from, dest, avoid);
  }

  /** A walkable hop spot from `from` towards the destination (tries small detours first). */
  private straightHop(from: V2, dest: V2, avoid: V2 | null = null): V2 {
    const base = Math.atan2(dest.x - from.x, dest.z - from.z);
    const d = Math.min(LEAD.hop, dist(from, dest));
    const offs = [0, 0.45, -0.45, 0.9, -0.9, 1.4, -1.4, 2, -2];
    // A re-plan starts further round the list (the straight way was just tried).
    const k = this.replans % offs.length;
    for (const off of [...offs.slice(k), ...offs.slice(0, k)]) {
      const a = base + off;
      const p = { x: from.x + Math.sin(a) * d, z: from.z + Math.cos(a) * d };
      if (avoid && dist(p, avoid) < 1.5) continue;
      if (this.walkable(from, p)) return p;
    }
    return toward(from, dest, d);
  }

  /**
   * Watchdog (B1, QA round 5): Pip must never "run" in place. No movement for
   * LEAD.stallSeconds = a new hop spot from where he is; no progress towards the destination for
   * LEAD.giveUpSeconds of running = `gaveUp` (the caller picks the next-nearest place).
   */
  private watch(dt: number, pip: V2, dest: V2): void {
    if (!this.stallFrom || dist(pip, this.stallFrom) > LEAD.stallMove) {
      this.stallFrom = { x: pip.x, z: pip.z };
      this.stallT = 0;
    } else this.stallT += dt;
    const d = this.left(pip, dest);
    if (d < this.bestD - 1) {
      this.bestD = d;
      this.noProgT = 0;
    } else this.noProgT += dt;
    if (this.noProgT > LEAD.giveUpSeconds && !this.gaveUp) {
      this.gaveUp = true;
      this.why = `unreachable: no progress for ${LEAD.giveUpSeconds} s (${d.toFixed(1)} m left)`;
    }
    if (this.stallT > LEAD.stallSeconds) {
      this.replans++;
      this.why = `stalled: no movement for ${LEAD.stallSeconds} s at (${pip.x.toFixed(1)}, ${pip.z.toFixed(1)})`;
      const old = this.spot;
      this.plan(pip, dest);
      this.spot = this.path ? this.hopFrom(pip, dest) : this.straightHop(pip, dest, old);
      this.stallT = 0;
      this.stallFrom = { x: pip.x, z: pip.z };
    }
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
        // Leading starts again from the hero: progress is measured afresh.
        this.bestD = Infinity;
        this.noProgT = 0;
      } else return { target: toward(hero, pip, 1.4), state: 'fetch', startedWaiting: false };
    }
    if (!this.spot) {
      // First hop: ahead of the hero (Pip may be anywhere near them), along a way the hero can walk.
      this.plan(hero, dest);
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
    if (this.waiting) {
      this.stallFrom = null;
      this.stallT = 0;
    } else this.watch(dt, pip, dest);
    return { target: this.spot, state: this.waiting ? 'wait' : 'run', startedWaiting: started };
  }
}
