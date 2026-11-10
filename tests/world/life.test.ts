import { describe, expect, it } from 'vitest';
import { buildTerrain, sampleHeight } from '../../src/world/terrain';
import { ANCHORS, ROADS } from '../../src/world/layout';
import { buildChestSpots, buildGemSpots } from '../../src/world/spots';
import {
  FLOCK, closestApproach, dodgeDir, fishArc, gust, makeWaddler, segDist, stepFlock, stepWaddler, turnToward, wrapAngle,
  type Flock, type Threat, type WaddlerParams,
} from '../../src/world/life/math';
import { ATTRACTIONS, CHICKENS, DUCKS, FISH, FLOCKS, FOLK, SHEEP, pointTarget } from '../../src/world/life/places';
import { Rng } from '../../src/world/rng';

const terrain = buildTerrain();
const h = (x: number, z: number): number => sampleHeight(terrain, x, z);
const SHEEP_P: WaddlerParams = { radius: 0.55, walk: 0.45, flee: 1.6, hopLen: 3, hopTime: 0.5, hopHeight: 0.7, roam: 3.5 };
const CHICK_P: WaddlerParams = { radius: 0.3, walk: 0.6, flee: 2.2, hopLen: 2.6, hopTime: 0.42, hopHeight: 0.8, roam: 2.5 };

describe('life maths: angles and steering', () => {
  it('wraps and turns the short way round', () => {
    expect(wrapAngle(2.5 * Math.PI)).toBeCloseTo(0.5 * Math.PI, 6);
    expect(wrapAngle(-0.5)).toBeCloseTo(-0.5, 6);
    expect(turnToward(3, -3, 0.1)).toBeCloseTo(3.1, 6); // across ±π, not the long way
    expect(turnToward(0, 0.05, 0.1)).toBeCloseTo(0.05, 6);
  });

  it('predicts the closest approach of a mover', () => {
    const ca = closestApproach(0, 10, 0, 0, 0, 5, 3);
    expect(ca.t).toBeCloseTo(2, 6);
    expect(ca.d).toBeCloseTo(0, 6);
    expect(closestApproach(3, 10, 0, 0, 0, 5, 1).d).toBeCloseTo(Math.hypot(3, 5), 6);
  });

  it('dodges sideways, on the side the critter is already on', () => {
    // Car going +Z; critter slightly to the right (+X) of its path → hop further +X.
    const [dx, dz] = dodgeDir(0.3, 10, 0, 0, 0, 15);
    expect(dx).toBeGreaterThan(0.9);
    expect(Math.abs(dz)).toBeLessThan(0.3);
    const [lx] = dodgeDir(-0.3, 10, 0, 0, 0, 15);
    expect(lx).toBeLessThan(-0.9);
    // Slow mover: straight away from it.
    const [ax, az] = dodgeDir(0, 2, 0, 0, 0, 0.5);
    expect(ax).toBeCloseTo(0, 6);
    expect(az).toBeCloseTo(1, 6);
  });

  it('fish arcs and wind gusts stay in range', () => {
    expect(fishArc(0, 1).y).toBeCloseTo(0, 6);
    expect(fishArc(0.5, 1).y).toBeCloseTo(1, 6);
    expect(fishArc(0.25, 1).pitch).toBeLessThan(0); // nose up while rising (negative X rotation)
    expect(fishArc(0.75, 1).pitch).toBeGreaterThan(0);
    for (let t = 0; t < 600; t += 0.37) {
      const g = gust(t);
      expect(g).toBeGreaterThan(0.55);
      expect(g).toBeLessThan(1.75);
    }
  });
});

describe('sheep and chickens are never touched', () => {
  const run = (p: WaddlerParams, threat: Threat, lateral: number, seconds: number): { minGap: number; hops: number } => {
    const w = makeWaddler(lateral, 0);
    const rng = new Rng(7);
    const t = { ...threat };
    let minGap = Infinity;
    const dt = 1 / 60;
    for (let i = 0; i < seconds * 60; i++) {
      t.x += t.vx * dt;
      t.z += t.vz * dt;
      stepWaddler(w, p, [t], dt, () => rng.next());
      // Touching = bodies overlap on the ground (a hop over the mover counts as touching too).
      minGap = Math.min(minGap, Math.hypot(w.x - t.x, w.z - t.z) - t.radius - p.radius);
    }
    return { minGap, hops: w.hops };
  };

  for (const lateral of [0, 0.4, -0.8, 1.5]) {
    for (const speed of [6, 12, 20]) {
      it(`buggy at ${speed} m/s, ${lateral} m off its line`, () => {
        const buggy: Threat = { x: 0, z: -40, vx: 0, vz: speed, radius: 1.3 };
        const s = run(SHEEP_P, buggy, lateral, 80 / speed);
        expect(s.minGap).toBeGreaterThan(0);
        expect(s.hops).toBeGreaterThan(0);
        const c = run(CHICK_P, buggy, lateral, 80 / speed);
        expect(c.minGap).toBeGreaterThan(0);
      });
    }
  }

  it('a running player chasing straight at a sheep never reaches it', () => {
    const w = makeWaddler(0, 0);
    const rng = new Rng(3);
    const p = { x: -12, z: 0, vx: 0, vz: 0, radius: 0.4 };
    let minGap = Infinity;
    let hops = 0;
    for (let i = 0; i < 20 * 60; i++) {
      // Homing chase at sprint speed.
      const dx = w.x - p.x;
      const dz = w.z - p.z;
      const d = Math.hypot(dx, dz) || 1;
      p.vx = (dx / d) * 7;
      p.vz = (dz / d) * 7;
      p.x += p.vx / 60;
      p.z += p.vz / 60;
      if (stepWaddler(w, SHEEP_P, [p], 1 / 60, () => rng.next())) hops++;
      minGap = Math.min(minGap, d - p.radius - SHEEP_P.radius);
    }
    expect(hops).toBeGreaterThan(2);
    expect(minGap).toBeGreaterThan(0);
  });

  it('grazes calmly near home when nobody is around', () => {
    const w = makeWaddler(5, 5);
    const rng = new Rng(11);
    for (let i = 0; i < 60 * 60; i++) stepWaddler(w, SHEEP_P, [], 1 / 60, () => rng.next());
    expect(Math.hypot(w.x - 5, w.z - 5)).toBeLessThanOrEqual(SHEEP_P.roam + 0.2);
    expect(w.hops).toBe(0);
  });
});

describe('ground-bird flock', () => {
  const flat = (): number => 0;
  const make = (): Flock => ({
    state: 'ground', t: 0, spots: [[0, 0], [30, 0], [0, 30]], spot: 0, gx: 0, gy: 0, gz: 0, scatters: 0,
    birds: Array.from({ length: 6 }, (_, i) => ({ x: Math.cos(i) * 1.5, y: 0, z: Math.sin(i) * 1.5, vx: 0, vy: 0, vz: 0, ox: Math.cos(i) * 1.5, oz: Math.sin(i) * 1.5 })),
  });

  it('stays put while the player is far away', () => {
    const f = make();
    const rng = new Rng(1);
    for (let i = 0; i < 120; i++) stepFlock(f, { x: 20, z: 0, vehicle: false }, 1 / 60, flat, () => rng.next());
    expect(f.state).toBe('ground');
    expect(f.scatters).toBe(0);
  });

  it('scatters up and away when the player comes close, then resettles somewhere clear', () => {
    const f = make();
    const rng = new Rng(2);
    let scattered = false;
    for (let i = 0; i < 10 && !scattered; i++) scattered = stepFlock(f, { x: FLOCK.scare - 1, z: 0, vehicle: false }, 1 / 60, flat, () => rng.next());
    expect(scattered).toBe(true);
    expect(f.state).toBe('flying');
    for (let i = 0; i < 60; i++) stepFlock(f, { x: 3, z: 0, vehicle: false }, 1 / 60, flat, () => rng.next());
    const avgY = f.birds.reduce((a, b) => a + b.y, 0) / f.birds.length;
    expect(avgY).toBeGreaterThan(2);
    // Away from the threat (which is on +X).
    expect(f.birds.reduce((a, b) => a + b.x, 0) / f.birds.length).toBeLessThan(0);
    // The player stays at the home spot: the flock lands on another, clear spot.
    for (let i = 0; i < 25 * 60 && f.state !== 'ground'; i++) stepFlock(f, { x: 0, z: 0, vehicle: false }, 1 / 60, flat, () => rng.next());
    expect(f.state).toBe('ground');
    expect(f.spot).not.toBe(0);
    for (const b of f.birds) expect(Math.hypot(b.x, b.z)).toBeGreaterThan(FLOCK.landClear - 3);
  });

  it('a vehicle scares them from further away', () => {
    const f = make();
    const rng = new Rng(4);
    stepFlock(f, { x: FLOCK.scare + 2, z: 0, vehicle: true }, 1 / 60, flat, () => rng.next());
    expect(f.state).toBe('flying');
  });

  it('keeps birds apart in the air', () => {
    const f = make();
    const rng = new Rng(5);
    stepFlock(f, { x: 1, z: 0, vehicle: false }, 1 / 60, flat, () => rng.next());
    for (let i = 0; i < 240; i++) stepFlock(f, { x: 1, z: 0, vehicle: false }, 1 / 60, flat, () => rng.next());
    let minD = Infinity;
    for (let i = 0; i < f.birds.length; i++) {
      for (let j = i + 1; j < f.birds.length; j++) {
        const a = f.birds[i];
        const b = f.birds[j];
        minD = Math.min(minD, Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z));
      }
    }
    expect(minD).toBeGreaterThan(0.3);
  });
});

describe('where life lives (layout)', () => {
  const roads = ROADS.map((r) => ({ r, pts: r.points.map((p) => [p[0], p[1]] as const) }));
  const roadGap = (x: number, z: number): number => {
    let best = Infinity;
    for (const { r, pts } of roads) {
      for (let i = 1; i < pts.length; i++) best = Math.min(best, segDist(x, z, pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1]) - r.width / 2);
    }
    return best;
  };
  const anchorGap = (x: number, z: number): number =>
    Math.min(...Object.values(ANCHORS).map((a) => Math.hypot(x - a.x, z - a.z) - a.radius));

  it('townsfolk stand on dry land, off the roads and outside every attraction', () => {
    expect(FOLK.length).toBeGreaterThanOrEqual(4);
    expect(FOLK.length).toBeLessThanOrEqual(6);
    for (const f of FOLK) {
      expect(h(f.x, f.z), f.id).toBeGreaterThan(1);
      expect(roadGap(f.x, f.z), f.id).toBeGreaterThan(0.8);
      expect(anchorGap(f.x, f.z), f.id).toBeGreaterThan(1);
    }
    expect(FOLK.filter((f) => f.low).length).toBeGreaterThanOrEqual(3);
  });

  it('townsfolk only point at attractions, never at a gem or chest-key spot', () => {
    const gems = buildGemSpots(h, terrain.roads);
    const chests = buildChestSpots(h);
    for (const name of ATTRACTIONS) {
      const a = ANCHORS[name];
      expect(a, name).toBeDefined();
      for (const f of FOLK) {
        const [tx, tz] = pointTarget(f.x, f.z, a);
        // The target is on the attraction (inside its clear circle)…
        expect(Math.hypot(tx - a.x, tz - a.z)).toBeLessThanOrEqual(a.radius);
        // …and no gem or chest sits on it.
        for (const s of [...gems, ...chests]) expect(Math.hypot(s.x - tx, s.z - tz), `${f.id} → ${name}`).toBeGreaterThan(1.5);
      }
    }
  });

  it('flocks, sheep and chickens live on land; ducks and fish in the bay', () => {
    for (const f of FLOCKS) {
      const [x, z] = f.spots[0];
      expect(h(x, z)).toBeGreaterThan(1);
      expect(anchorGap(x, z)).toBeGreaterThan(0);
    }
    for (const [x, z] of [...SHEEP, ...CHICKENS]) expect(h(x, z)).toBeGreaterThan(1);
    for (let a = 0; a < Math.PI * 2; a += 0.2) {
      const x = DUCKS.x + Math.cos(a) * DUCKS.rx;
      const z = DUCKS.z + Math.sin(a) * DUCKS.rz;
      expect(h(x, z)).toBeLessThan(-1);
      expect(Math.hypot(x - ANCHORS.lakePlatform.x, z - ANCHORS.lakePlatform.z)).toBeGreaterThan(ANCHORS.lakePlatform.radius + 2);
    }
    expect(h(FISH.x, FISH.z)).toBeLessThan(-1);
  });
});
