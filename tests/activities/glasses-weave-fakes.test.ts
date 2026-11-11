import { describe, expect, it } from 'vitest';
import { buildGemGeometry } from '../../src/activities/gems';
import { eligibleSpots, FAKES, firstEntry, firstTouch, nextLadder, pickSpots, TELLS, triangle } from '../../src/activities/glasses/weave/fakes/logic';
import type { Ladder, SpotInfo } from '../../src/activities/glasses/weave/fakes/logic';
import { DULL_TABLE, fakeGemGeometry } from '../../src/activities/glasses/weave/fakes/look';
import { mulberry32 } from '../../src/vision/toolkit';

const spot = (index: number, x: number, z: number, tag = 'plaza', float = 1.2): SpotInfo => ({ index, x, y: float, z, tag, ground: 0 });

describe('fakes: spot choice', () => {
  it('keeps only low ordinary ground spots outside sites, reserved footprints and anchors', () => {
    const all = [
      spot(0, 0, 0, 'plaza', 4.6), // fountain top
      spot(1, 10, 0, 'rooftop'),
      spot(2, 20, 0, 'trampoline'),
      spot(3, 30, 0, 'skydive'),
      spot(4, 40, 0, 'bridge'),
      spot(5, 50, 0, 'road'),
      spot(6, 60, 0, 'beach'),
      spot(7, 70, 0, 'ranch'),
      spot(8, 80, 0, 'silly'),
      spot(9, 90, 0, 'lighthouse'),
    ];
    const ok = eligibleSpots(all, { circles: [{ x: 70, z: 0, r: 5 }], reserved: (x) => x === 80 });
    expect(ok.map((s) => s.index)).toEqual([6, 9]);
  });

  it('picks four, pairwise ≥ 25 m apart, a plaza spot first, deterministically', () => {
    const cands = Array.from({ length: 30 }, (_, i) => spot(i, (i % 6) * 14, Math.floor(i / 6) * 14, i % 4 ? 'beach' : 'plaza'));
    const a = pickSpots(cands, mulberry32(7));
    const b = pickSpots(cands, mulberry32(7));
    expect(a).toEqual(b);
    expect(a.length).toBe(4);
    expect(a[0].tag).toBe('plaza');
    for (const p of a) for (const q of a) if (p !== q) expect(Math.hypot(p.x - q.x, p.z - q.z)).toBeGreaterThanOrEqual(FAKES.minGap);
  });
});

describe('fakes: cluster geometry', () => {
  it('puts the real gem exactly on corner `answer`, sides ≥ 2 m, spheres never overlap', () => {
    for (let answer = 0; answer < 3; answer++)
      for (const angle of [0, 1, 2.5, 4]) {
        const t = triangle({ x: 5, z: -3 }, answer, angle);
        expect(t[answer].x).toBeCloseTo(5, 9);
        expect(t[answer].z).toBeCloseTo(-3, 9);
        for (let i = 0; i < 3; i++)
          for (let j = i + 1; j < 3; j++) {
            const d = Math.hypot(t[i].x - t[j].x, t[i].z - t[j].z);
            expect(d).toBeCloseTo(FAKES.side, 6);
            expect(d).toBeGreaterThan(FAKES.realRadius + FAKES.fakeRadius + 0.3);
          }
      }
  });
});

describe('fakes: first touch along the path', () => {
  const real = { x: 0, y: 1.2, z: 0 };
  const t = triangle(real, 0, 0);
  const fakes = [
    { x: t[1].x, y: 1.2, z: t[1].z },
    { x: t[2].x, y: 1.2, z: t[2].z },
  ];

  it('firstEntry: inside = 0, misses = null, else the entry fraction', () => {
    expect(firstEntry({ x: 0, y: 0, z: 0 }, { x: 5, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, 1)).toBe(0);
    expect(firstEntry({ x: -5, y: 0, z: 3 }, { x: 5, y: 0, z: 3 }, { x: 0, y: 0, z: 0 }, 1)).toBeNull();
    expect(firstEntry({ x: -5, y: 0, z: 0 }, { x: 5, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, 1)).toBeCloseTo(0.4, 9);
  });

  it('a run through the whole cluster in ONE frame is decided by what it meets first', () => {
    // From far beyond fake 0 straight through it to beyond the real gem.
    const a = { x: fakes[0].x + (fakes[0].x - real.x) * 3, y: 1, z: fakes[0].z + (fakes[0].z - real.z) * 3 };
    const b = { x: real.x - (fakes[0].x - real.x) * 2, y: 1, z: real.z - (fakes[0].z - real.z) * 2 };
    expect(firstTouch(a, b, real, fakes)).toEqual({ first: 'fake', fake: 0 });
    expect(firstTouch(b, a, real, fakes)).toEqual({ first: 'real', fake: -1 });
  });

  it('the real gem collected on an earlier segment counts as first; a gone real gem never does', () => {
    const near = { x: fakes[1].x + 3, y: 1, z: fakes[1].z };
    expect(firstTouch(near, fakes[1], real, fakes, true)).toEqual({ first: 'real', fake: -1 });
    expect(firstTouch(near, fakes[1], null, fakes)).toEqual({ first: 'fake', fake: 1 });
    expect(firstTouch(near, near, real, fakes)).toEqual({ first: null, fake: -1 });
    expect(firstTouch(near, fakes[1], real, [fakes[0], null])).toEqual({ first: null, fake: -1 });
  });
});

describe('fakes: tier ladder and tells', () => {
  it('rises after two hits in a row, falls after a miss, stays in 1..3', () => {
    let l: Ladder = { tier: 1, streak: 0 };
    const seq: number[] = [];
    for (const hit of [true, true, true, true, true, true, false, false, false, true]) {
      l = nextLadder(l, hit);
      seq.push(l.tier);
    }
    expect(seq).toEqual([1, 2, 2, 3, 3, 3, 2, 1, 1, 1]);
    expect(TELLS).toEqual({ 1: 'spin', 2: 'facets', 3: 'sparkle' });
  });

  it('random picking: right about 1 in 3; pays at most +2 per spot per respawn', () => {
    const rng = mulberry32(11);
    let right = 0;
    const N = 30000;
    for (let i = 0; i < N; i++) {
      const answer = Math.floor(rng() * 3);
      const pick = Math.floor(rng() * 3);
      if (pick === answer) right++;
    }
    expect(right / N).toBeGreaterThan(0.32);
    expect(right / N).toBeLessThan(0.346);
    // Upper bound for a random picker: 4 spots, one round each per 45 s respawn, +2 for a hit
    // 1/3 of the time → (4 × 60 / 45) × 2 / 3 ≈ 3.6 gems per minute (a child who sees: ≤ 10.7).
    const perMinute = ((FAKES.count * 60) / 45) * FAKES.bonus * (right / N);
    expect(perMinute).toBeLessThan(3.7);
  });
});

describe('fakes: the look', () => {
  const arr = (g: ReturnType<typeof fakeGemGeometry>, n: string): number[] => Array.from(g.getAttribute(n).array as Float32Array);

  it('with no tell it is the real Glow Gem, vertex for vertex and grey for grey', () => {
    const real = buildGemGeometry();
    const same = fakeGemGeometry();
    expect(arr(same, 'position')).toEqual(arr(real, 'position'));
    expect(arr(same, 'color')).toEqual(arr(real, 'color'));
  });

  it('tier 2 differs only in facets (5), tier 3 only in shading: no bright table, no facet stripes', () => {
    const real = buildGemGeometry();
    const five = fakeGemGeometry(5);
    expect(five.getAttribute('position').count).toBe((real.getAttribute('position').count / 8) * 5);
    const dull = fakeGemGeometry(undefined, false);
    expect(arr(dull, 'position')).toEqual(arr(real, 'position'));
    const a = arr(real, 'color');
    const b = arr(dull, 'color');
    expect(a.filter((v, i) => v !== b[i]).length).toBeGreaterThan(a.length / 2);
    expect(Math.max(...a)).toBe(1);
    expect(Math.max(...b)).toBeLessThan(0.9);
    expect(b).toContain(Math.fround(DULL_TABLE));
  });
});
