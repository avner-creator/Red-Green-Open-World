/**
 * Scoops friends as friendly solid customers (QA6 M2) and the closed shop front (QA6 counter row):
 * stepping aside, the blocker that never traps, the fade between camera and hero, and the parlour
 * layout (cone beside the hero, front sealed wall to wall, friends' spots clear of everything).
 */
import { describe, expect, it } from 'vitest';
import { PLAYER } from '../../src/config';
import { CROWD, blockerSolid, clampToArea, fadeFor, stepAside } from '../../src/activities/scoops/crowd';
import { FRONT, LAYOUT, buildParlour } from '../../src/activities/scoops/parlour';
import { BUILD_CAMERA } from '../../src/activities/scoops';

const table = { x: LAYOUT.table.x, z: LAYOUT.table.z };

describe('scoops crowd: stepping aside', () => {
  it('a far hero leaves the friend on its spot', () => {
    const home = { x: LAYOUT.queue[0].x, z: LAYOUT.queue[0].z };
    expect(stepAside(home, { x: home.x + 3, z: home.z }, table)).toEqual(home);
  });

  it('a close hero makes the friend step away (to avoidR, or as far as it may stray)', () => {
    for (const home of [...LAYOUT.queue, ...LAYOUT.hangout]) {
      for (let a = 0; a < 16; a++) {
        const ang = (a / 16) * Math.PI * 2;
        const hero = { x: home.x + Math.sin(ang) * 0.6, z: home.z + Math.cos(ang) * 0.6 };
        const p = stepAside({ x: home.x, z: home.z }, hero, table);
        const d = Math.hypot(p.x - hero.x, p.z - hero.z);
        // Further from the hero than before, unless pinned by the area's edge.
        const pinned = Math.abs(Math.abs(p.x) - CROWD.area.x) < 1e-6 || Math.abs(p.z - CROWD.area.z0) < 1e-6 || Math.abs(p.z - CROWD.area.z1) < 1e-6;
        if (!pinned) expect(d).toBeGreaterThan(0.6);
        expect(Math.hypot(p.x - home.x, p.z - home.z)).toBeLessThanOrEqual(CROWD.maxStep + 1e-6);
      }
    }
  });

  it('a hero right on the spot still gets a sideways step', () => {
    const p = stepAside({ x: 2, z: 3 }, { x: 2, z: 3 }, null);
    expect(Math.hypot(p.x - 2, p.z - 3)).toBeGreaterThan(0.5);
  });

  it('a friend never steps into the counter, the walls or the terrace table', () => {
    for (let x = -5; x <= 5; x += 0.25) {
      for (let z = 0; z <= 6; z += 0.25) {
        const p = clampToArea({ x, z }, table);
        expect(Math.abs(p.x)).toBeLessThanOrEqual(CROWD.area.x + 1e-9);
        expect(p.z).toBeGreaterThanOrEqual(FRONT.z1 + CROWD.friendR - 0.01);
        expect(p.z).toBeLessThanOrEqual(CROWD.area.z1);
        expect(Math.hypot(p.x - table.x, p.z - table.z)).toBeGreaterThanOrEqual(0.5 + CROWD.friendR);
      }
    }
  });
});

describe('scoops crowd: the blocker never traps', () => {
  const touch = CROWD.friendR + PLAYER.radius;
  it('is off while the hero overlaps it and back on once clear', () => {
    expect(blockerSolid(true, touch - 0.2)).toBe(false);
    expect(blockerSolid(false, touch + 0.05)).toBe(false); // hysteresis: still walking out
    expect(blockerSolid(true, touch + 0.05)).toBe(true); // a hero touching from outside slides round
    expect(blockerSolid(false, touch + 0.5)).toBe(true);
  });
});

describe('scoops crowd: the fade', () => {
  const f = { x: 0, y: 0, z: 0 };
  it('a friend across the line of sight fades; one beside it or behind the hero does not', () => {
    expect(fadeFor(f, { x: 0, y: 2, z: 4 }, { x: 0, y: 1.5, z: -3 })).toBe(CROWD.ghost);
    expect(fadeFor(f, { x: 2, y: 2, z: 4 }, { x: 2, y: 1.5, z: -3 })).toBe(1);
    expect(fadeFor(f, { x: 0, y: 2, z: 6 }, { x: 0, y: 1.5, z: 3 })).toBe(1);
  });
  it('a camera inside a friend hides the friend', () => {
    expect(fadeFor(f, { x: 0.3, y: 1.2, z: 0.2 }, { x: 0, y: 1.5, z: -3 })).toBe(0);
  });
});

describe('scoops layout (QA6 M5 and the counter)', () => {
  it('the cone stands well beside the hero, and every ingredient is to the hero\'s left', () => {
    const chef = LAYOUT.chef;
    expect(chef.x - LAYOUT.holder.x).toBeGreaterThan(1.6);
    for (let i = 0; i < 3; i++) expect(LAYOUT.jar(i).x).toBeLessThan(LAYOUT.holder.x);
    for (let i = 0; i < 3; i++) expect(LAYOUT.bottle(i).x).toBeLessThan(LAYOUT.holder.x);
    for (let i = 0; i < 4; i++) expect(LAYOUT.tub(i).x).toBeGreaterThan(LAYOUT.holder.x);
    // Raised on the step: the hero's middle is above the counter top.
    expect(chef.y + PLAYER.height * 0.45).toBeGreaterThan(LAYOUT.holder.y - 0.12);
    // The camera stands in front and to the right (the side away from the ingredients).
    expect(BUILD_CAMERA.yawOffset).toBeGreaterThan(Math.PI);
  });

  it('the shop front is sealed wall to wall for the walking hero, up to the roof', () => {
    const p = buildParlour();
    const front = p.colliders.filter((c) => c.heroOnly);
    expect(front).toHaveLength(1);
    const c = front[0];
    expect(c.c.x - c.h.x).toBeLessThanOrEqual(-3.85);
    expect(c.c.x + c.h.x).toBeGreaterThanOrEqual(3.85);
    expect(c.c.y - c.h.y).toBeLessThanOrEqual(LAYOUT.floor);
    expect(c.c.y + c.h.y).toBeGreaterThanOrEqual(LAYOUT.floor + 3.6);
    // It covers the whole counter depth (no gap between it and the side walls' front ends).
    expect(c.c.z + c.h.z).toBeGreaterThanOrEqual(2.1);
    p.dispose();
  });

  it('the friends\' spots are clear of the counter, walls, pillars, flower boxes and table', () => {
    const p = buildParlour();
    // Everything a standing friend could touch (not the floor, not the roof overhead).
    const solid = p.colliders.filter((c) => !c.heroOnly && c.c.y + c.h.y > LAYOUT.floor + 0.05 && c.c.y - c.h.y < LAYOUT.floor + 1.8);
    for (const s of [...LAYOUT.queue, ...LAYOUT.hangout]) {
      for (const c of solid) {
        const r = CROWD.friendR;
        if (c.kind === 'cyl') expect(Math.hypot(s.x - c.c.x, s.z - c.c.z), `${s.x},${s.z}`).toBeGreaterThanOrEqual(c.h.x + r);
        else {
          const dx = Math.max(0, Math.abs(s.x - c.c.x) - c.h.x);
          const dz = Math.max(0, Math.abs(s.z - c.c.z) - c.h.z);
          expect(Math.hypot(dx, dz), `${s.x},${s.z}`).toBeGreaterThanOrEqual(r);
        }
      }
      expect(clampToArea({ x: s.x, z: s.z }, table)).toEqual({ x: s.x, z: s.z });
    }
    p.dispose();
  });
});
