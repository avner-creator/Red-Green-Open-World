import { describe, expect, it } from 'vitest';
import { ODD } from '../../src/activities/glasses/oddone/constants';
import { detailForLevel, differs, gemsForTier, makeRound, nextLevel, shapesOf, tierForLevel, withAnswer } from '../../src/activities/glasses/oddone/logic';
import { mulberry32 } from '../../src/vision/toolkit/rng';

describe('odd one out staircase', () => {
  it('a hit makes it finer, a miss coarser, clamped to 0..maxLevel', () => {
    expect(nextLevel(0, true)).toBe(1);
    expect(nextLevel(3, true)).toBe(4);
    expect(nextLevel(3, false)).toBe(2);
    expect(nextLevel(0, false)).toBe(0);
    expect(nextLevel(ODD.maxLevel, true)).toBe(ODD.maxLevel);
    let l = 0;
    for (let i = 0; i < 20; i++) l = nextLevel(l, true);
    expect(l).toBe(ODD.maxLevel);
    for (let i = 0; i < 20; i++) l = nextLevel(l, false);
    expect(l).toBe(0);
  });

  it('level → tier → gems', () => {
    expect([0, 1, 2, 3, 4, 5, 6, 7].map(tierForLevel)).toEqual([1, 1, 2, 2, 3, 3, 3, 3]);
    expect([gemsForTier(1), gemsForTier(2), gemsForTier(3)]).toEqual([2, 3, 5]);
  });

  it('level 0 = different shapes, 1 = arrows, 2+ = rings with a gap', () => {
    const rng = mulberry32(1);
    for (let i = 0; i < 40; i++) {
      const r0 = makeRound(0, rng);
      expect(r0.common.kind).not.toBe(r0.odd.kind);
      const r1 = makeRound(1, rng);
      expect([r1.common.kind, r1.odd.kind]).toEqual(['arrow', 'arrow']);
      expect(r1.common.dir).not.toBe(r1.odd.dir);
      for (const l of [2, 3, 5, ODD.maxLevel]) {
        const r = makeRound(l, rng);
        expect([r.common.kind, r.odd.kind]).toEqual(['ring', 'ring']);
        expect(differs(r.common, r.odd)).toBe(true);
      }
    }
  });

  it('detail gets finer from level 2 up to a solvable floor', () => {
    const d = [2, 3, 4, 5, 6, 7].map(detailForLevel);
    for (let i = 1; i < d.length; i++) {
      expect(d[i].gap).toBeLessThan(d[i - 1].gap);
      expect(d[i].size).toBeLessThan(d[i - 1].size);
    }
    expect(detailForLevel(2).size).toBeCloseTo(ODD.size.base);
    expect(detailForLevel(99).gap).toBeCloseTo(ODD.gap.floor);
    expect(detailForLevel(99).size).toBeCloseTo(ODD.size.floor);
    // Floor still readable: the gap is at least ~10 cm and the ring at least 0.6 m.
    expect(ODD.gap.floor).toBeGreaterThanOrEqual(0.1);
    expect(ODD.size.floor).toBeGreaterThanOrEqual(0.6);
  });

  it('every answer position uses the same shapes; only the position of the odd one moves', () => {
    const r = makeRound(4, mulberry32(9), 0);
    const all = [0, 1, 2].map((a) => shapesOf(withAnswer(r, a)));
    for (let a = 0; a < 3; a++) {
      expect(all[a].filter((s) => s === r.odd)).toHaveLength(1);
      expect(all[a].filter((s) => s === r.common)).toHaveLength(2);
      expect(all[a][a]).toBe(r.odd);
    }
    // Same multiset of shapes → same total coverage for every answer.
    const key = (xs: typeof all[0]): string => xs.map((s) => `${s.kind}:${s.dir}`).sort().join('|');
    expect(key(all[0])).toBe(key(all[1]));
    expect(key(all[1])).toBe(key(all[2]));
  });

  it('answers are spread over all three positions and the same seed gives the same rounds', () => {
    const count = [0, 0, 0];
    const rng = mulberry32(3);
    for (let i = 0; i < 300; i++) count[makeRound(2, rng).answer]++;
    for (const c of count) expect(c).toBeGreaterThan(70);
    const a = mulberry32(5);
    const b = mulberry32(5);
    expect(makeRound(3, a)).toEqual(makeRound(3, b));
  });
});
