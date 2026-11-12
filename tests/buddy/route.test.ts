/**
 * QA7 m14: every place Pip leads to must be walkable from the plaza over the terrain, not only a
 * clear spot. The dragon roost stands on a plateau above a cliff: the straight way from the plaza
 * is not walkable, the route goes round over the land bridge in the east.
 */
import { describe, expect, it } from 'vitest';
import { Leader } from '../../src/buddy/guide';
import { routeLength, terrainClear, terrainRoute, type TerrainProbe } from '../../src/buddy/route';
import { WORLD } from '../../src/config';
import { buildTerrain, sampleHeight } from '../../src/world/terrain';
import { ANCHORS } from '../../src/world/layout';
import { FIXED_SITES } from '../../src/activities/glasses/sites';

const terrain = buildTerrain();
const half = WORLD.size / 2;
const probe: TerrainProbe = {
  heightAt: (x, z) => sampleHeight(terrain, x, z),
  isLand: (x, z) => Math.abs(x) < half - 2 && Math.abs(z) < half - 2 && sampleHeight(terrain, x, z) > WORLD.waterLevel + 0.1,
  waterLevel: WORLD.waterLevel,
};
const PLAZA = { x: ANCHORS.spawn.x, z: ANCHORS.spawn.z };

function steps(from: { x: number; z: number }, route: readonly { x: number; z: number }[]): boolean {
  let cur = from;
  for (const p of route) {
    if (!terrainClear(cur, p, probe)) return false;
    cur = p;
  }
  return true;
}

describe('terrain route (QA7 m14)', () => {
  it('the dragon roost: no straight walk from the plaza (cliff), but a route round by the east', () => {
    const roost = { x: ANCHORS.dragonRoost.x + 1.1, z: ANCHORS.dragonRoost.z + 4.4 };
    expect(terrainClear(PLAZA, roost, probe)).toBe(false);
    const t0 = performance.now();
    const r = terrainRoute(PLAZA, roost, probe);
    const ms = performance.now() - t0;
    expect(r).not.toBeNull();
    expect(steps(PLAZA, r!)).toBe(true);
    // Over the land bridge (east of x 40, where the canyon is: z −112…−100).
    expect(r!.some((p) => p.x > 40 && p.z < -95 && p.z > -118)).toBe(true);
    expect(routeLength(PLAZA, r!)).toBeGreaterThan(Math.hypot(roost.x - PLAZA.x, roost.z - PLAZA.z) * 1.2);
    expect(ms).toBeLessThan(400);
  });

  it('every attraction and glasses site is walkable from the plaza', () => {
    const names = ['trampoline', 'bouncePads', 'launchPads', 'balloon', 'garage', 'gearShack', 'ranch', 'sillyZone', 'carnivalRow',
      'iceCream', 'bubbleArena', 'dinoRing', 'raceStart', 'foamCourse', 'airstrip', 'dragonRoost'] as const;
    const spots = [...names.map((n) => ({ n: n as string, x: ANCHORS[n].x, z: ANCHORS[n].z })), ...FIXED_SITES.map((s) => ({ n: s.id, x: s.x, z: s.z }))];
    const bad: string[] = [];
    for (const s of spots) {
      // Within a few metres of the anchor (structures stand on the anchor itself).
      const ok = [0, 3, 5].some((r) => [0, 1, 2, 3, 4, 5, 6, 7].some((k) => {
        const p = { x: s.x + Math.sin((k / 8) * Math.PI * 2) * r, z: s.z + Math.cos((k / 8) * Math.PI * 2) * r };
        return probe.isLand(p.x, p.z) && terrainRoute(PLAZA, p, probe) !== null;
      }));
      if (!ok) bad.push(s.n);
    }
    expect(bad).toEqual([]);
  });
});

describe('Leader with a terrain route', () => {
  it('hops along the route corners (round the cliff), not straight at the destination', () => {
    const L = new Leader();
    L.set({ x: 0, z: 60 }, 6, false, [{ x: 40, z: 0 }, { x: 40, z: 60 }]);
    const o = L.update(0.1, { x: 0, z: 1 }, { x: 0, z: 0 })!;
    // First hop goes east (towards the first corner), not north.
    expect(o.target.x).toBeGreaterThan(5);
    expect(Math.abs(o.target.z)).toBeLessThan(1);
    expect(L.route?.map((p) => [p.x, p.z])).toEqual([[40, 0], [40, 60], [0, 60]]);
  });
});
