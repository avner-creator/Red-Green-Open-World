import { describe, expect, it } from 'vitest';
import { HALF_SHAPES, halfOutline, pickCandidates, randomSymbol, sameSymbol, symbolOutline } from '../../src/vision/toolkit/halfSymbols';
import type { HalfSymbol } from '../../src/vision/toolkit/halfSymbols';
import { mulberry32 } from '../../src/vision/toolkit/rng';

const ALL: HalfSymbol[] = HALF_SHAPES.flatMap((left) => HALF_SHAPES.map((right) => ({ left, right })));

describe('half shapes', () => {
  it('has at least 4 shapes per side, each joining the axis at top and bottom', () => {
    expect(HALF_SHAPES.length).toBeGreaterThanOrEqual(4);
    for (const s of HALF_SHAPES) {
      const l = halfOutline(s, 'left');
      expect(l[0]).toEqual([0, 1]);
      expect(l[l.length - 1]).toEqual([0, -1]);
      for (const [x] of l) expect(x).toBeLessThanOrEqual(1e-9);
      const r = halfOutline(s, 'right');
      expect(r[0]).toEqual([0, -1]);
      expect(r[r.length - 1]).toEqual([0, 1]);
      for (const [x] of r) expect(x).toBeGreaterThanOrEqual(-1e-9);
    }
  });

  it('every left + right makes one closed outline spanning both sides', () => {
    for (const s of ALL) {
      const o = symbolOutline(s);
      expect(Math.min(...o.map((p) => p[0]))).toBeLessThan(-0.5);
      expect(Math.max(...o.map((p) => p[0]))).toBeGreaterThan(0.5);
    }
  });
});

describe('pickCandidates: neither half alone identifies the answer', () => {
  it('holds for every answer and many seeds', () => {
    for (const answer of ALL) {
      for (let seed = 1; seed <= 25; seed++) {
        const { candidates, answerIndex } = pickCandidates(answer, seed);
        expect(candidates).toHaveLength(3);
        expect(sameSymbol(candidates[answerIndex], answer)).toBe(true);
        // All three are different symbols: only the whole symbol is unique.
        for (let i = 0; i < 3; i++) for (let j = i + 1; j < 3; j++) expect(sameSymbol(candidates[i], candidates[j])).toBe(false);
        // The answer's left half alone matches at least 2 candidates; so does its right half.
        expect(candidates.filter((c) => c.left === answer.left).length).toBeGreaterThanOrEqual(2);
        expect(candidates.filter((c) => c.right === answer.right).length).toBeGreaterThanOrEqual(2);
        expect(candidates.filter((c) => sameSymbol(c, answer)).length).toBe(1);
      }
    }
  });

  it('is deterministic per seed and spreads the answer over all positions', () => {
    const a: HalfSymbol = { left: 'round', right: 'spiky' };
    expect(pickCandidates(a, 5)).toEqual(pickCandidates(a, 5));
    const seen = new Set<number>();
    for (let s = 0; s < 40; s++) seen.add(pickCandidates(a, s).answerIndex);
    expect(seen.size).toBe(3);
  });

  it('randomSymbol covers all shapes', () => {
    const rng = mulberry32(1);
    const lefts = new Set<string>();
    const rights = new Set<string>();
    for (let i = 0; i < 200; i++) {
      const s = randomSymbol(rng);
      lefts.add(s.left);
      rights.add(s.right);
    }
    expect(lefts.size).toBe(HALF_SHAPES.length);
    expect(rights.size).toBe(HALF_SHAPES.length);
  });
});
