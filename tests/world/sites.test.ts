import { beforeAll, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import type { AnchorName, PhysicsApi } from '../../src/types';
import { buildTerrain, coastRadius, sampleHeight, type TerrainData } from '../../src/world/terrain';
import { Batcher } from '../../src/world/batch';
import { Colliders, type Kit } from '../../src/world/props';
import { buildContent, type Content } from '../../src/world/content';
import { buildScatter } from '../../src/world/scatter';
import { createMaterials } from '../../src/world/materials';
import { ANCHORS } from '../../src/world/layout';
import { roadEdgeDistance } from '../../src/world/wayfinding';
import { ATTRACTIONS, COMPASS_ATTRACTIONS } from '../../src/world/attractions';
import { DRESSING, SITES, dressingPoints, inZone, raceCutDistance, type Zone } from '../../src/world/sites';
import { STILE } from '../../src/world/fill/fixes';

const NEW: AnchorName[] = ['carnivalRow', 'iceCream', 'bubbleArena', 'dinoRing', 'raceStart', 'foamCourse', 'airstrip', 'dragonRoost'];
/** Anchors whose clear circle takes in a road (or the village street and houses): flat over the footprint instead. */
const ROAD_IN_RADIUS: AnchorName[] = ['raceStart', 'airstrip', 'carnivalRow'];

let t: TerrainData;
let content: Content;
let placements: { name: string; x: number; z: number; s: number }[];
type Col = { kind: string; x: number; y: number; z: number; r: number };
const cols: Col[] = [];
const h = (x: number, z: number): number => sampleHeight(t, x, z);

beforeAll(() => {
  t = buildTerrain();
  const fake = {
    addStaticBox: (c: THREE.Vector3, he: THREE.Vector3) => void cols.push({ kind: 'box', x: c.x, y: c.y, z: c.z, r: Math.min(he.x, he.z) }),
    addStaticCylinder: (c: THREE.Vector3, _hh: number, r: number) => void cols.push({ kind: 'cyl', x: c.x, y: c.y, z: c.z, r }),
    addStaticSphere: (c: THREE.Vector3, r: number) => void cols.push({ kind: 'sphere', x: c.x, y: c.y, z: c.z, r }),
  } as unknown as PhysicsApi; // static colliders only
  const kit: Kit = { b: new Batcher(), col: new Colliders(fake), h };
  content = buildContent(kit, t, () => undefined);
  const scatter = buildScatter(t, createMaterials(), kit.col, content.trees, content.keepouts, (_x, _z, o) => o.setRGB(0.3, 0.5, 0.2));
  placements = scatter.placements();
});

/** Sample points (1 m grid) inside a zone. */
function zonePoints(z: Zone): [number, number][] {
  const out: [number, number][] = [];
  const ex = z.r ?? z.hx ?? 0;
  const ez = z.r ?? z.hz ?? 0;
  for (let dx = -ex; dx <= ex + 1e-6; dx += 1) for (let dz = -ez; dz <= ez + 1e-6; dz += 1) if (inZone(z, z.x + dx, z.z + dz, 1e-6)) out.push([z.x + dx, z.z + dz]);
  return out;
}

function heightRange(pts: [number, number][]): number {
  let lo = Infinity;
  let hi = -Infinity;
  for (const [x, z] of pts) {
    lo = Math.min(lo, h(x, z));
    hi = Math.max(hi, h(x, z));
  }
  return hi - lo;
}

describe('Carnival Island sites', () => {
  it('every new anchor has a site, an attraction entry with its own icon, and a compass entry', () => {
    for (const a of NEW) {
      expect(SITES.some((s) => s.anchor === a), a).toBe(true);
      expect(ATTRACTIONS.some((q) => q.anchor === a), a).toBe(true);
      expect(COMPASS_ATTRACTIONS.some((q) => q.anchor === a), a).toBe(true);
    }
    expect(new Set(ATTRACTIONS.map((q) => q.icon)).size).toBe(ATTRACTIONS.length);
  });

  it('anchors stand on dry land inside the island, at the spots the attractions were built on', () => {
    const built: Record<string, [number, number]> = {
      carnivalRow: [21, -42], iceCream: [24, -2], bubbleArena: [35, 57.5], dinoRing: [16, 58.5],
      raceStart: [29.5, 11.2], foamCourse: [-25.5, -18.5], airstrip: [-12, 46], dragonRoost: [-34, -130],
    };
    for (const a of NEW) {
      const d = ANCHORS[a];
      expect([d.x, d.z], a).toEqual(built[a]);
      expect(h(d.x, d.z), a).toBeGreaterThan(2);
      expect(Math.hypot(d.x, d.z) + d.radius, a).toBeLessThan(coastRadius(d.x, d.z));
    }
  });

  it('each site is flat within its clear radius (or over its footprint where a road runs through the circle)', () => {
    for (const a of NEW) {
      const d = ANCHORS[a];
      if (!ROAD_IN_RADIUS.includes(a)) expect(heightRange(zonePoints({ x: d.x, z: d.z, r: d.radius })), a).toBeLessThan(0.06);
      for (const f of SITES.find((s) => s.anchor === a)?.footprint ?? []) {
        // The race grid is the road itself (gentle grade); everything else is a flat pad.
        expect(heightRange(zonePoints(f)), `${a} footprint`).toBeLessThan(a === 'raceStart' ? 0.45 : 0.06);
      }
    }
  });

  it('clear radii do not overlap each other', () => {
    const all = Object.entries(ANCHORS);
    for (const a of NEW) {
      for (const [name, b] of all) {
        // The race grid is the road in front of the garage forecourt (one stream builds both).
        if (name === a || name === 'bungee' || (a === 'raceStart' && name === 'garage')) continue;
        const d = Math.hypot(ANCHORS[a].x - b.x, ANCHORS[a].z - b.z);
        expect(d, `${a} / ${name}`).toBeGreaterThan(ANCHORS[a].radius + b.radius);
      }
    }
  });

  it('no tree, bush or rock stands in a site radius, footprint or corridor', () => {
    const bad: string[] = [];
    for (const p of placements) {
      for (const a of NEW) {
        const d = ANCHORS[a];
        if (Math.hypot(p.x - d.x, p.z - d.z) < d.radius + 0.5) bad.push(`${p.name} (${p.x.toFixed(1)}, ${p.z.toFixed(1)}) in ${a}`);
      }
      for (const s of SITES) {
        for (const z of [...s.footprint, ...s.corridors]) if (inZone(z, p.x, p.z)) bad.push(`${p.name} (${p.x.toFixed(1)}, ${p.z.toFixed(1)}) in ${s.anchor} zone`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('keeps grass out of the floors the attractions lay (decks, boardwalk, runway, foam)', () => {
    for (const s of SITES) {
      for (const f of s.footprint.filter((q) => q.floor)) {
        const hit = content.keepouts.some((k) => k.paved && k.x === f.x && k.z === f.z);
        expect(hit, s.anchor).toBe(true);
      }
    }
  });

  it('no world collider stands in a site radius or footprint (except the attractions own nothing yet)', () => {
    const bad: string[] = [];
    // The walk-up steps to the bubble pitch's wall (owner playtest 4) belong to the arena on purpose.
    const inStile = (x: number, z: number): boolean => x > STILE.x0 - 0.3 && x < STILE.x1 + 0.3 && z > STILE.z0 - 0.3 && z < STILE.z1 + 0.3;
    for (const c of cols) {
      if (inStile(c.x, c.z)) continue;
      for (const a of NEW) {
        const d = ANCHORS[a];
        // Village houses and the main-street lamps sit inside the carnival circle but outside its strip.
        if (a !== 'carnivalRow' && Math.hypot(c.x - d.x, c.z - d.z) < d.radius) bad.push(`${c.kind} (${c.x.toFixed(1)}, ${c.z.toFixed(1)}) in ${a}`);
      }
      for (const s of SITES) for (const f of s.footprint) if (inZone(f, c.x, c.z, 0.3)) bad.push(`${c.kind} (${c.x.toFixed(1)}, ${c.z.toFixed(1)}) on ${s.anchor} footprint`);
    }
    expect(bad).toEqual([]);
  });

  it('nothing solid stands on the race lap (east road, loop road, south road, grass cut)', () => {
    // LAP_POINTS of the buggy race (agent/buggy-race src/activities/race/track.ts).
    const lap: [number, number][] = [
      [26, 11], [46, 12], [60, 24], [67, 40], [69, 47], [68.6, 53], [68, 58], [66, 70], [60, 78],
      [46, 82], [28, 80], [17.5, 77], [7, 74], [5, 60], [2, 40], [3, 27], [9.5, 17.5], [17.5, 11.2], [26, 11],
    ];
    const line = { def: { width: 0 }, pts: lap.map(([x, z]) => ({ x, z, h: 0 })) } as unknown as Parameters<typeof roadEdgeDistance>[0][number];
    const bad: string[] = [];
    const silly = ANCHORS.sillyZone;
    for (const c of cols) {
      // The Silly Zone's inflatable bollards are another stream's area (reported, not moved here).
      if (Math.hypot(c.x - silly.x, c.z - silly.z) < 21) continue;
      // Roads are 7 m wide (3.5 m + 0.3 m margin); on the grass cut the safe line needs ~2 m.
      const need = raceCutDistance(c.x, c.z) < 6 ? 2.5 : 3.8;
      const e = roadEdgeDistance([line], c.x, c.z) - c.r;
      if (e < need && c.y < h(c.x, c.z) + 3) bad.push(`${c.kind} (${c.x.toFixed(1)}, ${c.z.toFixed(1)}) ${e.toFixed(2)} m from the lap line`);
    }
    expect(bad).toEqual([]);
  });

  it('entrance dressing stands outside every clear radius and off the roads', () => {
    const bad: string[] = [];
    for (const p of dressingPoints()) {
      for (const [name, a] of Object.entries(ANCHORS)) {
        if (Math.hypot(p.x - a.x, p.z - a.z) - p.r < a.radius) bad.push(`${p.anchor} dressing (${p.x}, ${p.z}) inside ${name}`);
      }
      if (roadEdgeDistance(t.roads, p.x, p.z) - p.r < 0.3) bad.push(`${p.anchor} dressing (${p.x}, ${p.z}) on a road`);
    }
    expect(bad).toEqual([]);
    expect(new Set(DRESSING.map((d) => d.anchor)).size).toBe(NEW.length);
  });

  it('a road or footpath reaches every site', () => {
    for (const a of NEW) {
      const d = ANCHORS[a];
      expect(roadEdgeDistance(t.roads, d.x, d.z), a).toBeLessThan(d.radius + 4);
    }
  });
});
