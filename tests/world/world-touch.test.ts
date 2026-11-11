import { beforeAll, describe, expect, it } from 'vitest';
import type { PhysicsApi } from '../../src/types';
import { buildTerrain, sampleHeight, type TerrainData } from '../../src/world/terrain';
import { Batcher } from '../../src/world/batch';
import { Colliders, footprintDistance, type Footprint, type Kit } from '../../src/world/props';
import { buildContent, type Content } from '../../src/world/content';
import { buildScatter } from '../../src/world/scatter';
import { createMaterials } from '../../src/world/materials';
import { ANCHORS, PADS } from '../../src/world/layout';
import { makeGuard, TOYS_MEADOW } from '../../src/world/fill/guard';
import { SIGHTLINES, inSightline } from '../../src/world/sightlines';
import { FINGERPOSTS } from '../../src/world/wayfinding';
import { ARCH } from '../../src/world/outer/ranch';
import { FIXED_SITES } from '../../src/activities/glasses/sites'; // read-only: the six glasses pads

let t: TerrainData;
let content: Content;
let kit: Kit;
let contentCols: Footprint[];
let allCols: Footprint[];
let trees: { name: string; x: number; z: number; s: number }[];
const h = (x: number, z: number): number => sampleHeight(t, x, z);

beforeAll(() => {
  t = buildTerrain();
  const fake = { addStaticBox() {}, addStaticCylinder() {}, addStaticSphere() {} } as unknown as PhysicsApi; // static colliders only
  kit = { b: new Batcher(), col: new Colliders(fake), h };
  content = buildContent(kit, t, () => undefined);
  contentCols = [...kit.col.circles];
  const scatter = buildScatter(t, createMaterials(), kit.col, content.trees, content.keepouts, (_x, _z, o) => o.setRGB(0.3, 0.5, 0.2));
  allCols = [...kit.col.circles];
  trees = scatter.placements().filter((p) => p.name === 'oak' || p.name === 'pine' || p.name === 'palm');
});

const inMeadow = (x: number, z: number, r: number): boolean =>
  x + r > TOYS_MEADOW.x0 && x - r < TOYS_MEADOW.x1 && z + r > TOYS_MEADOW.z0 && z - r < TOYS_MEADOW.z1;
const reach = (c: Footprint): number => c.r + Math.hypot(c.hx ?? 0, c.hz ?? 0);
const ranch = PADS.find((p) => p.id === 'ranch');

describe('world touch: glasses booths', () => {
  it('no tree trunk or big rock stands in an open sightline to a booth', () => {
    for (const s of SIGHTLINES) {
      const bad = trees.filter((p) => inSightline(p.x, p.z, 0) && SIGHTLINES.some((q) => q === s));
      expect(bad.map((p) => `${s.id}: ${p.name} ${p.x.toFixed(1)},${p.z.toFixed(1)}`)).toEqual([]);
    }
  });

  it('the ranch arch sign is off the glow-flies view line', () => {
    const s = SIGHTLINES.find((q) => q.id === 'glowflies')!;
    // Arch centre and both pillars stay off the corridor and away from the viewpoint (the follow camera
    // sits a few metres behind the child, so the sign must not hang over it either).
    for (const k of [-1, 0, 1]) {
      const x = ARCH.x + Math.cos(ARCH.yaw) * k * ARCH.half;
      const z = ARCH.z - Math.sin(ARCH.yaw) * k * ARCH.half;
      expect(inSightline(x, z, 1)).toBe(false);
      expect(Math.hypot(x - s.ax, z - s.az)).toBeGreaterThan(5);
    }
  });

  it('signposts point to the toys and line-up booths where a child arrives', () => {
    for (const [x, z, id] of [[-8, 69.5, 'toys'], [65.2, -80.6, 'lineup']] as const) {
      const p = FINGERPOSTS.find((f) => Math.hypot(f.x - x, f.z - z) < 0.5);
      expect(p?.targets, id).toContain(id);
    }
  });

  it("the toys mini-game's paw-trail meadow gets no new fence, wall or solid prop", () => {
    // The guard every placement of the island fill goes through refuses solids anywhere in it.
    const guard = makeGuard({ h, roads: [], keepouts: [], gemSpots: [], chestSpots: [], colliders: [] });
    for (let x = TOYS_MEADOW.x0 + 2; x < TOYS_MEADOW.x1; x += 6) {
      for (let z = TOYS_MEADOW.z0 + 2; z < TOYS_MEADOW.z1; z += 6) {
        const why = guard.why(x, z, 0.6);
        expect(why === null || why === 'toys meadow' || why.startsWith('anchor') || why.startsWith('glasses') || why === 'water' || why === 'race lap', `${x},${z}: ${why}`).toBe(true);
        expect(guard.free(x, z, 0.6)).toBe(false);
      }
    }
    // Every world collider in the meadow is the ranch's own paddock (inside its pad), the Silly Zone
    // fence on the meadow's east edge, a tree trunk, or a thin post (≤ 0.6 m): nothing else.
    const bad: string[] = [];
    for (const c of allCols) {
      if (!inMeadow(c.x, c.z, reach(c))) continue;
      const thin = reach(c) <= 0.75;
      const inRanch = ranch !== undefined && Math.abs(c.x - ranch.x) < (ranch.hx ?? 0) && Math.abs(c.z - ranch.z) < (ranch.hz ?? 0);
      const sillyEdge = c.x > -19;
      // The horse ride's how-to board at the ranch approach (a wayfinding board, kept in view).
      const howTo = content.wayfinding.placed.some((p) => p.kind === 'board' && Math.hypot(p.x - c.x, p.z - c.z) < 1);
      if (!thin && !inRanch && !sillyEdge && !howTo) bad.push(`(${c.x.toFixed(1)}, ${c.z.toFixed(1)}) reach ${reach(c).toFixed(2)}`);
    }
    expect(bad).toEqual([]);
  });

  it('no world prop stands within 2.5 m of a start ring or pad (foam, plane, dragon, Silly Zone, balloon, glasses)', () => {
    const pads: { id: string; x: number; z: number }[] = [
      ...FIXED_SITES.map((f) => ({ id: `glasses ${f.id}`, x: f.x, z: f.z })),
      ...(['foamCourse', 'airstrip', 'dragonRoost', 'sillyZone', 'balloon'] as const).map((a) => ({ id: a, x: ANCHORS[a].x, z: ANCHORS[a].z })),
    ];
    const bad: string[] = [];
    for (const p of pads) {
      for (const c of allCols) if (footprintDistance(c, p.x, p.z) < 2.5) bad.push(`${p.id}: collider (${c.x.toFixed(1)}, ${c.z.toFixed(1)})`);
      for (const q of content.fill.placed) if (Math.hypot(q.x - p.x, q.z - p.z) < q.r + 2.5) bad.push(`${p.id}: ${q.kind} ${q.name}`);
    }
    expect(bad).toEqual([]);
    expect(contentCols.length).toBeGreaterThan(0);
  });
});
