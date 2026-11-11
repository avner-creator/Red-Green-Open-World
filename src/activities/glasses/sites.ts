/**
 * The six glasses-play sites: a FIXED table (`FIXED_SITES`), so the sites never move when the world
 * around them changes. Only `y` is read from the terrain at runtime.
 *
 * The numbers were chosen with the dev helper `searchSite` (a deterministic golden-angle spiral
 * that applies every rule below plus runtime probes for land, slope, colliders and the board's
 * view; reachable in test mode as `__rgGlasses.search`) and then frozen. `staticProblems` is the
 * pure part of the rules; the unit test runs it on every fixed site against `ANCHORS`, `ROADS` and
 * `RESERVED`, so an attraction placed on a site later makes that test fail with a clear message.
 *
 * Rules for a site (radius 6 m):
 *  - outside every anchor radius and anchor target (+ site radius + margin),
 *  - off every road: centreline ≥ half width + margin + site radius (margin 1.5 m; 4 m on the race
 *    lap roads east, loop and south),
 *  - centre ≥ 20 m from every reserved point, whole circle + 2 m outside every reserved footprint,
 *  - ≥ 14 m between site centres, ≥ 7 m from every gem and chest spot,
 *  - runtime: dry land, gentle slope, no collider, trunk or building inside, board in clear view.
 */
import type { RoadDef } from '../../world/layout';
import { GLASSES } from './constants';
import { RESERVED, RESERVED_POINT_CLEAR, reservedDistance } from './reserved';

export interface XZ {
  x: number;
  z: number;
}

/** The anchor fields the rules read (structurally compatible with `Anchor` and `AnchorDef`). */
export interface SiteAnchor {
  position: { x: number; y: number; z: number };
  radius: number;
  target?: { x: number; y: number; z: number };
  targetRadius?: number;
}

export type SiteRoad = Pick<RoadDef, 'width' | 'points'> & { id?: string };

export interface GlassesSite {
  id: string;
  index: number;
  /** Centre on the ground. */
  x: number;
  y: number;
  z: number;
  /** Facing the approach: local +Z of the site points towards where kids come from. */
  yaw: number;
  radius: number;
  /** What the site sits beside ('spawn' for the plaza ones; else an anchor name). */
  near: string;
  /** Where the pictogram board stands (on the approach edge of the site, facing `yaw`; see `BOARD_SLOTS`). */
  board: XZ;
}

export interface FixedSite {
  id: string;
  x: number;
  z: number;
  /** atan2 convention: local +Z = (sin yaw, cos yaw) points at the approach. */
  yaw: number;
  /** Index into `BOARD_SLOTS`. */
  slot: number;
  near: string;
  /** Extra clearance the mechanic needs beyond the site radius (glow-flies roam 9 m). */
  playRadius?: number;
}

/**
 * Board spots, site-local (x right, z towards the approach), as fractions of the radius:
 * front-left, front-right, front-centre.
 */
export const BOARD_SLOTS: readonly (readonly [number, number])[] = [
  [-0.5, 0.75],
  [0.5, 0.75],
  [0, 0.95],
];

/**
 * THE SITES. Order = registry order of the mechanics (./mechanics.ts). Frozen numbers: see the file
 * header for how they were chosen and checked.
 */
export const FIXED_SITES: readonly FixedSite[] = [
  { id: 'glowflies', x: -68.4, z: 19, yaw: 0.9, slot: 0, near: 'ranch', playRadius: 9 },
  { id: 'oddone', x: -36.5, z: 3, yaw: 0.46, slot: 0, near: 'spawn' },
  { id: 'lineup', x: 71.7, z: -89.5, yaw: -0.63, slot: 0, near: 'bungee' },
  { id: 'toys', x: -50, z: 13, yaw: 1.63, slot: 0, near: 'spawn' },
  { id: 'gates', x: 48, z: 104, yaw: -2.67, slot: 0, near: 'balloon' },
  { id: 'dotsigns', x: 64, z: 8, yaw: -1.56, slot: 1, near: 'launchPads' },
];

// ───────────────────────────── geometry helpers ─────────────────────────────

/** Distance from point p to segment ab in the XZ plane. */
export function segmentDistance(px: number, pz: number, ax: number, az: number, bx: number, bz: number): number {
  const dx = bx - ax;
  const dz = bz - az;
  const len2 = dx * dx + dz * dz;
  const t = len2 > 0 ? Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / len2)) : 0;
  return Math.hypot(px - (ax + dx * t), pz - (az + dz * t));
}

/** Distance from (x, z) to one road's edge (negative inside it). */
export function roadEdgeDistance(r: Pick<RoadDef, 'width' | 'points'>, x: number, z: number): number {
  let best = Infinity;
  for (let i = 1; i < r.points.length; i++) {
    const a = r.points[i - 1];
    const b = r.points[i];
    best = Math.min(best, segmentDistance(x, z, a[0], a[1], b[0], b[1]) - r.width / 2);
  }
  return best;
}

/** Distance from (x, z) to the nearest road edge (negative inside a road). */
export function roadClearance(roads: readonly Pick<RoadDef, 'width' | 'points'>[], x: number, z: number): number {
  let best = Infinity;
  for (const r of roads) best = Math.min(best, roadEdgeDistance(r, x, z));
  return best;
}

/** The race lap runs on these roads: sites keep a wider gap from them. */
export const RACE_ROADS: readonly string[] = ['east', 'loop', 'south'];
export const roadMargin = (id: string | undefined): number => (id && RACE_ROADS.includes(id) ? GLASSES.raceRoadMargin : GLASSES.roadMargin);

/** Facing yaw (atan2(dx, dz)) from `from` towards `to`. */
export const yawTowards = (from: XZ, to: XZ): number => Math.atan2(to.x - from.x, to.z - from.z);

/** Site-local (x right, z towards the approach) → world XZ. */
export function siteToWorld(site: Pick<GlassesSite, 'x' | 'z' | 'yaw'>, lx: number, lz: number): XZ {
  const c = Math.cos(site.yaw);
  const s = Math.sin(site.yaw);
  return { x: site.x + lx * c + lz * s, z: site.z - lx * s + lz * c };
}

/** Board position of a fixed site. */
export const boardOf = (s: FixedSite, radius: number = GLASSES.siteRadius): XZ =>
  siteToWorld(s, BOARD_SLOTS[s.slot][0] * radius, BOARD_SLOTS[s.slot][1] * radius);

// ───────────────────────────── the pure rules ─────────────────────────────

export interface StaticWorld {
  anchors: Readonly<Record<string, SiteAnchor>>;
  roads: readonly SiteRoad[];
  /** Island half size (sites stay `radius` + 20 m inside it). */
  half?: number;
  gemSpots?: readonly { position: XZ }[];
  chestSpots?: readonly { position: XZ }[];
}

/**
 * Every pure rule a site centre breaks, as readable messages ("anchor garage: 12.0 m < 16.0 m").
 * Empty = fine. `others` are the other site centres.
 */
export function staticProblems(w: StaticWorld, x: number, z: number, opts: { radius?: number; playRadius?: number; others?: readonly XZ[] } = {}): string[] {
  const R = opts.radius ?? GLASSES.siteRadius;
  const P = Math.max(R, opts.playRadius ?? R);
  const out: string[] = [];
  const f = (v: number): string => v.toFixed(1);
  for (const [name, a] of Object.entries(w.anchors)) {
    const need = a.radius + R + GLASSES.anchorMargin;
    const d = Math.hypot(x - a.position.x, z - a.position.z);
    if (d < need) out.push(`anchor ${name}: ${f(d)} m < ${f(need)} m`);
    if (a.target) {
      const needT = (a.targetRadius ?? 0) + R + GLASSES.anchorMargin;
      const dt = Math.hypot(x - a.target.x, z - a.target.z);
      if (dt < needT) out.push(`anchor ${name} target: ${f(dt)} m < ${f(needT)} m`);
    }
  }
  for (const r of w.roads) {
    const edge = roadEdgeDistance(r, x, z);
    const need = roadMargin(r.id) + P;
    if (edge < need) out.push(`road ${r.id ?? '?'}: edge ${f(edge)} m < ${f(need)} m`);
  }
  for (const r of RESERVED) {
    const d = Math.hypot(x - r.x, z - r.z);
    if (d < RESERVED_POINT_CLEAR) out.push(`reserved ${r.name}: centre ${f(d)} m < ${RESERVED_POINT_CLEAR} m`);
    const edge = reservedDistance(r, x, z);
    const need = P + GLASSES.reservedMargin;
    if (edge < need) out.push(`reserved ${r.name}: footprint ${f(edge)} m < ${f(need)} m`);
  }
  for (const o of opts.others ?? []) {
    const d = Math.hypot(x - o.x, z - o.z);
    if (d < GLASSES.siteSpacing) out.push(`site at (${f(o.x)}, ${f(o.z)}): ${f(d)} m < ${GLASSES.siteSpacing} m`);
  }
  const spots = [...(w.gemSpots ?? []), ...(w.chestSpots ?? [])];
  for (const s of spots) {
    const d = Math.hypot(x - s.position.x, z - s.position.z);
    if (d < R + GLASSES.spotClear) out.push(`spot (${f(s.position.x)}, ${f(s.position.z)}): ${f(d)} m < ${R + GLASSES.spotClear} m`);
  }
  if (w.half !== undefined && (Math.abs(x) > w.half - R - 20 || Math.abs(z) > w.half - R - 20)) out.push('too close to the island edge');
  return out;
}

// ───────────────────────────── dev helper: search ─────────────────────────────

export interface SiteWorld extends StaticWorld {
  heightAt(x: number, z: number): number;
  isLand(x: number, z: number): boolean;
  waterLevel: number;
  /** Runtime probe: true if something solid stands inside the circle (colliders, trunks, buildings). */
  blocked?(x: number, z: number, radius: number): boolean;
  /** Runtime probe: true if a board at `board` for a site at (x, z) facing `yaw` is in clear view from the approach. */
  view?(x: number, z: number, yaw: number, board: XZ): boolean;
}

/** Runtime rules (land, slope, colliders) on top of `staticProblems`; first failure or null. */
export function groundProblem(w: SiteWorld, x: number, z: number, R: number = GLASSES.siteRadius): string | null {
  if (!w.isLand(x, z)) return 'land';
  const h = w.heightAt(x, z);
  if (h < w.waterLevel + GLASSES.minAboveWater) return 'water';
  for (const rr of [R * 0.6, R + 1.5]) {
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      const sx = x + Math.cos(a) * rr;
      const sz = z + Math.sin(a) * rr;
      if (!w.isLand(sx, sz)) return 'land';
      const sh = w.heightAt(sx, sz);
      if (sh < w.waterLevel + GLASSES.minAboveWater) return 'water';
      if (Math.abs(sh - h) > GLASSES.maxRise * (rr / R)) return 'slope';
    }
  }
  if (w.blocked?.(x, z, R + 1.5)) return 'blocked';
  return null;
}

const GOLDEN = Math.PI * (3 - Math.sqrt(5));

/** Candidate `i` of the fixed spiral around (cx, cz): i = 0 is the point itself. */
export function spiralPoint(cx: number, cz: number, i: number, step = GLASSES.searchStep): XZ {
  const r = step * Math.sqrt(i);
  const a = i * GOLDEN;
  return { x: cx + Math.cos(a) * r, z: cz + Math.sin(a) * r };
}

/**
 * DEV HELPER (not used by the game): first spiral candidate around `start` that passes every rule,
 * with the board facing `faceTo`. Returns the frozen-table row to paste, or null.
 */
export function searchSite(
  w: SiteWorld,
  start: XZ,
  opts: { id: string; near: string; faceTo?: XZ; others?: readonly XZ[]; playRadius?: number; count?: number; stats?: Record<string, number> },
): FixedSite | null {
  const count = (k: string): void => {
    if (opts.stats) opts.stats[k] = (opts.stats[k] ?? 0) + 1;
  };
  for (let i = 0; i < (opts.count ?? GLASSES.searchCount); i++) {
    const c = spiralPoint(start.x, start.z, i);
    const sp = staticProblems(w, c.x, c.z, { playRadius: opts.playRadius, others: opts.others });
    if (sp.length) {
      count(sp[0].split(' ')[0]);
      continue;
    }
    const g = groundProblem(w, c.x, c.z);
    if (g) {
      count(g);
      continue;
    }
    // Face the given point, or else the nearest road (where kids walk past).
    const yaw = opts.faceTo ? yawTowards(c, opts.faceTo) : yawTowards(c, nearestRoadPoint(w.roads, c.x, c.z));
    for (let slot = 0; slot < BOARD_SLOTS.length; slot++) {
      const row: FixedSite = { id: opts.id, x: c.x, z: c.z, yaw, slot, near: opts.near, playRadius: opts.playRadius };
      if (!w.view || w.view(c.x, c.z, yaw, boardOf(row))) return row;
    }
    count('view');
  }
  return null;
}

/** Closest point on any road centreline. */
export function nearestRoadPoint(roads: readonly SiteRoad[], x: number, z: number): XZ {
  let best = { x, z: z + 1 };
  let bd = Infinity;
  for (const r of roads) {
    for (let i = 1; i < r.points.length; i++) {
      const a = r.points[i - 1];
      const b = r.points[i];
      const dx = b[0] - a[0];
      const dz = b[1] - a[1];
      const l2 = dx * dx + dz * dz;
      const t = l2 > 0 ? Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / l2)) : 0;
      const px = a[0] + dx * t;
      const pz = a[1] + dz * t;
      const d = Math.hypot(x - px, z - pz);
      if (d < bd) {
        bd = d;
        best = { x: px, z: pz };
      }
    }
  }
  return best;
}
