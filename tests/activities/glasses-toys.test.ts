import { describe, expect, it } from 'vitest';
import { TOYS, TRAIL } from '../../src/activities/glasses/toys/constants';
import { advance, makeTrail, pointReject, printGlow, ToyRounds, trailShape } from '../../src/activities/glasses/toys/trail';
import type { Trail, TrailWorld } from '../../src/activities/glasses/toys/trail';
import type { RoundEvent } from '../../src/activities/glasses/toys/trail';

/** A fake island: a gentle hill, a road to the east, an anchor to the north, a wall to the south-west, a steep cliff to the west. */
function fakeWorld(): TrailWorld & { walls: { x0: number; z0: number; x1: number; z1: number }[] } {
  const walls = [{ x0: -30, z0: -20, x1: -10, z1: -20 }];
  return {
    walls,
    heightAt: (x, z) => 5 + Math.sin(x * 0.05) * 1.2 + Math.cos(z * 0.04) * 1 + (x < -32 ? (-32 - x) * 2 : 0),
    isLand: (x, z) => Math.hypot(x, z) < 120,
    waterLevel: 0,
    roads: [{ width: 6, points: [[30, -80], [30, 80]] }],
    anchors: { spawn: { position: { x: 0, y: 5, z: -60 }, radius: 10 }, garage: { position: { x: -5, y: 5, z: 35 }, radius: 12, target: { x: 60, y: 5, z: 60 }, targetRadius: 5 } },
    obstacles: [{ x: 3, z: 0, r: 1.2 }],
    surfaceAt(x, z) {
      // A solid crate north-east.
      if (Math.hypot(x - 14, z - 14) < 2) return null;
      return this.heightAt(x, z);
    },
    blockedBetween(ax, az, bx, bz) {
      // Segment intersection with the walls (2D).
      for (const w of walls) {
        const d = (bx - ax) * (w.z1 - w.z0) - (bz - az) * (w.x1 - w.x0);
        if (Math.abs(d) < 1e-9) continue;
        const t = ((w.x0 - ax) * (w.z1 - w.z0) - (w.z0 - az) * (w.x1 - w.x0)) / d;
        const u = ((w.x0 - ax) * (bz - az) - (w.z0 - az) * (bx - ax)) / d;
        if (t >= 0 && t <= 1 && u >= 0 && u <= 1) return true;
      }
      return false;
    },
  };
}

const START = { x: 0, z: 0 };

function checkTrail(w: TrailWorld, t: Trail, tier: 1 | 2 | 3): void {
  expect(t.valid).toBe(true);
  expect(t.prints.length).toBeGreaterThanOrEqual(TRAIL.minPrints);
  expect(t.prints.length).toBeLessThanOrEqual(TRAIL.maxPrints);
  expect(t.length).toBeGreaterThanOrEqual(TRAIL.minLength);
  expect(t.length).toBeLessThanOrEqual(TRAIL.maxLength);
  expect(t.spacing).toBe(TRAIL.spacing[tier]);
  for (const p of [...t.prints, t.end]) {
    expect(pointReject(w, p.x, p.z)).toBeNull();
    expect(p.y).toBeCloseTo(w.heightAt(p.x, p.z), 6);
  }
  for (let i = 1; i < t.prints.length; i++) {
    const a = t.prints[i - 1];
    const b = t.prints[i];
    const d = Math.hypot(b.x - a.x, b.z - a.z);
    // Along a gentle curve: the chord is a little shorter than the spacing.
    expect(d).toBeLessThanOrEqual(t.spacing + 1e-6);
    expect(d).toBeGreaterThan(t.spacing * 0.9);
    expect(Math.abs(b.y - a.y) / d).toBeLessThanOrEqual(TRAIL.maxGrade + 0.05);
    expect(w.blockedBetween!(a.x, a.z, b.x, b.z)).toBe(false);
    // Each print is turned along the path.
    const yaw = Math.atan2(b.x - a.x, b.z - a.z);
    expect(Math.abs(Math.atan2(Math.sin(yaw - a.yaw), Math.cos(yaw - a.yaw)))).toBeLessThan(0.6);
  }
  expect(Math.hypot(t.prints[0].x - START.x, t.prints[0].z - START.z)).toBeCloseTo(TRAIL.startOffset, 5);
}

describe('paw-print trails', () => {
  it('shape: 12–16 prints, 25–40 m, wider spacing for higher tiers', () => {
    for (const tier of [1, 2, 3] as const) {
      for (let r = 0; r < 1; r += 0.05) {
        const { count, spacing } = trailShape(tier, r);
        expect(count).toBeGreaterThanOrEqual(12);
        expect(count).toBeLessThanOrEqual(16);
        expect(spacing * (count - 1)).toBeGreaterThanOrEqual(25);
        expect(spacing * (count - 1)).toBeLessThanOrEqual(40);
      }
    }
    expect(TRAIL.spacing[2]).toBeGreaterThan(TRAIL.spacing[1]);
    expect(TRAIL.spacing[3]).toBeGreaterThan(TRAIL.spacing[2]);
  });

  it('every print and the end are valid on the fake world, for many seeds and all tiers', () => {
    const w = fakeWorld();
    for (let seed = 1; seed <= 60; seed++) for (const tier of [1, 2, 3] as const) checkTrail(w, makeTrail(w, START, seed, tier), tier);
  });

  it('is deterministic per seed; different seeds hide the toy in different places (≥ 4 directions)', () => {
    const w = fakeWorld();
    const a = makeTrail(w, START, 1234, 1);
    expect(makeTrail(w, START, 1234, 1)).toEqual(a);
    const cands = new Set<number>();
    const ends: { x: number; z: number }[] = [];
    for (let seed = 1; seed <= 40; seed++) {
      const t = makeTrail(w, START, seed, 1);
      cands.add(t.candidate);
      ends.push(t.end);
    }
    expect(cands.size).toBeGreaterThanOrEqual(4);
    expect(TRAIL.directions).toBeGreaterThanOrEqual(4);
    let far = 0;
    for (let i = 1; i < ends.length; i++) if (Math.hypot(ends[i].x - ends[i - 1].x, ends[i].z - ends[i - 1].z) > 3) far++;
    expect(far).toBeGreaterThan(ends.length * 0.7);
  });

  it('avoids roads, anchors, walls, solid things and steep ground', () => {
    const w = fakeWorld();
    for (let seed = 100; seed < 140; seed++) {
      const t = makeTrail(w, START, seed, 2);
      for (const p of t.prints) {
        expect(Math.abs(p.x - 30)).toBeGreaterThan(3 + TRAIL.roadClear - 1e-6);
        expect(Math.hypot(p.x + 5, p.z - 35)).toBeGreaterThan(12);
        expect(Math.hypot(p.x - 14, p.z - 14)).toBeGreaterThanOrEqual(2);
        expect(p.x).toBeGreaterThan(-33);
      }
    }
  });

  it('falls back to a short, flagged trail when nothing fits', () => {
    const w: TrailWorld = { ...fakeWorld(), isLand: (x, z) => Math.hypot(x, z) < 6 };
    const t = makeTrail(w, START, 5, 1);
    expect(t.valid).toBe(false);
    expect(t.prints.length).toBeGreaterThanOrEqual(2);
  });
});

describe('glow and progress', () => {
  it('only the next few prints glow, nearest brightest', () => {
    const g = Array.from({ length: 10 }, (_, i) => printGlow(i, 3));
    expect(g.slice(0, 3)).toEqual([0, 0, 0]);
    expect(g[3]).toBe(1);
    for (let i = 4; i < 3 + TRAIL.glow.length; i++) expect(g[i]).toBeLessThan(g[i - 1]);
    expect(g.slice(3 + TRAIL.glow.length)).toEqual(new Array(10 - 3 - TRAIL.glow.length).fill(0));
    expect(TRAIL.glow.length).toBeGreaterThanOrEqual(2);
    expect(TRAIL.glow.length).toBeLessThanOrEqual(4);
  });

  it('reaching a glowing print moves past it; far prints cannot be skipped to', () => {
    const prints = Array.from({ length: 12 }, (_, i) => ({ x: i * 2.1, z: 0 }));
    expect(advance(prints, 0, 30, 30)).toBe(0);
    expect(advance(prints, 0, -0.5, 0)).toBe(1);
    expect(advance(prints, 0, 4.2, 0)).toBe(3); // print 2 glows: reaching it counts 0–2
    expect(advance(prints, 0, 21, 0)).toBe(0); // print 10 is not glowing yet
    // The last print needs 1.5 m.
    expect(advance(prints, 11, 23.1 + 1.8, 0)).toBe(11);
    expect(advance(prints, 11, 23.1 + 1.2, 0)).toBe(12);
  });
});

describe('rounds', () => {
  const straight = (seed: number, tier: 1 | 2 | 3): Trail => {
    const prints = Array.from({ length: 12 }, (_, i) => ({ x: i * TRAIL.spacing[tier], y: 0, z: seed % 97, yaw: Math.PI / 2 }));
    const last = prints[prints.length - 1];
    return { prints, end: { ...last, x: last.x + 1 }, spacing: TRAIL.spacing[tier], length: 11 * TRAIL.spacing[tier], candidate: 0, angle: 0, valid: true };
  };
  const walk = (r: ToyRounds): RoundEvent[] => {
    const ev: RoundEvent[] = [];
    for (const p of r.trail().prints) ev.push(...r.update(1 / 60, p.x, p.z));
    return ev;
  };
  const run = (r: ToyRounds, seconds: number): RoundEvent[] => {
    const ev: RoundEvent[] = [];
    for (let t = 0; t < seconds; t += 0.1) ev.push(...r.update(0.1, 1e4, 1e4));
    return ev;
  };

  it('three toys per session, tiers 1 → 2 → 3, worth 5 / 7 / 10, then rest', () => {
    const r = new ToyRounds(straight);
    r.reset(42);
    const found: RoundEvent[] = [];
    for (let k = 0; k < 3; k++) {
      expect(r.state).toBe('trail');
      expect(r.tier).toBe(k + 1);
      const ev = walk(r);
      expect(ev[0]).toEqual({ type: 'start', tier: k + 1 });
      found.push(...ev.filter((e) => e.type === 'found'));
      expect(r.state).toBe('found');
      const later = run(r, TOYS.nextAfterFind + 0.2);
      expect(later.filter((e) => e.type === 'landed')).toEqual([{ type: 'landed', toy: k }]);
    }
    expect(found).toEqual([
      { type: 'found', tier: 1, gems: 5, toy: 0 },
      { type: 'found', tier: 2, gems: 7, toy: 1 },
      { type: 'found', tier: 3, gems: 10, toy: 2 },
    ]);
    expect(r.state).toBe('done');
    expect(run(r, 200)).toEqual([]);
    // A new session starts over.
    r.reset(43);
    expect(r.state).toBe('trail');
    expect(r.tier).toBe(1);
  });

  it('times out 75 s after the first print is reached (never before): a miss, then a new trail of the same tier', () => {
    const r = new ToyRounds(straight);
    r.reset(7);
    expect(run(r, 200)).toEqual([]); // not started: no clock, no miss
    const seed = r.seed;
    r.update(1 / 60, r.trail().prints[0].x, r.trail().prints[0].z); // first print
    expect(r.started).toBe(true);
    const ev = run(r, TOYS.timeout + 0.2);
    expect(ev.filter((e) => e.type === 'miss')).toEqual([{ type: 'miss', tier: 1 }]);
    const next = run(r, TOYS.nextAfterMiss + 0.2);
    expect(next.filter((e) => e.type === 'trail')).toHaveLength(1);
    expect(r.tier).toBe(1);
    expect(r.seed).not.toBe(seed);
    expect(r.state).toBe('trail');
    expect(r.started).toBe(false);
  });

  it('trail seeds are deterministic per session seed', () => {
    const a = new ToyRounds(straight);
    const b = new ToyRounds(straight);
    a.reset(99);
    b.reset(99);
    expect(a.seed).toBe(b.seed);
    b.reset(100);
    expect(a.seed).not.toBe(b.seed);
  });
});
