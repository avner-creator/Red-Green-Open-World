import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { buildBoothGeometry } from '../../src/activities/glasses/booth/geometry';
import { RoundMachine } from '../../src/activities/glasses/booth/round';
import { LAND_AT, livePrize, SPOT, TOY_BOOTH, toyPrize, toyRules, TOYS, TRAIL } from '../../src/activities/glasses/toys/constants';
import { TOYS_DEMO } from '../../src/activities/glasses/toys/demo';
import { appendToBooth, basketGeometry, poseRange } from '../../src/activities/glasses/toys/models';
import { ToySession, trailSeed } from '../../src/activities/glasses/toys/session';
import type { ToyEvent } from '../../src/activities/glasses/toys/session';
import { advance, makeTrail, pointReject, printGlow, trailShape } from '../../src/activities/glasses/toys/trail';
import type { Trail, TrailWorld } from '../../src/activities/glasses/toys/trail';

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

  it('starts off to the side of the view line from the basket, with ≥ 4 directions to pick from', () => {
    const w = fakeWorld();
    const forward = Math.PI; // the child at the basket looks along −Z
    const cands = new Set<number>();
    for (let seed = 1; seed <= 60; seed++) {
      const t = makeTrail(w, START, seed, 1, { forward });
      cands.add(t.candidate);
      const p0 = t.prints[0];
      const off = Math.abs(Math.atan2(Math.sin(Math.atan2(p0.x, p0.z) - forward), Math.cos(Math.atan2(p0.x, p0.z) - forward)));
      expect(off).toBeGreaterThanOrEqual(TRAIL.startOff[0] - 1e-6);
      expect(off).toBeLessThanOrEqual(TRAIL.startOff[1] + 1e-6);
    }
    expect(cands.size).toBeGreaterThanOrEqual(4);
  });

  it('the next print is never more than 45° off the way you are walking', () => {
    const w = fakeWorld();
    for (let seed = 1; seed <= 40; seed++) {
      for (const tier of [1, 2, 3] as const) {
        const ps = makeTrail(w, START, seed, tier, { forward: Math.PI }).prints;
        for (let i = 2; i < ps.length; i++) {
          const a = Math.atan2(ps[i - 1].x - ps[i - 2].x, ps[i - 1].z - ps[i - 2].z);
          const b = Math.atan2(ps[i].x - ps[i - 1].x, ps[i].z - ps[i - 1].z);
          expect(Math.abs(Math.atan2(Math.sin(b - a), Math.cos(b - a)))).toBeLessThan(Math.PI / 4);
        }
      }
    }
  });

  it('hides the toy only where the sky is open (and beside the last print)', () => {
    const w = { ...fakeWorld(), openSky: (x: number, z: number) => !(z > 8 && x > -20) };
    for (let seed = 1; seed <= 40; seed++) {
      const t = makeTrail(w, START, seed, 1);
      expect(w.openSky(t.end.x, t.end.z)).toBe(true);
      const last = t.prints[t.prints.length - 1];
      expect(Math.hypot(t.end.x - last.x, t.end.z - last.z)).toBeCloseTo(TRAIL.endBeside, 5);
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

describe('session: one round = one trail = one toy', () => {
  const straight = (seed: number, tier: 1 | 2 | 3): Trail => {
    const prints = Array.from({ length: 12 }, (_, i) => ({ x: i * TRAIL.spacing[tier], y: 0, z: seed % 97, yaw: Math.PI / 2 }));
    const last = prints[prints.length - 1];
    return { prints, end: { ...last, x: last.x + 1 }, spacing: TRAIL.spacing[tier], length: 11 * TRAIL.spacing[tier], candidate: 0, angle: 0, valid: true };
  };
  const walk = (s: ToySession): ToyEvent[] => {
    const ev: ToyEvent[] = [];
    for (const p of s.trail().prints) ev.push(...s.update(1 / 60, p.x, p.z));
    return ev;
  };
  const wait = (s: ToySession, seconds: number): ToyEvent[] => {
    const ev: ToyEvent[] = [];
    for (let t = 0; t < seconds; t += 0.1) ev.push(...s.update(0.1, 1e4, 1e4));
    return ev;
  };

  it('three toys, tiers 1 → 2 → 3, worth 5 / 7 / 10 + 10 for the full basket; then free play pays 2', () => {
    const s = new ToySession(straight);
    s.reset(42);
    expect(s.state).toBe('idle');
    expect(walk(s), 'no trail before GO').toEqual([]);
    const found: ToyEvent[] = [];
    const landed: ToyEvent[] = [];
    for (let k = 0; k < 3; k++) {
      expect(s.tier).toBe(k + 1);
      s.begin();
      expect(s.state).toBe('trail');
      expect(s.trail().spacing).toBe(TRAIL.spacing[(k + 1) as 1 | 2 | 3]);
      const ev = walk(s);
      expect(ev.filter((e) => e.type === 'print')).toHaveLength(12);
      found.push(...ev.filter((e) => e.type === 'found'));
      expect(s.state).toBe('show');
      expect(s.found, 'the lamp lights at the find').toBe(k + 1);
      expect(s.inBasket, 'it is not in the basket yet').toBe(k);
      landed.push(...wait(s, LAND_AT + 0.2).filter((e) => e.type === 'landed'));
      expect(s.state).toBe('idle');
      expect(s.inBasket).toBe(k + 1);
    }
    expect(found).toEqual([
      { type: 'found', toy: 0, free: false, tier: 1, gems: 5 },
      { type: 'found', toy: 1, free: false, tier: 2, gems: 7 },
      { type: 'found', toy: 2, free: false, tier: 3, gems: 20 },
    ]);
    expect(landed).toEqual([
      { type: 'landed', toy: 0, free: false, full: false },
      { type: 'landed', toy: 1, free: false, full: false },
      { type: 'landed', toy: 2, free: false, full: true },
    ]);
    expect(s.done).toBe(true);
    // Free play: still a trail (tier 3), a small prize, the toy lands on top of the pile.
    s.begin();
    expect(s.free).toBe(true);
    expect(s.tier).toBe(3);
    const ev = walk(s);
    expect(ev.find((e) => e.type === 'found')).toMatchObject({ free: true, gems: TOYS.freePlayGems, tier: 3 });
    expect(wait(s, LAND_AT + 0.2).filter((e) => e.type === 'landed')).toEqual([{ type: 'landed', toy: s.toy, free: true, full: false }]);
    expect(s.found).toBe(3);
    expect(s.inBasket).toBe(3);
    expect(s.topToy).toBe(s.toy);
    // A new session starts over.
    s.reset(43);
    expect([s.found, s.inBasket, s.topToy, s.tier, s.state]).toEqual([0, 0, -1, 1, 'idle']);
  });

  it('times out 75 s after GO: a miss of that tier; the same toy waits for the next round on a new trail', () => {
    const s = new ToySession(straight);
    s.reset(7);
    s.begin();
    const seed = s.seed;
    s.update(1 / 60, s.trail().prints[0].x, s.trail().prints[0].z);
    const ev = wait(s, TOYS.timeout + 0.2);
    expect(ev.filter((e) => e.type === 'timeout')).toEqual([{ type: 'timeout', tier: 1 }]);
    expect(s.state).toBe('idle');
    expect(s.found).toBe(0);
    expect(wait(s, 200)).toEqual([]);
    s.begin();
    expect(s.tier).toBe(1);
    expect(s.toy).toBe(0);
    expect(s.seed).not.toBe(seed);
    expect(s.next).toBe(0);
  });

  it('a cancelled round drops the trail with no result; a flying toy still lands (settle)', () => {
    const s = new ToySession(straight);
    s.reset(5);
    s.begin();
    s.update(1 / 60, s.trail().prints[0].x, s.trail().prints[0].z);
    s.stop();
    expect(s.state).toBe('idle');
    expect(wait(s, 100)).toEqual([]);
    s.begin();
    walk(s);
    s.stop();
    expect(s.state, 'stop does not drop a found toy').toBe('show');
    expect(s.settle()).toEqual([{ type: 'landed', toy: 0, free: false, full: false }]);
    expect(s.inBasket).toBe(1);
  });

  it('trail seeds are deterministic per session seed and new for every round', () => {
    const a = new ToySession(straight);
    const b = new ToySession(straight);
    a.reset(99);
    b.reset(99);
    a.begin();
    b.begin();
    expect(a.seed).toBe(b.seed);
    expect(a.seed).toBe(trailSeed(99, 0));
    a.stop();
    a.begin();
    expect(a.seed).toBe(trailSeed(99, 1));
    b.reset(100);
    b.begin();
    expect(a.seed).not.toBe(b.seed);
  });
});

describe('booth: rules, prizes, demo, basket', () => {
  it('prize table: 5 / 7 / 10 + bonus 10 with the third toy, 2 in free play', () => {
    expect([0, 1, 2].map((t) => toyPrize(t, false))).toEqual([5, 7, 20]);
    expect(toyPrize(0, true)).toBe(TOYS.freePlayGems);
    expect(TOYS.freePlayGems).toBeLessThan(TOYS.gems[1]);
  });

  it('one-try rounds pay the live prize of the toy found; a time-out pays nothing; tier = toy number', () => {
    let now = 5;
    const m = new RoundMachine(toyRules(livePrize(() => now)));
    expect(m.rules.tries).toBe(1);
    const run = (hit: boolean): number => {
      m.start();
      let paid = 0;
      for (let i = 0; i < 2000 && m.phase !== 'play'; i++) m.step(0.05);
      m.report(hit);
      for (let i = 0; i < 2000 && m.phase !== 'idle'; i++) for (const e of m.step(0.05)) if (e.type === 'pay') paid += e.gems;
      return paid;
    };
    expect(m.tier).toBe(1);
    expect(run(false)).toBe(0);
    expect(m.tier, 'a time-out never lowers the tier').toBe(1);
    expect(run(true)).toBe(5);
    expect(m.tier).toBe(2);
    now = 20;
    expect(run(true)).toBe(20);
    expect(m.rules.leaveRadius).toBeGreaterThan(46);
    expect(m.rules.stall).toBeGreaterThan(TOYS.timeout);
  });

  it('the demo is a 4–6 frame flipbook; the booth has three lamps and a press pad', () => {
    expect(TOYS_DEMO.frames).toBeGreaterThanOrEqual(4);
    expect(TOYS_DEMO.frames).toBeLessThanOrEqual(6);
    expect(TOY_BOOTH.lamps).toBe(TOYS.perSession);
    expect(TOY_BOOTH.pad.walkIn).toBe(false);
    expect(TOY_BOOTH.playPrompt).toBe('follow');
  });

  it('booth, pad, basket and bowl stay inside the 6 m site circle', () => {
    const b = buildBoothGeometry(TOY_BOOTH);
    const box = b.marqueeBox;
    for (const x of [box.min.x, box.max.x]) for (const z of [box.min.z, box.max.z]) expect(Math.hypot(x, z)).toBeLessThan(6);
    expect(Math.hypot(SPOT.pad.x, SPOT.pad.z) + SPOT.pad.r).toBeLessThan(6);
    expect(Math.hypot(SPOT.basket.x, SPOT.basket.z) + 1.1).toBeLessThan(6);
    expect(Math.hypot(SPOT.bowl.x, SPOT.bowl.z) + 0.4).toBeLessThan(6);
    for (const d of TOY_BOOTH.decals ?? []) expect(Math.hypot(d.x, d.z)).toBeLessThan(6);
    b.geometry.dispose();
  });

  it('the basket merges into the booth geometry: one mesh, kit slots untouched, re-posable', () => {
    const b = buildBoothGeometry(TOY_BOOTH);
    const geo = b.geometry;
    const before = geo.getAttribute('position').count;
    const uv0 = Float32Array.from(geo.getAttribute('uv').array as Float32Array);
    const keep = geo.getAttribute('uv');
    const extra = basketGeometry({ x: 1.5, y: 0, z: 0.5 });
    const r = appendToBooth(geo, extra);
    expect(geo.getAttribute('uv')).toBe(keep);
    expect(r.start).toBe(before);
    expect(geo.getAttribute('position').count).toBe(before + r.count);
    for (const name of ['normal', 'uv', 'color']) expect(geo.getAttribute(name).count).toBe(before + r.count);
    expect(Array.from((geo.getAttribute('uv').array as Float32Array).subarray(0, uv0.length))).toEqual(Array.from(uv0));
    const tris = geo.getAttribute('position').count / 3;
    console.info(`toys booth + basket: ${tris} triangles (basket ${r.count / 3})`);
    expect(tris).toBeLessThanOrEqual(2200);
    poseRange(geo, r, new THREE.Matrix4().makeTranslation(0, 1, 0));
    expect((geo.getAttribute('position').array as Float32Array)[r.start * 3 + 1]).toBeCloseTo(r.rest[1] + 1, 5);
    poseRange(geo, r, null);
    expect((geo.getAttribute('position').array as Float32Array)[r.start * 3 + 1]).toBeCloseTo(r.rest[1], 5);
    extra.dispose();
    geo.dispose();
  });
});
