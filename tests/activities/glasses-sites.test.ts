import { describe, expect, it } from 'vitest';
import { GLASSES } from '../../src/activities/glasses/constants';
import { checkSite, findSites, roadClearance, SITE_PLANS, siteToWorld, spiralPoint } from '../../src/activities/glasses/sites';
import type { SiteAnchor, SiteWorld } from '../../src/activities/glasses/sites';
import { MECHANICS } from '../../src/activities/glasses/mechanics';
import { ROADS } from '../../src/world/layout';

const anchor = (x: number, z: number, radius: number, extra: Partial<SiteAnchor> = {}): SiteAnchor => ({ position: { x, y: 5, z }, radius, ...extra });

function fakeWorld(patch: Partial<SiteWorld> = {}): SiteWorld {
  return {
    // Gentle rolling island, sea beyond r = 170.
    heightAt: (x, z) => 6 + Math.sin(x * 0.05) * 0.6 + Math.cos(z * 0.04) * 0.6,
    isLand: (x, z) => Math.hypot(x, z) < 170,
    waterLevel: 0,
    anchors: {
      spawn: anchor(0, 9, 4),
      garage: anchor(34, 20, 8),
      trampoline: anchor(58, -24, 12),
      bouncePads: anchor(84, -12, 10),
      balloon: anchor(84, 64, 12),
      launchPads: anchor(80, 24, 12, { target: { x: 83, y: 5, z: -34 }, targetRadius: 5 }),
    },
    gemSpots: [{ position: { x: 20, z: 0 } }, { position: { x: -10, z: 30 } }],
    chestSpots: [{ position: { x: 40, z: 40 } }],
    roads: ROADS,
    ...patch,
  };
}

function expectAllRules(world: SiteWorld, sites: ReturnType<typeof findSites>): void {
  for (const s of sites) {
    const band = { cx: s.x, cz: s.z, min: 0, max: 1 }; // band is checked separately below
    const others = sites.filter((o) => o !== s);
    expect(checkSite(world, s.x, s.z, { radius: s.radius, others, band }), s.id).toBeNull();
  }
}

describe('glasses site finder', () => {
  it('registry and site plans line up one to one', () => {
    expect(MECHANICS.map((m) => m.id)).toEqual(SITE_PLANS.map((p) => p.id));
    for (const m of MECHANICS) {
      expect(m.pictos.length).toBeGreaterThanOrEqual(2);
      expect(m.pictos.length).toBeLessThanOrEqual(3);
    }
  });

  it('finds six valid, deterministic, well-spaced sites on a fake island', () => {
    const world = fakeWorld();
    const a = findSites(world);
    const b = findSites(world);
    expect(a).toEqual(b);
    expect(a).toHaveLength(6);
    for (const s of a) expect(s.valid, s.id).toBe(true);
    expectAllRules(world, a);
    for (let i = 0; i < a.length; i++)
      for (let j = i + 1; j < a.length; j++) expect(Math.hypot(a[i].x - a[j].x, a[i].z - a[j].z)).toBeGreaterThanOrEqual(GLASSES.siteSpacing);
    const spawn = world.anchors.spawn.position;
    for (const s of a.slice(0, 3)) {
      const d = Math.hypot(s.x - spawn.x, s.z - spawn.z);
      expect(d).toBeGreaterThanOrEqual(GLASSES.plazaMin);
      expect(d).toBeLessThanOrEqual(GLASSES.plazaMax);
    }
    for (const s of a.slice(3)) {
      const an = world.anchors[s.near];
      const d = Math.hypot(s.x - an.position.x, s.z - an.position.z);
      expect(d).toBeLessThanOrEqual(GLASSES.nearMax);
      expect(d).toBeGreaterThanOrEqual(an.radius + s.radius);
    }
    // Sites face the spawn; the board stands inside the probed circle.
    for (const s of a) {
      const toSpawn = Math.atan2(spawn.x - s.x, spawn.z - s.z);
      expect(Math.abs(Math.atan2(Math.sin(s.yaw - toSpawn), Math.cos(s.yaw - toSpawn)))).toBeLessThan(1e-9);
      expect(Math.hypot(s.board.x - s.x, s.board.z - s.z)).toBeLessThan(s.radius + 1);
    }
  });

  it('respects a newly added anchor (iterates every anchor dynamically)', () => {
    const before = findSites(fakeWorld());
    const s0 = before[0];
    const world = fakeWorld();
    const anchors = { ...world.anchors, newRide: anchor(s0.x, s0.z, 9) };
    const w2 = { ...world, anchors };
    const after = findSites(w2);
    expect(after[0].valid).toBe(true);
    expect(Math.hypot(after[0].x - s0.x, after[0].z - s0.z)).toBeGreaterThanOrEqual(9 + GLASSES.siteRadius + GLASSES.anchorMargin - 1e-9);
    expectAllRules(w2, after);
  });

  it('respects anchor targets and blocked cells', () => {
    const before = findSites(fakeWorld());
    const s1 = before[1];
    const blockedCell = (x: number, z: number, r: number): boolean => Math.abs(x - s1.x) < 6 + r && Math.abs(z - s1.z) < 6 + r;
    const w = fakeWorld({ blocked: blockedCell });
    const after = findSites(w);
    expect(after[1].valid).toBe(true);
    expect(blockedCell(after[1].x, after[1].z, after[1].radius + 1)).toBe(false);

    const t = fakeWorld();
    const anchors = { ...t.anchors, ride: anchor(-100, -100, 3, { target: { x: before[2].x, y: 5, z: before[2].z }, targetRadius: 6 }) };
    const moved = findSites({ ...t, anchors });
    expect(Math.hypot(moved[2].x - before[2].x, moved[2].z - before[2].z)).toBeGreaterThanOrEqual(6 + GLASSES.siteRadius);
  });

  it('keeps off roads, water and gem spots; falls back without throwing', () => {
    const w = fakeWorld();
    for (const s of findSites(w)) {
      expect(roadClearance(w.roads, s.x, s.z)).toBeGreaterThanOrEqual(s.radius + GLASSES.roadMargin);
      for (const g of w.gemSpots) expect(Math.hypot(s.x - g.position.x, s.z - g.position.z)).toBeGreaterThanOrEqual(s.radius + GLASSES.spotClear);
    }
    const sea = fakeWorld({ isLand: () => false });
    const none = findSites(sea);
    expect(none).toHaveLength(6);
    for (const s of none) expect(s.valid).toBe(false);
  });

  it('spiral and site frame helpers', () => {
    expect(spiralPoint(3, 4, 0)).toEqual({ x: 3, z: 4 });
    const p = spiralPoint(0, 0, 100);
    expect(Math.hypot(p.x, p.z)).toBeCloseTo(GLASSES.searchStep * 10);
    // yaw 0: local +Z = world +Z; yaw π/2: local +Z = world +X, local +X = world −Z.
    expect(siteToWorld({ x: 1, z: 2, yaw: 0 }, 0, 3)).toEqual({ x: 1, z: 5 });
    const q = siteToWorld({ x: 0, z: 0, yaw: Math.PI / 2 }, 1, 2);
    expect(q.x).toBeCloseTo(2);
    expect(q.z).toBeCloseTo(-1);
  });
});
