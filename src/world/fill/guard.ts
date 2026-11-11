/**
 * Placement guard for the island fill (landmarks, toys, arches, lights): one place that knows what
 * must stay clear. A spot is free when it is dry land and keeps away from every attraction's clear
 * circle, the glasses-play sites, the Carnival Island footprints and corridors, the race lap, the
 * roads, gem and chest spots, the secret paths and vaults, buildings and pads (keepouts), every
 * collider already built, and everything the fill itself placed. Pure: no WebGL.
 */
import { ANCHORS, PADS } from '../layout';
import { GLASSES_WAY } from '../attractions';

/** Paw-trail meadow of the toys mini-game (world x/z bounds). */
export const TOYS_MEADOW = { x0: -65, x1: -12, z0: 29, z1: 109 } as const;
import { SITES, inZone, raceCutDistance } from '../sites';
import { roadEdgeDistance } from '../wayfinding';
import type { ProcessedRoad } from '../terrain';
import type { Keepout } from '../scatter';
import type { ChestSpot, Spot } from '../spots';
import { footprintDistance, type Footprint, type HeightFn } from '../props';
import { buildRoutes, buildVaults } from '../../activities/secrets/routes'; // read-only pure data: keep the secrets clear
import { WORLD } from '../../config';

/** The buggy race lap (src/activities/race/track.ts LAP_POINTS): solid things keep off it. */
const LAP: readonly (readonly [number, number])[] = [
  [26, 11], [46, 12], [60, 24], [67, 40], [69, 47], [68.6, 53], [68, 58], [66, 70], [60, 78],
  [46, 82], [28, 80], [17.5, 77], [7, 74], [5, 60], [2, 40], [3, 27], [9.5, 17.5], [17.5, 11.2], [26, 11],
];

function distToLap(x: number, z: number): number {
  let best = Infinity;
  for (let i = 0; i < LAP.length - 1; i++) {
    const [ax, az] = LAP[i];
    const [bx, bz] = LAP[i + 1];
    const dx = bx - ax;
    const dz = bz - az;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz)));
    best = Math.min(best, Math.hypot(x - ax - dx * t, z - az - dz * t));
  }
  return best;
}

export interface GuardOpts {
  /** Solid (gets a collider): keeps off the race lap and further from spots. Default true. */
  solid?: boolean;
  /** Allowed on (or right next to) a road: arches and road paint. Default false. */
  onRoad?: boolean;
  /** Ignore the keepouts (paved plaza, pads): for small toys placed on purpose in a dressed area. */
  inKeepouts?: boolean;
}

export interface Guard {
  h: HeightFn;
  /** Can something of footprint radius `r` stand at (x, z)? */
  free(x: number, z: number, r: number, opts?: GuardOpts): boolean;
  /** Record a placed footprint so later placements keep off it. */
  take(x: number, z: number, r: number): void;
  /** Why (x, z, r) is not free (tests and debugging), or null. */
  why(x: number, z: number, r: number, opts?: GuardOpts): string | null;
}

export interface GuardInput {
  h: HeightFn;
  roads: readonly ProcessedRoad[];
  keepouts: readonly Keepout[];
  gemSpots: readonly Spot[];
  chestSpots: readonly ChestSpot[];
  /** Collider footprints already built (`Colliders.circles`). */
  colliders: readonly Footprint[];
}

export function makeGuard(inp: GuardInput): Guard {
  const taken: { x: number; z: number; r: number }[] = [];
  const routes = buildRoutes(inp.h);
  const vaults = buildVaults(inp.h);
  const secretPts: { x: number; z: number; r: number }[] = [];
  for (const r of routes) {
    for (const s of r.stones) secretPts.push({ x: s.x, z: s.z, r: 3 });
    secretPts.push({ x: r.pedestal.x, z: r.pedestal.z, r: 4 }, { x: r.start.x, z: r.start.z, r: 7 });
  }
  for (const v of vaults) secretPts.push({ x: v.x, z: v.z, r: Math.max(v.crag.halfW, -v.crag.back) + 5 });
  const half = WORLD.size / 2 - 6;

  const why = (x: number, z: number, r: number, opts: GuardOpts = {}): string | null => {
    const solid = opts.solid ?? true;
    if (Math.abs(x) > half || Math.abs(z) > half) return 'edge';
    if (inp.h(x, z) < WORLD.waterLevel + 0.5) return 'water';
    for (const [name, a] of Object.entries(ANCHORS)) {
      if (Math.hypot(x - a.x, z - a.z) < a.radius + r + 1) return `anchor ${name}`;
    }
    for (const g of GLASSES_WAY) {
      if (Math.hypot(x - g.x, z - g.z) < g.r + r + 8) return `glasses ${g.id}`;
      if (Math.hypot(x - g.beacon.x, z - g.beacon.z) < r + 2.5) return `glasses beacon ${g.id}`;
    }
    // The toys mini-game lays its paw trails anywhere on this meadow: keep solid props and
    // bouncy toys off it (thin lamps / trail-head posts pass `solid: false`).
    if (solid && x + r > TOYS_MEADOW.x0 && x - r < TOYS_MEADOW.x1 && z + r > TOYS_MEADOW.z0 && z - r < TOYS_MEADOW.z1) return 'toys meadow';
    for (const s of SITES) {
      for (const f of s.footprint) if (inZone(f, x, z, r + 1)) return `site ${s.anchor}`;
      if (solid) for (const c of s.corridors) if (inZone(c, x, z, r + 0.5)) return `corridor ${s.anchor}`;
    }
    if (!opts.onRoad && roadEdgeDistance(inp.roads, x, z) < r + 0.8) return 'road';
    if (solid && (distToLap(x, z) < r + 4.6 || raceCutDistance(x, z) < r + 3)) return 'race lap';
    for (const s of inp.gemSpots) if (Math.hypot(x - s.x, z - s.z) < r + (solid ? 2.5 : 1.5)) return `gem ${s.tag}`;
    for (const c of inp.chestSpots) if (Math.hypot(x - c.x, z - c.z) < r + 4.5) return 'chest';
    for (const p of secretPts) if (Math.hypot(x - p.x, z - p.z) < r + p.r) return 'secret';
    if (!opts.inKeepouts) {
      for (const k of inp.keepouts) {
        if (k.mown) continue;
        const inside = k.r !== undefined ? Math.hypot(x - k.x, z - k.z) < k.r + r : Math.abs(x - k.x) < (k.hx ?? 0) + r && Math.abs(z - k.z) < (k.hz ?? 0) + r;
        if (inside) return 'keepout';
      }
      for (const p of PADS) {
        if (p.shape === 'circle' && Math.hypot(x - p.x, z - p.z) < (p.r ?? 0) + r) return `pad ${p.id}`;
        if (p.shape === 'rect' && Math.abs(x - p.x) < (p.hx ?? 0) + r && Math.abs(z - p.z) < (p.hz ?? 0) + r) return `pad ${p.id}`;
      }
    }
    if (solid) for (const c of inp.colliders) if (footprintDistance(c, x, z) < r + 0.6) return `collider (${c.x.toFixed(1)}, ${c.z.toFixed(1)})`;
    for (const t of taken) if (Math.hypot(x - t.x, z - t.z) < t.r + r + 0.4) return `taken (${t.x.toFixed(1)}, ${t.z.toFixed(1)})`;
    return null;
  };
  return {
    h: inp.h,
    why,
    free: (x, z, r, opts) => why(x, z, r, opts) === null,
    take: (x, z, r) => void taken.push({ x, z, r }),
  };
}
