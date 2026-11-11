import { describe, expect, it } from 'vitest';
import { GLASSES } from '../../src/activities/glasses/constants';
import { MECHANICS } from '../../src/activities/glasses/mechanics';
import { isReserved, RESERVED, RESERVED_POINT_CLEAR, reservedDistance } from '../../src/activities/glasses/reserved';
import { boardOf, BOARD_SLOTS, FIXED_SITES, roadEdgeDistance, roadMargin, siteToWorld, spiralPoint, staticProblems } from '../../src/activities/glasses/sites';
import type { SiteAnchor, StaticWorld } from '../../src/activities/glasses/sites';
import { ANCHORS, LAUNCH_NET, ROADS, SIZE } from '../../src/world/layout';

/** Every anchor of the island plan, as the rules read them (the rocket pads' landing net is their target). */
const anchors: Record<string, SiteAnchor> = Object.fromEntries(
  Object.entries(ANCHORS).map(([name, a]) => [
    name,
    {
      position: { x: a.x, y: 0, z: a.z },
      radius: a.radius,
      ...(name === 'launchPads' ? { target: { x: LAUNCH_NET.x, y: 0, z: LAUNCH_NET.z }, targetRadius: LAUNCH_NET.radius } : {}),
    },
  ]),
);
const world: StaticWorld = { anchors, roads: ROADS, half: SIZE / 2 };
const R = GLASSES.siteRadius;

describe('fixed glasses sites (FIXED_SITES)', () => {
  it('one fixed site per registered mechanic, in registry order, with a valid board slot', () => {
    expect(FIXED_SITES.map((s) => s.id)).toEqual(MECHANICS.map((m) => m.id));
    for (const s of FIXED_SITES) expect(s.slot >= 0 && s.slot < BOARD_SLOTS.length, s.id).toBe(true);
  });

  for (const s of FIXED_SITES) {
    describe(`site ${s.id} at (${s.x}, ${s.z})`, () => {
      const P = Math.max(R, s.playRadius ?? R);

      it('is outside every anchor radius and anchor target (all anchors, including future ones)', () => {
        for (const [name, a] of Object.entries(anchors)) {
          const d = Math.hypot(s.x - a.position.x, s.z - a.position.z);
          expect(d, `${s.id} is inside anchor ${name} (needs ${a.radius + R + GLASSES.anchorMargin} m)`).toBeGreaterThanOrEqual(a.radius + R + GLASSES.anchorMargin);
          if (a.target) {
            const dt = Math.hypot(s.x - a.target.x, s.z - a.target.z);
            expect(dt, `${s.id} is on anchor ${name}'s target`).toBeGreaterThanOrEqual((a.targetRadius ?? 0) + R + GLASSES.anchorMargin);
          }
        }
      });

      it('is off every road (race-lap roads with the wider margin)', () => {
        for (const r of ROADS) {
          const need = roadMargin(r.id) + P;
          expect(roadEdgeDistance(r, s.x, s.z), `${s.id} is too close to road ${r.id} (edge needs ≥ ${need} m)`).toBeGreaterThanOrEqual(need);
        }
      });

      it('keeps clear of every reserved place', () => {
        for (const r of RESERVED) {
          expect(Math.hypot(s.x - r.x, s.z - r.z), `${s.id} centre is too close to reserved ${r.name}`).toBeGreaterThanOrEqual(RESERVED_POINT_CLEAR);
          expect(reservedDistance(r, s.x, s.z), `${s.id} circle overlaps reserved ${r.name}'s footprint`).toBeGreaterThanOrEqual(P + GLASSES.reservedMargin);
        }
      });

      it('is inside the island and spaced from the other sites', () => {
        expect(Math.abs(s.x), `${s.id} x near the island edge`).toBeLessThanOrEqual(SIZE / 2 - R - 20);
        expect(Math.abs(s.z), `${s.id} z near the island edge`).toBeLessThanOrEqual(SIZE / 2 - R - 20);
        for (const o of FIXED_SITES) {
          if (o === s) continue;
          expect(Math.hypot(s.x - o.x, s.z - o.z), `${s.id} is too close to site ${o.id}`).toBeGreaterThanOrEqual(GLASSES.siteSpacing);
        }
      });

      it('passes the combined rule check, and its board stands on its approach edge', () => {
        expect(staticProblems(world, s.x, s.z, { playRadius: s.playRadius, others: FIXED_SITES.filter((o) => o !== s) })).toEqual([]);
        const b = boardOf(s);
        expect(Math.hypot(b.x - s.x, b.z - s.z)).toBeLessThan(R + 1);
        expect(isReserved(b.x, b.z, 1)).toBe(false);
      });
    });
  }
});

describe('site rules', () => {
  it('reports what a site collides with', () => {
    const msgs = staticProblems(world, ANCHORS.garage.x, ANCHORS.garage.z);
    expect(msgs.some((m) => m.startsWith('anchor garage'))).toBe(true);
    expect(staticProblems(world, 21, -42).some((m) => m.startsWith('reserved carnivalRow'))).toBe(true);
    expect(staticProblems(world, 2, 40).some((m) => m.startsWith('road south'))).toBe(true);
    // A new anchor on a site is caught.
    const s = FIXED_SITES[0];
    const w2: StaticWorld = { ...world, anchors: { ...anchors, newRide: { position: { x: s.x + 3, y: 0, z: s.z }, radius: 5 } } };
    expect(staticProblems(w2, s.x, s.z).some((m) => m.startsWith('anchor newRide'))).toBe(true);
  });

  it('reserved footprints: circles and rectangles', () => {
    expect(isReserved(-12, 80)).toBe(true); // airstrip climb-out band
    expect(isReserved(35, 57.5)).toBe(true); // bubble arena
    expect(isReserved(-25, -40)).toBe(true); // foam course
    expect(isReserved(-60, -60)).toBe(false);
  });

  it('spiral and site frame helpers', () => {
    expect(spiralPoint(3, 4, 0)).toEqual({ x: 3, z: 4 });
    const p = spiralPoint(0, 0, 100);
    expect(Math.hypot(p.x, p.z)).toBeCloseTo(GLASSES.searchStep * 10);
    expect(siteToWorld({ x: 1, z: 2, yaw: 0 }, 0, 3)).toEqual({ x: 1, z: 5 });
    const q = siteToWorld({ x: 0, z: 0, yaw: Math.PI / 2 }, 1, 2);
    expect(q.x).toBeCloseTo(2);
    expect(q.z).toBeCloseTo(-1);
  });
});
