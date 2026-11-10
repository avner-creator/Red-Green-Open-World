import { describe, expect, test } from 'vitest';
import { buildTerrain, sampleHeight } from '../../src/world/terrain';
import { PATH_RULES, STONE, checkPath, edgeGap, helixStones, minClearance, onStone, stonesAlong } from '../../src/activities/secrets/pathLogic';
import type { Stone } from '../../src/activities/secrets/pathLogic';
import { DOOR_RULES, DoorLock, buttonAt, fromDoorLocal, makeSequence, toDoorLocal } from '../../src/activities/secrets/doorLogic';
import { buildRoutes, buildVaults } from '../../src/activities/secrets/routes';

const terrain = buildTerrain();
const height = (x: number, z: number): number => sampleHeight(terrain, x, z);
const floor = (x: number, z: number): number => Math.max(0, height(x, z));

describe('path generation', () => {
  test('stonesAlong keeps every hop inside the rules, even with jitter and arcs', () => {
    const s = stonesAlong(
      [
        { x: 0, y: 0, z: 0 },
        { x: 20, y: 7, z: 3 },
        { x: 20, y: 2, z: 25 },
      ],
      { arc: 1.2, jitter: 0.45, seed: 9 },
    );
    const c = checkPath(s);
    expect(c.ok).toBe(true);
    expect(c.worstGap).toBeLessThanOrEqual(PATH_RULES.maxGap);
    expect(c.worstRise).toBeLessThanOrEqual(PATH_RULES.maxRise);
    expect(s[0]).toMatchObject({ x: 0, y: 0, z: 0 });
    expect(s[s.length - 1].x).toBeCloseTo(20);
    expect(s[s.length - 1].z).toBeCloseTo(25);
  });

  test('helix climbs evenly with chords at the spacing', () => {
    const s = helixStones(5, 5, 0, 12, 3.4);
    expect(s[0].y).toBe(0);
    expect(s[s.length - 1].y).toBeCloseTo(12);
    for (let i = 0; i + 1 < s.length; i++) {
      expect(Math.hypot(s[i + 1].x - s[i].x, s[i + 1].z - s[i].z)).toBeCloseTo(STONE.spacing, 1);
      expect(s[i + 1].y - s[i].y).toBeLessThanOrEqual(STONE.rise + 1e-9);
    }
  });

  test('checkPath flags a gap that is too wide or a step that is too high', () => {
    const a: Stone = { x: 0, y: 0, z: 0, r: 0.8 };
    expect(checkPath([a, { x: 3.7, y: 0, z: 0, r: 0.8 }]).ok).toBe(true);
    expect(checkPath([a, { x: 3.9, y: 0, z: 0, r: 0.8 }]).ok).toBe(false);
    expect(checkPath([a, { x: 2, y: 1.1, z: 0, r: 0.8 }]).ok).toBe(false);
    expect(checkPath([a, { x: 2, y: -3, z: 0, r: 0.8 }]).ok).toBe(true);
    expect(edgeGap(a, { x: 1, y: 0, z: 0, r: 0.8 })).toBe(0);
  });

  test('onStone needs the feet on the top disc', () => {
    const s: Stone = { x: 0, y: 5, z: 0, r: 0.8 };
    expect(onStone(s, 0.5, 5.02, 0.2)).toBe(true);
    expect(onStone(s, 1.3, 5.0, 0)).toBe(false);
    expect(onStone(s, 0, 4.2, 0)).toBe(false);
  });
});

describe('the four secret paths on the real island', () => {
  const routes = buildRoutes(height);

  test('four routes, each reachable stone to stone and on to its pedestal', () => {
    expect(routes.map((r) => r.id)).toEqual(['rooftops', 'trampoline', 'lake', 'lighthouse']);
    for (const r of routes) {
      const ped: Stone = { x: r.pedestal.x, y: r.pedestal.y, z: r.pedestal.z, r: r.pedestal.r };
      const all = [...r.stones, ped];
      // Split into jump runs at the walked hops (across the flat roof).
      const cuts = r.walks.map((w) => w.hop);
      let from = 0;
      for (const cut of [...cuts, all.length - 1]) {
        const c = checkPath(all.slice(from, cut + 1));
        expect(c.ok, `${r.id} run@${from}: hop ${c.firstBad} gap ${c.worstGap.toFixed(2)} rise ${c.worstRise.toFixed(2)}`).toBe(true);
        from = cut + 1;
      }
      for (const w of r.walks) {
        // Both ends of a walked hop are a short hop from the surface and not far above/below it.
        for (const s of [all[w.hop], all[w.hop + 1]]) {
          const dx = Math.max(w.minX - s.x, 0, s.x - w.maxX);
          const dz = Math.max(w.minZ - s.z, 0, s.z - w.maxZ);
          expect(Math.hypot(dx, dz) - s.r, r.id).toBeLessThan(1.6);
          expect(Math.abs(s.y - w.top), r.id).toBeLessThan(1.0);
        }
      }
      expect(r.stones.length).toBeGreaterThan(8);
      expect(r.stones.length).toBeLessThan(40);
    }
  });

  test('every stone floats above the ground and the water', () => {
    for (const r of routes) {
      expect(minClearance(r.stones, floor), r.id).toBeGreaterThan(PATH_RULES.minClearance);
    }
  });

  test('the first stone is an easy step from the ground at the start', () => {
    for (const r of routes) {
      const s = r.stones[0];
      const g = floor(s.x, s.z);
      expect(s.y - g, r.id).toBeLessThanOrEqual(1.0);
      expect(Math.hypot(r.start.x - s.x, r.start.z - s.z), r.id).toBeLessThan(6);
      expect(height(r.start.x, r.start.z), r.id).toBeGreaterThan(0.3);
    }
  });

  test('the lighthouse spiral clears the tower, plinth and gallery', () => {
    const lh = routes.find((r) => r.id === 'lighthouse')!;
    const cx = lh.pedestal.x;
    const cz = lh.pedestal.z;
    const y = height(cx, cz);
    const gallery = y + 14.3;
    for (const s of lh.stones) {
      const d = Math.hypot(s.x - cx, s.z - cz);
      const bottom = s.y - STONE.thickness;
      if (bottom < y + 1.1) expect(d - s.r).toBeGreaterThan(3.5);
      if (bottom < gallery + 0.3) expect(d - s.r).toBeGreaterThan(2.95);
      expect(d - s.r).toBeGreaterThan(1.45);
    }
  });

  test('the lake path ends at the platform deck', () => {
    const lake = routes.find((r) => r.id === 'lake')!;
    const last = lake.stones[lake.stones.length - 1];
    expect(last.y).toBeCloseTo(1.25, 1);
    expect(height(lake.stones[0].x, lake.stones[0].z)).toBeGreaterThan(0.5);
    // Most of it is over water.
    expect(lake.stones.filter((s) => height(s.x, s.z) < 0).length).toBeGreaterThan(lake.stones.length / 2);
  });
});

describe('vault doors', () => {
  test('sequences are three different buttons and never plain left-to-right', () => {
    for (let seed = 0; seed < 200; seed++) {
      const s = makeSequence(seed);
      expect(s).toHaveLength(3);
      expect(new Set(s).size).toBe(3);
      for (const b of s) expect(b).toBeGreaterThanOrEqual(0);
      for (const b of s) expect(b).toBeLessThan(DOOR_RULES.buttons);
      expect(s[0] < s[1] && s[1] < s[2]).toBe(false);
    }
    expect(makeSequence(42)).toEqual(makeSequence(42));
  });

  test('right order opens; a wrong press wobbles back to the start', () => {
    const lock = new DoorLock([2, 0, 3]);
    expect(lock.press(2)).toBe('correct');
    expect(lock.press(1)).toBe('wrong');
    expect(lock.progress).toBe(0);
    expect(lock.press(0)).toBe('wrong');
    expect(lock.press(2)).toBe('correct');
    expect(lock.press(0)).toBe('correct');
    expect(lock.press(3)).toBe('opened');
    expect(lock.opened).toBe(true);
    expect(lock.press(1)).toBe('ignored');
    lock.reset([1, 2, 3]);
    expect(lock.opened).toBe(false);
    expect(lock.press(1)).toBe('correct');
    expect(lock.press(-1)).toBe('ignored');
  });

  test('standing in front of a button selects it; outside the zone selects nothing', () => {
    DOOR_RULES.buttonX.forEach((x, i) => expect(buttonAt(x + 0.1, 1.5)).toBe(i));
    expect(buttonAt(0, -0.5)).toBe(-1);
    expect(buttonAt(0, 4)).toBe(-1);
    expect(buttonAt(3, 1.5)).toBe(-1);
  });

  test('door-local transforms round-trip', () => {
    for (const yaw of [0, 1.6, -2.3]) {
      const o = fromDoorLocal(yaw, 1.2, 2.5);
      const l = toDoorLocal(10, 20, yaw, 10 + o.x, 20 + o.z);
      expect(l.x).toBeCloseTo(1.2);
      expect(l.z).toBeCloseTo(2.5);
    }
    // +Z local is the anchor "front" (sin yaw, cos yaw).
    const f = fromDoorLocal(0.7, 0, 1);
    expect(f.x).toBeCloseTo(Math.sin(0.7));
    expect(f.z).toBeCloseTo(Math.cos(0.7));
  });

  test('both vaults stand on flat dry land with room in front', () => {
    for (const v of buildVaults(height)) {
      expect(v.y, v.id).toBeGreaterThan(2);
      for (let lz = -4.4; lz <= 4; lz += 0.8) {
        for (let lx = -2.4; lx <= 2.4; lx += 0.8) {
          const o = fromDoorLocal(v.yaw, lx, lz);
          expect(Math.abs(height(v.x + o.x, v.z + o.z) - v.y), `${v.id} ${lx},${lz}`).toBeLessThan(0.5);
        }
      }
    }
  });
});
