import { beforeAll, describe, expect, it } from 'vitest';
import RAPIER from '@dimforge/rapier3d-compat';
import { buildTerrain, sampleHeight, slopeAt, coastRadius } from '../../src/world/terrain';
import type { TerrainData } from '../../src/world/terrain';
import { ANCHORS, CANYON, DECK_Y, SIZE } from '../../src/world/layout';
import { buildChestSpots, buildGemSpots } from '../../src/world/spots';
import { Rng } from '../../src/world/rng';
import { LOTS, lotDims } from '../../src/world/village-data';

let t: TerrainData;
const h = (x: number, z: number): number => sampleHeight(t, x, z);
const land = (x: number, z: number): boolean => Math.abs(x) < SIZE / 2 && Math.abs(z) < SIZE / 2 && h(x, z) > 0.1;

beforeAll(() => {
  t = buildTerrain();
});

describe('terrain', () => {
  it('is deterministic', () => {
    const t2 = buildTerrain();
    expect(t2.heights).toEqual(t.heights);
  });

  it('heightAt interpolates exactly at grid samples and stays between corners', () => {
    const n = t.n;
    for (const [ix, iz] of [[0, 0], [100, 100], [37, 151], [n, n]]) {
      const x = -SIZE / 2 + ix * t.cell;
      const z = -SIZE / 2 + iz * t.cell;
      expect(h(x, z)).toBeCloseTo(t.heights[iz * (n + 1) + ix], 5);
    }
    const rng = new Rng(3);
    for (let k = 0; k < 200; k++) {
      const x = rng.range(-190, 190);
      const z = rng.range(-190, 190);
      const ix = Math.floor((x + 200) / t.cell);
      const iz = Math.floor((z + 200) / t.cell);
      const i = iz * (n + 1) + ix;
      const c = [t.heights[i], t.heights[i + 1], t.heights[i + n + 1], t.heights[i + n + 2]];
      expect(h(x, z)).toBeGreaterThanOrEqual(Math.min(...c) - 1e-4);
      expect(h(x, z)).toBeLessThanOrEqual(Math.max(...c) + 1e-4);
    }
  });

  it('matches the Rapier heightfield collider', async () => {
    await RAPIER.init();
    const world = new RAPIER.World({ x: 0, y: -9.8, z: 0 });
    const n = t.n;
    // Same conversion as PhysicsApi.addHeightfield (row-major [z][x] → column-major).
    const col = new Float32Array((n + 1) * (n + 1));
    for (let z = 0; z <= n; z++) for (let x = 0; x <= n; x++) col[x * (n + 1) + z] = t.heights[z * (n + 1) + x];
    world.createCollider(RAPIER.ColliderDesc.heightfield(n, n, col, { x: SIZE, y: 1, z: SIZE }));
    world.step();
    const rng = new Rng(9);
    let worst = 0;
    for (let k = 0; k < 400; k++) {
      const x = rng.range(-180, 180);
      const z = rng.range(-180, 180);
      const hit = world.castRay(new RAPIER.Ray({ x, y: 200, z }, { x: 0, y: -1, z: 0 }), 400, true);
      expect(hit).not.toBeNull();
      if (!hit) continue;
      worst = Math.max(worst, Math.abs(200 - hit.timeOfImpact - h(x, z)));
    }
    expect(worst).toBeLessThan(0.01);
  });

  it('puts land anchors on flat dry ground inside the island', () => {
    for (const [name, a] of Object.entries(ANCHORS)) {
      if (!a.onLand) continue;
      expect(land(a.x, a.z), name).toBe(true);
      expect(slopeAt(t, a.x, a.z), name).toBeLessThan(0.05);
      const c = h(a.x, a.z);
      for (let k = 0; k < 8; k++) {
        const ang = (k / 8) * Math.PI * 2;
        const rr = Math.min(a.radius, 6);
        expect(Math.abs(h(a.x + Math.cos(ang) * rr, a.z + Math.sin(ang) * rr) - c), name).toBeLessThan(0.6);
      }
      expect(Math.hypot(a.x, a.z) + a.radius, name).toBeLessThan(coastRadius(a.x, a.z));
    }
  });

  it('has a canyon at least 30 m below the bridge deck at the bungee', () => {
    const a = ANCHORS.bungee;
    expect(DECK_Y - h(a.x - 6, a.z)).toBeGreaterThanOrEqual(30);
    expect(DECK_Y - h(a.x, CANYON.z)).toBeGreaterThanOrEqual(30);
    expect(land(ANCHORS.bungeeLanding.x, ANCHORS.bungeeLanding.z)).toBe(true);
  });

  it('lake platform floats on water', () => {
    const a = ANCHORS.lakePlatform;
    expect(h(a.x, a.z)).toBeLessThan(-2);
  });

  it('drops off into deep sea at the map edge', () => {
    expect(h(195, 0)).toBeLessThan(-5);
    expect(h(0, -195)).toBeLessThan(-5);
  });
});

describe('spots', () => {
  it('has at least 60 gems above ground inside the island, first 15 near plaza/park', () => {
    const gems = buildGemSpots(h, t.roads);
    expect(gems.length).toBeGreaterThanOrEqual(60);
    for (const g of gems) {
      expect(g.y, `${g.tag} ${g.x},${g.z}`).toBeGreaterThan(h(g.x, g.z) + 0.8);
      expect(land(g.x, g.z), `${g.tag} ${g.x},${g.z}`).toBe(true);
    }
    for (const g of gems.slice(0, 15)) expect(['plaza', 'rooftop', 'trampoline']).toContain(g.tag);
    const tags = new Set(gems.map((g) => g.tag));
    for (const tag of ['plaza', 'rooftop', 'trampoline', 'skydive', 'bridge', 'beach', 'ranch', 'lighthouse', 'silly', 'road', 'secret']) {
      expect(tags.has(tag), tag).toBe(true);
    }
    const tr = gems.filter((g) => g.tag === 'trampoline').map((g) => Math.round(g.y - h(ANCHORS.trampoline.x, ANCHORS.trampoline.z)));
    expect(tr).toEqual([10, 20, 30, 40]);
    expect(buildGemSpots(h, t.roads)).toEqual(gems);
  });

  it('keeps ground gems out of buildings', () => {
    const gems = buildGemSpots(h, t.roads).filter((g) => g.tag !== 'rooftop');
    for (const g of gems) {
      for (const l of LOTS) {
        const inside = Math.hypot(g.x - l.x, g.z - l.z) < Math.min(l.w, l.d) / 2;
        if (inside) expect(g.y).toBeGreaterThan(lotDims(l).roofTop);
      }
    }
  });

  it('has 6 chests on dry land', () => {
    const chests = buildChestSpots(h);
    expect(chests.length).toBe(6);
    for (const c of chests) {
      expect(land(c.x, c.z)).toBe(true);
      expect(c.y).toBeCloseTo(h(c.x, c.z), 5);
    }
  });
});
