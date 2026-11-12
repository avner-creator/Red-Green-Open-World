/**
 * QA m1 (first lead): Pip's way must be one a child following a few metres behind, walking straight
 * at him, can walk. planPath stops short of a destination on something solid, leaves a hero who
 * stands right by a wall, and the Leader only hops where the follower can go, coming back to lead
 * on from a stuck follower.
 */
import { describe, expect, it } from 'vitest';
import { LEAD, Leader, planPath } from '../../src/buddy/guide';
import type { V2 } from '../../src/buddy/steer';

/** Distance from p to segment ab. */
function segDist(p: V2, a: V2, b: V2): number {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const l2 = dx * dx + dz * dz || 1e-9;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / l2));
  return Math.hypot(p.x - a.x - t * dx, p.z - a.z - t * dz);
}
/** Closest approach of segments ab and cd (sampled; fine for tests). */
function segSeg(a: V2, b: V2, c: V2, d: V2): number {
  let m = Infinity;
  for (let i = 0; i <= 40; i++) {
    const t = i / 40;
    m = Math.min(m, segDist({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t }, c, d));
    m = Math.min(m, segDist({ x: c.x + (d.x - c.x) * t, z: c.z + (d.z - c.z) * t }, a, b));
  }
  return m;
}

const HERO_R = 0.35;

describe('planPath: solid destinations and a hero by a wall', () => {
  it('a destination inside a solid disc: the way ends at an approach point, then the destination', () => {
    const c = { x: 20, z: 0 };
    const clear = (a: V2, b: V2): boolean => segDist(c, a, b) > 4.5;
    const dest = { x: 17, z: 0 }; // on the "mat", 3 m from the centre
    expect(planPath({ x: 0, z: 0 }, dest, clear)).toBeNull();
    const path = planPath({ x: 0, z: 0 }, dest, clear, 2.5, 900, { reach: LEAD.reach })!;
    expect(path).not.toBeNull();
    expect(path.at(-1)).toEqual(dest);
    let prev = { x: 0, z: 0 };
    for (const p of path.slice(0, -1)) {
      expect(clear(prev, p)).toBe(true);
      prev = p;
    }
    expect(Math.hypot(prev.x - dest.x, prev.z - dest.z)).toBeLessThanOrEqual(LEAD.reach + 1e-6);
  });

  it('a hero closer to a wall than the planning margin still gets a way out (the looser first leg)', () => {
    const wallA = { x: -10, z: 0.5 };
    const wallB = { x: 10, z: 0.5 };
    const wide = (a: V2, b: V2): boolean => segSeg(a, b, wallA, wallB) > HERO_R + 0.5;
    const near = (a: V2, b: V2): boolean => segSeg(a, b, wallA, wallB) > HERO_R;
    const from = { x: 0, z: 0 }; // 0.5 m from the wall
    expect(planPath(from, { x: 0, z: -15 }, wide)).toBeNull();
    const path = planPath(from, { x: 0, z: -15 }, wide, 2.5, 900, { clearStart: near });
    expect(path).not.toBeNull();
  });
});

describe('Leader: a follower who walks straight at Pip always gets there', () => {
  // A long wall along x = 10 from z = -30 to z = 3: the way goes round its north end.
  const A = { x: 10, z: -30 };
  const B = { x: 10, z: 3 };
  const gap = (a: V2, b: V2): number => segSeg(a, b, A, B);
  const wide = (a: V2, b: V2): boolean => gap(a, b) > HERO_R + 0.5;
  const near = (a: V2, b: V2): boolean => gap(a, b) > HERO_R + 0.15;

  /** Simulate: Pip at 8 m/s to his target, the child at 4 m/s straight at Pip (blocked by the wall). */
  function run(L: Leader, seconds: number): { hero: V2; arrived: number; minGap: number } {
    let pip = { x: 0, z: 1 };
    let hero = { x: 0, z: 0 };
    let minGap = Infinity;
    const dt = 1 / 30;
    for (let t = 0; t < seconds; t += dt) {
      const d = Math.hypot(pip.x - hero.x, pip.z - hero.z);
      const pushing = d > 2.5;
      const o = L.update(dt, pip, hero, pushing);
      if (!o || o.state === 'arrived') return { hero, arrived: t, minGap };
      const px = o.target.x - pip.x;
      const pz = o.target.z - pip.z;
      const pd = Math.hypot(px, pz);
      const k = pd > 8 * dt ? (8 * dt) / pd : 1;
      pip = { x: pip.x + px * k, z: pip.z + pz * k };
      if (pushing) {
        const nh = { x: hero.x + ((pip.x - hero.x) / d) * 4 * dt, z: hero.z + ((pip.z - hero.z) / d) * 4 * dt };
        const g = segDist(nh, A, B);
        if (g > HERO_R) hero = nh; // else: stuck against the wall
        minGap = Math.min(minGap, segDist(hero, A, B));
      }
    }
    return { hero, arrived: -1, minGap };
  }

  it('round the end of a wall: arrives, and the follower never scrapes the wall', () => {
    const L = new Leader(() => true, wide, near, near);
    const dest = { x: 20, z: 0 };
    L.set(dest, 2.5);
    const r = run(L, 60);
    expect(r.arrived).toBeGreaterThan(0);
    expect(r.minGap).toBeGreaterThan(HERO_R + 0.05);
  });

  it('a follower stuck behind something the plan did not know: Pip leads on from the hero within a few seconds', () => {
    // The planner sees nothing; the child is held in place (a customer in the way).
    const L = new Leader(() => true, () => true, () => true);
    L.set({ x: 40, z: 0 }, 2.5);
    let pip = { x: 0, z: 1 };
    const hero = { x: 0, z: 0 };
    for (let t = 0; t < LEAD.heroStuckSeconds + 4; t += 0.1) {
      const o = L.update(0.1, pip, hero, true)!;
      const dx = o.target.x - pip.x;
      const dz = o.target.z - pip.z;
      const d = Math.hypot(dx, dz);
      const k = d > 0.8 ? 0.8 / d : 1;
      pip = { x: pip.x + dx * k, z: pip.z + dz * k };
    }
    expect(L.rejoins).toBeGreaterThanOrEqual(1);
    expect(L.why).toMatch(/follower stuck/);
  });

  it('a child who stands still (not pushing) does not trigger the stuck watchdog', () => {
    const L = new Leader(() => true, () => true, () => true);
    L.set({ x: 40, z: 0 }, 2.5);
    let pip = { x: 0, z: 1 };
    for (let t = 0; t < 20; t += 0.1) {
      const o = L.update(0.1, pip, { x: 0, z: 0 }, false)!;
      const dx = o.target.x - pip.x;
      const dz = o.target.z - pip.z;
      const d = Math.hypot(dx, dz);
      const k = d > 0.8 ? 0.8 / d : 1;
      pip = { x: pip.x + dx * k, z: pip.z + dz * k };
    }
    expect(L.rejoins).toBe(0);
  });
});
