/**
 * A coarse walkable way over the island's TERRAIN (pure maths, no three.js, no physics): A* on a
 * grid, where a step counts only when every metre of it is on land and no steeper than a child can
 * walk. QA7 m14: the dragon roost stands on a 30 m plateau that is reachable only over the land
 * bridge in the east; Pip's local planner (fences, walls) went straight north and stopped at the
 * cliff foot. Used (1) by the start-of-play check of every lead destination ("walkable from the
 * plaza", not only "a clear spot") and (2) as the way Pip leads when the straight line crosses a
 * cliff. Buildings and fences are the local planner's job (`planPath`).
 */
import type { V2 } from './steer';

export interface TerrainProbe {
  heightAt(x: number, z: number): number;
  isLand(x: number, z: number): boolean;
  waterLevel: number;
}

export const ROUTE = {
  /** Grid cell (m). */
  cell: 4,
  /** Largest rise or drop per metre walked (m): ~40°, under the hero's 50° climb limit. */
  maxRise: 0.85,
  /** Search budget (cells). The island is ~330 m across: ~6800 cells. */
  maxExpand: 9000,
  /** Land this far above the water only (m): no wading along the shore. */
  dry: 0.2,
} as const;

const dist = (a: V2, b: V2): number => Math.hypot(a.x - b.x, a.z - b.z);

/** Every metre from a to b is dry land and never steeper than ROUTE.maxRise. */
export function terrainClear(a: V2, b: V2, t: TerrainProbe): boolean {
  const d = dist(a, b);
  const n = Math.max(1, Math.ceil(d));
  let prev = t.heightAt(a.x, a.z);
  for (let i = 1; i <= n; i++) {
    const k = i / n;
    const x = a.x + (b.x - a.x) * k;
    const z = a.z + (b.z - a.z) * k;
    if (!t.isLand(x, z)) return false;
    const h = t.heightAt(x, z);
    if (h < t.waterLevel + ROUTE.dry) return false;
    if (Math.abs(h - prev) > ROUTE.maxRise * (d / n) + 0.05) return false;
    prev = h;
  }
  return true;
}

/** Binary min-heap of grid nodes by f. */
class Heap {
  private a: { k: number; f: number }[] = [];
  get size(): number {
    return this.a.length;
  }
  push(k: number, f: number): void {
    const a = this.a;
    a.push({ k, f });
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (a[p].f <= a[i].f) break;
      [a[p], a[i]] = [a[i], a[p]];
      i = p;
    }
  }
  pop(): number {
    const a = this.a;
    const top = a[0].k;
    const last = a.pop()!;
    if (a.length) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let m = i;
        if (l < a.length && a[l].f < a[m].f) m = l;
        if (r < a.length && a[r].f < a[m].f) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i], a[m]];
        i = m;
      }
    }
    return top;
  }
}

/**
 * The way from `from` to `to` over walkable terrain: corner points ending at `to` (straight runs
 * merged), or null when there is none within the search budget. `[to]` when the straight line is fine.
 */
export function terrainRoute(from: V2, to: V2, t: TerrainProbe, cell: number = ROUTE.cell): V2[] | null {
  if (terrainClear(from, to, t)) return [{ x: to.x, z: to.z }];
  const R = 1 << 12; // grid index range per axis (key packing)
  const key = (i: number, j: number): number => (i + R / 2) * R + (j + R / 2);
  const at = (i: number, j: number): V2 => ({ x: from.x + i * cell, z: from.z + j * cell });
  const g = new Map<number, number>([[key(0, 0), 0]]);
  const parent = new Map<number, number>();
  const ij = new Map<number, [number, number]>([[key(0, 0), [0, 0]]]);
  const closed = new Set<number>();
  const open = new Heap();
  open.push(key(0, 0), dist(from, to));
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]] as const;
  let end: number | null = null;
  let expanded = 0;
  while (open.size && expanded < ROUTE.maxExpand) {
    const k = open.pop();
    if (closed.has(k)) continue;
    closed.add(k);
    expanded++;
    const [i, j] = ij.get(k)!;
    const p = at(i, j);
    if (dist(p, to) < cell * 1.6 && terrainClear(p, to, t)) {
      end = k;
      break;
    }
    const gk = g.get(k)!;
    for (const [di, dj] of dirs) {
      const ni = i + di;
      const nj = j + dj;
      const nk = key(ni, nj);
      if (closed.has(nk)) continue;
      const step = cell * Math.hypot(di, dj);
      const ng = gk + step;
      if (ng >= (g.get(nk) ?? Infinity)) continue;
      const q = at(ni, nj);
      if (!terrainClear(p, q, t)) continue;
      g.set(nk, ng);
      parent.set(nk, k);
      ij.set(nk, [ni, nj]);
      open.push(nk, ng + dist(q, to));
    }
  }
  if (end === null) return null;
  const pts: V2[] = [{ x: to.x, z: to.z }];
  for (let k: number | undefined = end; k !== undefined && k !== key(0, 0); k = parent.get(k)) {
    const [i, j] = ij.get(k)!;
    pts.unshift(at(i, j));
  }
  // Straight runs: from each point, jump to the farthest later point in clear walking sight.
  const out: V2[] = [];
  let cur = from;
  let n = 0;
  while (n < pts.length) {
    let m = pts.length - 1;
    while (m > n && !terrainClear(cur, pts[m], t)) m--;
    out.push(pts[m]);
    cur = pts[m];
    n = m + 1;
  }
  return out;
}

/** Metres along a route from `from`. */
export function routeLength(from: V2, route: readonly V2[]): number {
  let d = 0;
  let cur = from;
  for (const p of route) {
    d += dist(cur, p);
    cur = p;
  }
  return d;
}
