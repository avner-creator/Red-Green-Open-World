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
  /**
   * The planned way may end this far short of a destination that stands on something solid (m):
   * the trampoline's mat edge is 4.4 m inside its kerb rings (which the hero steps up, but a
   * straight body sweep does not).
   */
  reach: 6,
  /** Follower watchdog: pushing without getting anywhere this long (s) = Pip leads on from the hero. */
  heroStuckSeconds: 2,
  /** The hero moved / got closer by less than this (m) = no progress. */
  heroMove: 0.5,
  /** The hero is this close to Pip (m): following fine (the follower stops ~2.5 m behind). */
  closeFollow: 3.2,
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
export interface PlanOpts {
  /**
   * The way may stop this far short of `dest` (m; on the straight line to it): a destination on or
   * next to a solid thing (the trampoline's mat edge, a counter) is never "clear" itself. The path
   * then ends [approach point, dest]; the last leg is Pip's to run, not the hero's.
   */
  reach?: number;
  /**
   * Edges out of `from` use this (looser) check: the hero may stand closer to a wall than the
   * planning margin, and must still be able to walk away from it.
   */
  clearStart?: (a: V2, b: V2) => boolean;
  /**
   * The last leg into `dest` may use this (looser) check: a place's spot may stand closer to its
   * counter or shed than the planning margin (it was validated with the hero's bare body).
   */
  clearEnd?: (a: V2, b: V2) => boolean;
}

/** The point `reach` metres short of `dest` on the line from `p` (or `dest` itself when that close). */
function approach(p: V2, dest: V2, reach: number): V2 {
  const d = dist(p, dest);
  if (reach <= 0 || d <= reach) return reach > 0 ? { x: p.x, z: p.z } : { x: dest.x, z: dest.z };
  return toward(p, dest, d - reach);
}

/** Cells the search goes on for an exact way in after finding a stop-short one. */
const FALLBACK_EXPAND = 150;

export function planPath(from: V2, dest: V2, clear: (a: V2, b: V2) => boolean, step = 2.5, maxExpand = 900, opts: PlanOpts = {}): V2[] | null {
  const reach = opts.reach ?? 0;
  const startClear = opts.clearStart ?? clear;
  /**
   * `p` (a grid point, or `from`) sees the destination: straight to it (exact), or, right by the
   * place, to `reach` short of it (a fallback: the search goes on a little for an exact way in).
   */
  const sees = (p: V2, start: boolean): { pt: V2; exact: boolean } | null => {
    const c = start ? startClear : clear;
    if (c(p, dest) || opts.clearEnd?.(p, dest)) return { pt: { x: dest.x, z: dest.z }, exact: true };
    if (reach > 0 && dist(p, dest) <= reach + step) {
      const a = approach(p, dest, reach);
      if (dist(a, p) < 0.05 || c(p, a)) return { pt: a, exact: false };
    }
    return null;
  };
  const tail = (p: V2, seen: V2): V2[] => (dist(seen, dest) < 1e-6 || dist(seen, p) < 0.05 ? [] : [seen]);
  interface Node { i: number; j: number; g: number; f: number; parent: Node | null }
  const root: Node = { i: 0, j: 0, g: 0, f: dist(from, dest), parent: null };
  const seen0 = sees(from, true);
  if (seen0?.exact) return [{ x: dest.x, z: dest.z }];
  let end: Node | null = null;
  let endSeen: V2 | null = null;
  /** A stop-short way, kept while the search looks on (FALLBACK_EXPAND more cells) for an exact one. */
  let fallback: { n: Node; pt: V2; at: number } | null = seen0 ? { n: root, pt: seen0.pt, at: 0 } : null;
  const key = (i: number, j: number): string => `${i},${j}`;
  const at = (i: number, j: number): V2 => ({ x: from.x + i * step, z: from.z + j * step });
  const h = (p: V2): number => dist(p, dest);
  const open: Node[] = [root];
  const best = new Map<string, number>([[key(0, 0), 0]]);
  const closed = new Set<string>();
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]] as const;
  let expanded = 0;
  while (open.length && expanded < maxExpand && !(fallback && expanded - fallback.at > FALLBACK_EXPAND)) {
    let bi = 0;
    for (let k = 1; k < open.length; k++) if (open[k].f < open[bi].f) bi = k;
    const n = open.splice(bi, 1)[0];
    const nk = key(n.i, n.j);
    if (closed.has(nk)) continue;
    closed.add(nk);
    expanded++;
    const p = at(n.i, n.j);
    const start = !n.parent;
    if (!start && dist(p, dest) < step * 4 + reach) {
      const s = sees(p, false);
      if (s?.exact) {
        end = n;
        endSeen = s.pt;
        break;
      }
      if (s && !fallback) fallback = { n, pt: s.pt, at: expanded };
    }
    for (const [di, dj] of dirs) {
      const i = n.i + di;
      const j = n.j + dj;
      const k = key(i, j);
      if (closed.has(k)) continue;
      const q = at(i, j);
      const g = n.g + step * Math.hypot(di, dj);
      if (g >= (best.get(k) ?? Infinity)) continue;
      if (!(start ? startClear : clear)(p, q)) continue;
      best.set(k, g);
      open.push({ i, j, g, f: g + h(q), parent: n });
    }
  }
  if (!end && fallback) {
    end = fallback.n;
    endSeen = fallback.pt;
  }
  if (!end || !endSeen) return null;
  const endP = at(end.i, end.j);
  const pts: V2[] = [...tail(endP, endSeen), { x: dest.x, z: dest.z }];
  for (let n: Node | null = end; n && n.parent; n = n.parent) pts.unshift(at(n.i, n.j));
  const lastIdx = pts.length - 1;
  // Shortcuts: from each point, jump to the farthest later point that is in clear sight.
  const out: V2[] = [];
  let cur = from;
  let i = 0;
  while (i < pts.length) {
    const c = cur === from ? startClear : clear;
    let j = lastIdx;
    // The destination itself (on a solid thing) is only ever reached from its approach point.
    if (pts.length > 1 && endSeen && dist(endSeen, dest) > 1e-6 && j > i) j--;
    while (j > i && !c(cur, pts[j])) j--;
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
  /** A coarse way over the terrain (round a cliff, QA7 m14) to follow instead of a local plan. */
  private via: V2[] | null = null;

  /**
   * `walkable(from, to)`: a hop from `from` to `to` ends on land and nothing blocks it (a wall right
   * at the end is fine). `clear(from, to)` (optional): strictly nothing in between, used to plan a
   * way round fences (`planPath`); without it Pip goes straight with small detours.
   */
  /** Follower watchdog: where the hero was (and how far from Pip) when the current stretch began. */
  private heroRef: V2 | null = null;
  private heroRefD = 0;
  private heroStuckT = 0;
  /** Times Pip came back to lead a stuck follower from where they stand (debug / tests). */
  rejoins = 0;

  /**
   * `walkable(from, to)`: a hop from `from` to `to` ends on land and nothing blocks it (a wall right
   * at the end is fine). `clear(from, to)` (optional): strictly nothing in between, with a margin
   * round the hero's body, used to plan a way round fences (`planPath`); without it Pip goes
   * straight with small detours. `follow(hero, spot)` (optional): a child walking in a straight
   * line from `hero` to `spot` gets there (the hero's body swept along it). Pip only runs on to a
   * spot the hero can follow him to. `loose`: the planner's check (no margin) for the first leg (the
   * hero may stand closer to a wall than the margin) and the last one (into the place).
   */
  constructor(
    private readonly walkable: (from: V2, to: V2) => boolean = () => true,
    private readonly clear: ((from: V2, to: V2) => boolean) | null = null,
    private readonly follow: ((hero: V2, spot: V2) => boolean) | null = null,
    private readonly loose: ((from: V2, to: V2) => boolean) | null = null,
  ) {}

  /** The planned way, if any (debug / tests). */
  get route(): readonly V2[] | null {
    return this.path;
  }

  /** Plan the way from `from` (the hero, or Pip after a stall). */
  private plan(from: V2, dest: V2): void {
    this.pathIdx = 0;
    const via = this.via;
    if (via?.length) {
      // Along the terrain route from its point nearest to `from` (a cliff in the straight way).
      let k = 0;
      for (let i = 1; i < via.length; i++) if (dist(from, via[i]) < dist(from, via[k])) k = i;
      if (dist(from, via[k]) < LEAD.hop * 0.5 && k < via.length) k++;
      this.path = [...via.slice(k), { x: dest.x, z: dest.z }];
      return;
    }
    this.path = this.clear
      ? planPath(from, dest, this.clear, 2.5, 900, { reach: LEAD.reach, clearStart: this.loose ?? undefined, clearEnd: this.loose ?? undefined })
      : null;
  }

  /**
   * The next hop spot from Pip's spot that the hero can follow him to in a straight line (QA m1:
   * a child 2–6 m behind walks straight at Pip and cuts the corner). Shorter hops along the same
   * leg when the full one is not followable; null when even a short one is not (keep waiting:
   * the hero comes closer).
   */
  private nextSpot(from: V2, hero: V2, dest: V2): V2 | null {
    const s = this.hopFrom(from, dest);
    // The last few metres (onto a mat, up to a counter) are the place itself: straight in.
    if (!this.follow || dist(from, dest) <= LEAD.reach + 0.5 || this.follow(hero, s)) return s;
    const d = dist(from, s);
    for (const k of [0.6, 0.35, 0.15]) {
      const p = toward(from, s, d * k);
      if (this.follow(hero, p)) return p;
    }
    return null;
  }

  /**
   * Lead on from where the hero stands (a stuck follower, or a corner the hero cannot see round):
   * plan afresh from the hero, and Pip comes back to the first spot of that way, in a clear
   * straight line from the hero.
   */
  private rejoin(hero: V2, dest: V2, why: string): void {
    this.plan(hero, dest);
    this.spot = this.path ? this.hopFrom(hero, dest) : this.straightHop(hero, dest);
    if (this.follow && !this.follow(hero, this.spot)) {
      const d = dist(hero, this.spot);
      for (const k of [0.6, 0.35]) {
        const p = toward(hero, this.spot, d * k);
        if (this.follow(hero, p)) {
          this.spot = p;
          break;
        }
      }
    }
    this.waiting = false;
    this.rejoins++;
    this.why = why;
    this.heroRef = null;
    this.heroStuckT = 0;
    this.bestD = Infinity;
    this.noProgT = 0;
  }

  /**
   * Follower watchdog: the hero pushes the stick but gets no closer (to Pip while he waits, or
   * anywhere while he runs) for LEAD.heroStuckSeconds: Pip comes back and leads from the hero.
   */
  private watchHero(dt: number, pip: V2, hero: V2, dest: V2, pushing: boolean | undefined): void {
    const d = dist(pip, hero);
    if (!this.heroRef || !pushing || d < LEAD.closeFollow) {
      this.heroRef = { x: hero.x, z: hero.z };
      this.heroRefD = d;
      this.heroStuckT = 0;
      return;
    }
    const moved = dist(hero, this.heroRef) > LEAD.heroMove;
    if (moved && (!this.waiting || d < this.heroRefD - LEAD.heroMove)) {
      this.heroRef = { x: hero.x, z: hero.z };
      this.heroRefD = d;
      this.heroStuckT = 0;
      return;
    }
    this.heroStuckT += dt;
    if (this.heroStuckT > LEAD.heroStuckSeconds) {
      this.rejoin(hero, dest, `follower stuck at (${hero.x.toFixed(1)}, ${hero.z.toFixed(1)}): leading on from there`);
    }
  }

  /** Metres left to go from `p`: along the planned way, else straight. */
  private left(p: V2, dest: V2): number {
    const path = this.path;
    if (!path) return dist(p, dest);
    let d = dist(p, path[this.pathIdx]);
    for (let i = this.pathIdx; i < path.length - 1; i++) d += dist(path[i], path[i + 1]);
    return d;
  }

  /**
   * Lead to `dest` (null = stop leading). `fetchFirst`: run to the hero before leading. `via`: corner
   * points of a terrain route to follow (when the straight way crosses a cliff).
   */
  set(dest: V2 | null, arriveRadius = 6, fetchFirst = false, via: readonly V2[] | null = null): void {
    this.dest = dest ? { x: dest.x, z: dest.z } : null;
    this.via = dest && via?.length ? via.map((p) => ({ x: p.x, z: p.z })) : null;
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
    this.heroRef = null;
    this.heroStuckT = 0;
    this.rejoins = 0;
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

  /** `pushing`: the player holds the stick (feeds the follower watchdog; unknown = off). */
  update(dt: number, pip: V2, hero: V2, pushing?: boolean): LeadOut | null {
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
        // The hero caught up: next hop, one the hero can walk straight to (else wait for them to
        // come closer; right beside Pip and still no clear line: lead on from the hero).
        const next = this.nextSpot(this.spot, hero, dest);
        if (next) {
          this.spot = next;
          this.waiting = false;
          started = false;
        } else if (dist(pip, hero) < LEAD.closeFollow) {
          this.rejoin(hero, dest, 'no clear line from the hero to the next hop: leading on from the hero');
          started = false;
        }
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
    this.watchHero(dt, pip, hero, dest, pushing);
    return { target: this.spot!, state: this.waiting ? 'wait' : 'run', startedWaiting: started };
  }
}
