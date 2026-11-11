import { describe, expect, it } from 'vitest';
import { prizeFor } from '../../src/activities/glasses/booth/round';
import { DEMO_KIT } from '../../src/activities/glasses/booth/draw';
import { auditDemo } from '../../src/activities/glasses/booth/legibility';
import { ODD, ODD_BOOTH, ODD_PRIZE, ODD_RULES } from '../../src/activities/glasses/oddone/constants';
import { ODD_DEMO } from '../../src/activities/glasses/oddone/demo';
import { detailForLevel, differs, makeRound, nextLevel, OddStaircase, shapesOf, simulateOddOne, tierForLevel, withAnswer } from '../../src/activities/glasses/oddone/logic';
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

  it('level → tier', () => {
    expect([0, 1, 2, 3, 4, 5, 6, 7].map(tierForLevel)).toEqual([1, 1, 2, 2, 3, 3, 3, 3]);
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

describe('odd one out booth: rounds, prizes and the staircase', () => {
  it('5 tries (= 5 lamps), a prize from 3 right, 5 of 5 is the jackpot', () => {
    expect(ODD_RULES.tries).toBe(5);
    expect(ODD_BOOTH.lamps).toBe(5);
    expect(ODD_RULES.minHits).toBe(3);
    expect(ODD_BOOTH.pad.walkIn).toBe(false);
    for (const tier of [1, 2, 3] as const) {
      for (let h = 0; h < 3; h++) expect(prizeFor(ODD_RULES, h, tier)).toBe(0);
      expect(prizeFor(ODD_RULES, 4, tier)).toBeGreaterThan(prizeFor(ODD_RULES, 3, tier));
      // The jackpot is clearly bigger: at least 1.7 × the prize for 4 of 5.
      expect(prizeFor(ODD_RULES, 5, tier)).toBeGreaterThanOrEqual(1.7 * prizeFor(ODD_RULES, 4, tier));
      if (tier > 1) expect(ODD_PRIZE[tier][5]).toBeGreaterThan(ODD_PRIZE[(tier - 1) as 1 | 2][5]);
    }
  });

  it('the staircase runs through every try and across rounds: finer after a hit, coarser after a miss', () => {
    const s = new OddStaircase();
    expect(s.current()).toBe(0);
    for (const h of [true, true, true, false, true]) s.answer(h); // one round: 3 → 2 → 3
    expect(s.current()).toBe(3);
    s.answer(true); // the next round goes on from there
    expect(s.current()).toBe(4);
    expect(tierForLevel(s.current())).toBe(3);
    s.lockLevel = 1;
    s.answer(false);
    expect(s.current()).toBe(1);
    s.reset();
    expect(s.level).toBe(0);
  });

  // A bot mashes a button 0.4 s after a try opens and restarts at once; a child who looks takes ~2 s.
  const bot = { hitP: () => 1 / 3, tryTime: 0.4, restart: 0.5 };
  const kid = { hitP: () => 1, tryTime: 2, restart: 1.5 };

  it('a random-guess bot earns ≤ 6 gems per minute (staircase and every fixed level)', () => {
    for (const lockLevel of [undefined, 0, 2, 4, ODD.maxLevel]) {
      const r = simulateOddOne(ODD_RULES, { ...bot, lockLevel, minutes: 600, seed: 7 });
      console.info(`oddone bot, level ${lockLevel ?? 'staircase'}: ${r.gemsPerMinute.toFixed(2)} gems/min`);
      expect(r.gemsPerMinute, `level ${lockLevel ?? 'staircase'}`).toBeLessThanOrEqual(6);
    }
  });

  it('a child who sees the shapes earns ≥ 25 gems per minute, even at tier 1', () => {
    const r1 = simulateOddOne(ODD_RULES, { ...kid, lockLevel: 0, minutes: 20 });
    const rs = simulateOddOne(ODD_RULES, { ...kid, minutes: 20 });
    console.info(`oddone perfect: tier 1 ${r1.gemsPerMinute.toFixed(1)}, staircase ${rs.gemsPerMinute.toFixed(1)} gems/min`);
    expect(r1.gemsPerMinute).toBeGreaterThanOrEqual(25);
    expect(rs.gemsPerMinute).toBeGreaterThanOrEqual(r1.gemsPerMinute);
    expect(rs.levelEnd).toBe(ODD.maxLevel);
  });

  it('the demo flipbook has 4–6 frames and draws each without error', () => {
    expect(ODD_DEMO.frames).toBeGreaterThanOrEqual(4);
    expect(ODD_DEMO.frames).toBeLessThanOrEqual(6);
    // A recording stand-in for a 2D context: every call is accepted.
    const calls: string[] = [];
    const c = new Proxy({}, { get: (_t, k) => (k === 'canvas' ? {} : (..._a: unknown[]) => calls.push(String(k))), set: () => true }) as unknown as CanvasRenderingContext2D;
    for (let f = 0; f < ODD_DEMO.frames; f++) ODD_DEMO.draw(c, f, 256, DEMO_KIT);
    expect(calls.length).toBeGreaterThan(50);
    // Readable from 8 m: hero ≥ 33 of 100 units where it appears, ≤ 9 pictures a frame.
    const a = auditDemo(ODD_DEMO);
    console.info(`oddone demo: hero ${a.minHeroPx.toFixed(0)} px, ≤ ${a.maxThings} pictures/frame`);
    expect(a.problems).toEqual([]);
  });
});

