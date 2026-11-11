import { beforeAll, describe, expect, it } from 'vitest';
import { buildTerrain } from '../../src/world/terrain';
import type { TerrainData } from '../../src/world/terrain';
import { EDGE_E, EDGE_N, LOD_STEPS, SEA_STEP, buildLodGrid, pickStep, tileIndices } from '../../src/world/terrain-lod';

let t: TerrainData;
beforeAll(() => {
  t = buildTerrain();
});

describe('terrain LOD', () => {
  it('has zero error on a plane (coarse triangles are exact) and positive error on the island', () => {
    const n = 40;
    const plane = new Float32Array((n + 1) * (n + 1)).map((_, i) => 0.3 * (i % (n + 1)) - 0.1 * Math.floor(i / (n + 1)) + 5);
    const g = buildLodGrid(plane, n, 20);
    for (const e of g.err) for (const v of e) expect(v).toBeLessThan(1e-4);
    const island = buildLodGrid(t.heights, t.n, 20);
    expect(Math.max(...island.err.map((e) => e[LOD_STEPS.length - 1]))).toBeGreaterThan(1);
    // Coarser steps never have less error than finer ones... at least for the coarsest vs the half step on average.
    const avg = (si: number): number => island.err.reduce((a, e) => a + e[si], 0) / island.err.length;
    expect(avg(3)).toBeGreaterThan(avg(1));
  });

  it('keeps full detail near the camera, coarsens far away, and drops the hidden sea floor to two triangles', () => {
    const g = buildLodGrid(t.heights, t.n, 20);
    const land = g.sea.findIndex((s, i) => !s && g.err[i][3] > 0.5);
    expect(pickStep(g, land, 5, 0.007, 40)).toBe(1);
    expect(pickStep(g, land, 2000, 0.007, 40)).toBe(10);
    const sea = g.sea.findIndex((s) => s === 1);
    expect(sea).toBeGreaterThanOrEqual(0);
    expect(pickStep(g, sea, 5, 0.007, 40)).toBe(SEA_STEP);
    expect(g.y1[sea]).toBeLessThan(0);
  });

  it('builds tile index lists of the right size with skirts that use the lowered copy', () => {
    const n = 200;
    const NN = (n + 1) * (n + 1);
    const full = tileIndices(n, 20, 3, 4, 1, 0, NN);
    expect(full.length).toBe(20 * 20 * 6);
    const coarse = tileIndices(n, 20, 3, 4, 4, EDGE_E | EDGE_N, NN);
    expect(coarse.length).toBe(5 * 5 * 6 + 2 * 5 * 12);
    expect(Math.max(...coarse)).toBeGreaterThanOrEqual(NN);
    expect(Math.max(...coarse)).toBeLessThan(2 * NN);
    // The coarse tile's corners are shared with the full grid (same vertices: no seams at corners).
    const N = n + 1;
    const corner = 4 * 20 * N + 3 * 20;
    expect(full).toContain(corner);
    expect(coarse).toContain(corner);
  });
});
