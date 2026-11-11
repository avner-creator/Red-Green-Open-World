import { describe, expect, it } from 'vitest';
import { generateDotPicture, strongPattern, DOT_CELLS } from '../../src/vision/toolkit/dotPicture';
import { rasterizeShape, SHAPE_IDS } from '../../src/vision/toolkit/shapes';

describe('shape library', () => {
  it('has at least 8 bold shapes that each fill a sensible part of the grid', () => {
    expect(SHAPE_IDS.length).toBeGreaterThanOrEqual(8);
    for (const id of SHAPE_IDS) {
      const m = rasterizeShape(id, DOT_CELLS);
      const frac = m.reduce((s, v) => s + v, 0) / m.length;
      expect(frac, id).toBeGreaterThan(0.18);
      expect(frac, id).toBeLessThan(0.65);
      // A margin of empty cells all round, so the shape's outline is complete.
      for (let i = 0; i < DOT_CELLS; i++) {
        expect(m[i], `${id} top`).toBe(0);
        expect(m[(DOT_CELLS - 1) * DOT_CELLS + i], `${id} bottom`).toBe(0);
        expect(m[i * DOT_CELLS], `${id} left`).toBe(0);
        expect(m[i * DOT_CELLS + DOT_CELLS - 1], `${id} right`).toBe(0);
      }
    }
  });

  it('shapes are pairwise clearly different', () => {
    const masks = SHAPE_IDS.map((id) => rasterizeShape(id, DOT_CELLS));
    for (let a = 0; a < masks.length; a++) {
      for (let b = a + 1; b < masks.length; b++) {
        let diff = 0;
        for (let i = 0; i < masks[a].length; i++) diff += masks[a][i] ^ masks[b][i];
        expect(diff, `${SHAPE_IDS[a]} vs ${SHAPE_IDS[b]}`).toBeGreaterThan(40);
      }
    }
  });
});

describe('dot picture generator', () => {
  it('the strong pattern is identical for every shape at the same seed (and comes from the seed only)', () => {
    for (const seed of [1, 7, 12345]) {
      const ref = strongPattern(seed);
      for (const id of SHAPE_IDS) expect(generateDotPicture(id, seed).strongCells).toEqual(ref);
    }
  });

  it('W XOR S is exactly the shape mask', () => {
    for (const id of SHAPE_IDS) {
      for (const seed of [3, 99]) {
        const p = generateDotPicture(id, seed);
        for (let i = 0; i < p.mask.length; i++) expect(p.weakCells[i] ^ p.strongCells[i]).toBe(p.mask[i]);
      }
    }
  });

  it('different seeds give different patterns', () => {
    const a = generateDotPicture('star', 1);
    const b = generateDotPicture('star', 2);
    let d = 0;
    for (let i = 0; i < a.strongCells.length; i++) d += a.strongCells[i] ^ b.strongCells[i];
    expect(d).toBeGreaterThan(a.strongCells.length * 0.35);
  });

  it('each pattern alone carries no shape: occupancy inside vs outside is statistically equal', () => {
    // Over many seeds the weak pattern's dot rate inside the shape must match the rate outside
    // (both 50 %); same for the strong pattern. A z-test on the pooled counts.
    const seeds = 400;
    for (const id of SHAPE_IDS) {
      let wIn = 0;
      let wOut = 0;
      let sIn = 0;
      let nIn = 0;
      let nOut = 0;
      for (let seed = 1; seed <= seeds; seed++) {
        const p = generateDotPicture(id, seed * 7919);
        for (let i = 0; i < p.mask.length; i++) {
          if (p.mask[i]) {
            nIn++;
            wIn += p.weakCells[i];
            sIn += p.strongCells[i];
          } else {
            nOut++;
            wOut += p.weakCells[i];
          }
        }
      }
      const pIn = wIn / nIn;
      const pOut = wOut / nOut;
      const se = Math.sqrt(0.25 / nIn + 0.25 / nOut);
      expect(Math.abs(pIn - pOut) / se, `${id} weak in/out z`).toBeLessThan(4);
      expect(Math.abs(pIn - 0.5), id).toBeLessThan(0.01);
      expect(Math.abs(sIn / nIn - 0.5), id).toBeLessThan(0.01);
    }
  });

  it('a single pattern is spatially uncorrelated with the shape for one seed too', () => {
    // One picture: the weak dots inside the shape are ~50 % (no solid or empty silhouette).
    for (const id of SHAPE_IDS) {
      const p = generateDotPicture(id, 2024);
      let inside = 0;
      let dots = 0;
      for (let i = 0; i < p.mask.length; i++) {
        if (!p.mask[i]) continue;
        inside++;
        dots += p.weakCells[i];
      }
      expect(dots / inside, id).toBeGreaterThan(0.38);
      expect(dots / inside, id).toBeLessThan(0.62);
    }
  });
});
