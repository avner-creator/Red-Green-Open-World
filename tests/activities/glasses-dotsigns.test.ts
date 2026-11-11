import { describe, expect, it } from 'vitest';
import { DEMO_KIT } from '../../src/activities/glasses/booth/draw';
import { fullRules, prizeFor, stepTier } from '../../src/activities/glasses/booth/round';
import { simulate } from '../../src/activities/glasses/booth/sim';
import { DOT_BOOTH, DOT_PRIZE, DOT_RULES, DOT_TIERS } from '../../src/activities/glasses/dotsigns/constants';
import { DOT_DEMO } from '../../src/activities/glasses/dotsigns/demo';
import { shapeImageMask } from '../../src/activities/glasses/dotsigns/picto';
import { answerShape, isDotRound, makeDotRound } from '../../src/activities/glasses/dotsigns/round';
import { generateDotPicture } from '../../src/vision/toolkit/dotPicture';
import { shapeContains, SHAPE_IDS } from '../../src/vision/toolkit/shapes';
import { mulberry32 } from '../../src/vision/toolkit/rng';

describe('dot-picture rounds', () => {
  it('three different shapes, the answer always among them, a positive seed', () => {
    const rng = mulberry32(3);
    for (let n = 0; n < 2000; n++) {
      const r = makeDotRound(rng);
      expect(isDotRound(r)).toBe(true);
      expect(new Set(r.shapes).size).toBe(3);
      expect(r.shapes).toContain(answerShape(r));
      expect(r.seed).toBeGreaterThan(0);
    }
  });

  it('the button order says nothing about the answer', () => {
    const rng = mulberry32(42);
    const N = 9000;
    const pos = [0, 0, 0];
    // Answer position given the shape on the first button, and "the answer is the alphabetically
    // first of the three": both must look like chance.
    const byFirst = new Map<string, number[]>();
    let alphaFirst = 0;
    for (let n = 0; n < N; n++) {
      const r = makeDotRound(rng);
      pos[r.answer]++;
      const row = byFirst.get(r.shapes[0]) ?? [0, 0, 0];
      row[r.answer]++;
      byFirst.set(r.shapes[0], row);
      if ([...r.shapes].sort()[0] === answerShape(r)) alphaFirst++;
    }
    for (const p of pos) expect(Math.abs(p / N - 1 / 3)).toBeLessThan(0.025);
    expect(Math.abs(alphaFirst / N - 1 / 3)).toBeLessThan(0.025);
    for (const [shape, row] of byFirst) {
      const total = row[0] + row[1] + row[2];
      for (const c of row) expect(Math.abs(c / total - 1 / 3), shape).toBeLessThan(0.07);
    }
  });

  it('the strong-eye dots come from the seed only; the weak dots alone carry no shape', () => {
    for (const cells of [DOT_TIERS[1].cells, DOT_TIERS[3].cells]) {
      const a = generateDotPicture('star', 1234, cells);
      const b = generateDotPicture('moon', 1234, cells);
      expect(Array.from(a.strongCells)).toEqual(Array.from(b.strongCells));
      expect(Array.from(a.weakCells)).not.toEqual(Array.from(b.weakCells));
      // Over many seeds the weak density inside the shape equals the density outside it.
      let inOn = 0;
      let inN = 0;
      let outOn = 0;
      let outN = 0;
      for (let seed = 1; seed <= 300; seed++) {
        const p = generateDotPicture('heart', seed, cells);
        for (let i = 0; i < p.mask.length; i++) {
          if (p.mask[i]) {
            inN++;
            inOn += p.weakCells[i];
          } else {
            outN++;
            outOn += p.weakCells[i];
          }
        }
      }
      expect(Math.abs(inOn / inN - 0.5)).toBeLessThan(0.02);
      expect(Math.abs(outOn / outN - 0.5)).toBeLessThan(0.02);
    }
  });

  it('rejects malformed forced rounds', () => {
    expect(isDotRound({ shapes: ['star', 'star', 'moon'], answer: 0, seed: 1 })).toBe(false);
    expect(isDotRound({ shapes: ['star', 'blob', 'moon'], answer: 0, seed: 1 })).toBe(false);
    expect(isDotRound({ shapes: ['star', 'heart', 'moon'], answer: 3, seed: 1 })).toBe(false);
    expect(isDotRound({ shapes: ['star', 'heart', 'moon'], answer: 2, seed: 1 })).toBe(true);
  });
});

describe('button pictograms', () => {
  it('are drawn from the same masks as the dot pictures, with an outline ring', () => {
    for (const id of SHAPE_IDS) {
      const px = 64;
      const scale = 21;
      const { inside, ring } = shapeImageMask(id, px, scale, 3);
      let nIn = 0;
      let nRing = 0;
      for (let j = 0; j < px; j++)
        for (let i = 0; i < px; i++) {
          const k = j * px + i;
          const x = (i + 0.5 - px / 2) / scale;
          const y = (px / 2 - (j + 0.5)) / scale;
          expect(inside[k], `${id} ${i},${j}`).toBe(shapeContains(id, x, y) ? 1 : 0);
          nIn += inside[k];
          nRing += ring[k];
          expect(inside[k] && ring[k]).toBeFalsy();
        }
      expect(nIn, id).toBeGreaterThan(200);
      expect(nRing, id).toBeGreaterThan(60);
    }
  });
});

describe('dot tiers and rewards', () => {
  it('finer tiers have more cells and smaller dots, down to a floor that still resolves', () => {
    expect(DOT_TIERS[2].cells).toBeGreaterThan(DOT_TIERS[1].cells);
    expect(DOT_TIERS[3].cells).toBeGreaterThan(DOT_TIERS[2].cells);
    expect(DOT_TIERS[3].cells).toBeLessThanOrEqual(28);
    expect(DOT_TIERS[2].dotScale).toBeLessThan(DOT_TIERS[1].dotScale);
    expect(DOT_TIERS[3].dotScale).toBeLessThan(DOT_TIERS[2].dotScale);
    expect(DOT_TIERS[3].dotScale).toBeGreaterThanOrEqual(0.6);
  });

  it('5 pictures a round (= 5 lamps), a prize from 3 right, 5 of 5 is the jackpot; finer pays more', () => {
    expect(DOT_RULES.tries).toBe(5);
    expect(DOT_BOOTH.lamps).toBe(5);
    expect(DOT_BOOTH.pad.walkIn).toBe(false);
    for (const tier of [1, 2, 3] as const) {
      for (let h = 0; h < 3; h++) expect(prizeFor(DOT_RULES, h, tier)).toBe(0);
      expect(prizeFor(DOT_RULES, 4, tier)).toBeGreaterThan(prizeFor(DOT_RULES, 3, tier));
      expect(prizeFor(DOT_RULES, 5, tier)).toBeGreaterThanOrEqual(1.7 * prizeFor(DOT_RULES, 4, tier));
      if (tier > 1) expect(DOT_PRIZE[tier][5]).toBeGreaterThan(DOT_PRIZE[(tier - 1) as 1 | 2][5]);
    }
  });

  it('the tier steps per round: up after 4 or 5 right, down after 2 or fewer', () => {
    const r = fullRules(DOT_RULES);
    expect([5, 4, 3, 2, 0].map((h) => stepTier(2, h, r.upAt, r.downBelow))).toEqual([3, 3, 2, 1, 1]);
  });

  // A bot mashes the button it stands at (0.4 s); a child who reads the picture takes ~2 s.
  const bot = { hitP: 1 / 3, tryTime: 0.4, restart: 0.5 };
  const kid = { hitP: 1, tryTime: 2, restart: 1.5 };

  it('a random-guess bot earns ≤ 6 gems per minute at every tier', () => {
    for (const fixedTier of [undefined, 1, 2, 3] as const) {
      const r = simulate(DOT_RULES, { ...bot, minutes: 600, fixedTier, seed: 11 });
      console.info(`dotsigns bot, tier ${fixedTier ?? 'staircase'}: ${r.gemsPerMinute.toFixed(2)} gems/min`);
      expect(r.gemsPerMinute, `tier ${fixedTier ?? 'staircase'}`).toBeLessThanOrEqual(6);
    }
  });

  it('a child who sees the shape earns ≥ 25 gems per minute, even at tier 1', () => {
    const r1 = simulate(DOT_RULES, { ...kid, minutes: 20, fixedTier: 1 });
    const rs = simulate(DOT_RULES, { ...kid, minutes: 20 });
    console.info(`dotsigns perfect: tier 1 ${r1.gemsPerMinute.toFixed(1)}, staircase ${rs.gemsPerMinute.toFixed(1)} gems/min`);
    expect(r1.gemsPerMinute).toBeGreaterThanOrEqual(25);
    expect(rs.gemsPerMinute).toBeGreaterThanOrEqual(r1.gemsPerMinute);
    expect(rs.tierEnd).toBe(3);
  });

  it('the demo flipbook has 4–6 frames and draws each without error', () => {
    expect(DOT_DEMO.frames).toBeGreaterThanOrEqual(4);
    expect(DOT_DEMO.frames).toBeLessThanOrEqual(6);
    const calls: string[] = [];
    const c = new Proxy({}, { get: (_t, k) => (k === 'canvas' ? {} : (..._a: unknown[]) => calls.push(String(k))), set: () => true }) as unknown as CanvasRenderingContext2D;
    for (let f = 0; f < DOT_DEMO.frames; f++) DOT_DEMO.draw(c, f, 256, DEMO_KIT);
    expect(calls.length).toBeGreaterThan(100);
  });
});
