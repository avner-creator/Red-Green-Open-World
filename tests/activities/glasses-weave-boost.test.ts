/**
 * Buggy-race glasses part `boost`: pure logic (beat cycle, hot window, pad ahead / pad crossed,
 * judging, tier staircase) and the blind-luck simulation: a child who ignores the weak-eye beat
 * and just drives over pads lands in the hot window at most window / period of the time
 * (28 % at tier 1, 22.5 % at tier 2, 16.7 % at tier 3).
 */
import { describe, expect, it } from 'vitest';
import { seededRng } from '../../src/activities/glasses/idle';
import {
  BOOST,
  cycleAt,
  halfWindowT,
  isHot,
  judge,
  lapDelta,
  luckRate,
  nearestPad,
  nextPad,
  offsetFor,
  showFade,
  stepTier,
} from '../../src/activities/glasses/weave/boost/logic';
import type { GlassesTier } from '../../src/types';

const TIERS: GlassesTier[] = [1, 2, 3];

describe('boost beat cycle', () => {
  it('cycles steadily with the period and wraps to 0..1', () => {
    expect(cycleAt(0, 0)).toBe(0);
    expect(cycleAt(0, BOOST.period / 2)).toBeCloseTo(0.5);
    expect(cycleAt(0.3, BOOST.period * 7)).toBeCloseTo(0.3);
    expect(cycleAt(0.9, BOOST.period * 0.2)).toBeCloseTo(0.1);
    for (let c = 0; c < 50; c += 0.37) {
      const t = cycleAt(0.42, c);
      expect(t).toBeGreaterThanOrEqual(0);
      expect(t).toBeLessThan(1);
    }
  });

  it('offsetFor puts the cycle at t after the given seconds', () => {
    for (const [t, clock, inS] of [[0.75, 3.1, 0.4], [0.25, 0, 1.7], [0, 12.345, 0]] as const) {
      expect(cycleAt(offsetFor(t, clock, inS), clock + inS)).toBeCloseTo(t, 9);
    }
  });

  it('hot window: exactly ± half the tier window around perfectAt, narrowing by tier', () => {
    for (const tier of TIERS) {
      const h = halfWindowT(tier);
      expect(BOOST.perfectAt - h).toBeGreaterThan(0);
      expect(BOOST.perfectAt + h).toBeLessThan(1);
      expect(isHot(BOOST.perfectAt, tier)).toBe(true);
      expect(isHot(BOOST.perfectAt + h * 0.99, tier)).toBe(true);
      expect(isHot(BOOST.perfectAt - h * 0.99, tier)).toBe(true);
      expect(isHot(BOOST.perfectAt + h * 1.01, tier)).toBe(false);
      expect(isHot(BOOST.perfectAt - 0.5, tier)).toBe(false);
    }
    expect(BOOST.window[1]).toBeGreaterThan(BOOST.window[2]);
    expect(BOOST.window[2]).toBeGreaterThan(BOOST.window[3]);
  });

  it('the beat fades in from 40 m', () => {
    expect(showFade(50)).toBe(0);
    expect(showFade(BOOST.showAhead + 0.01)).toBe(0);
    expect(showFade(BOOST.showAhead - BOOST.fadeIn / 2)).toBeCloseTo(0.5);
    expect(showFade(BOOST.showAhead - BOOST.fadeIn)).toBe(1);
    expect(showFade(0)).toBe(1);
    expect(showFade(-3)).toBe(1);
  });
});

describe('pads ahead and crossed', () => {
  const L = 400;
  const pads = [{ s: 30 }, { s: 120 }, { s: 200 }, { s: 290 }, { s: 360 }];

  it('lapDelta is signed and wraps', () => {
    expect(lapDelta(10, 30, L)).toBe(20);
    expect(lapDelta(390, 30, L)).toBe(40);
    expect(lapDelta(30, 390, L)).toBe(-40);
    expect(lapDelta(-5, 30, L)).toBe(35);
    expect(lapDelta(830, 30, L)).toBe(0);
  });

  it('next pad ahead, including across the start line and on later laps', () => {
    expect(nextPad(pads, -5, L)).toEqual({ index: 0, ahead: 35 });
    expect(nextPad(pads, 100, L)).toEqual({ index: 1, ahead: 20 });
    expect(nextPad(pads, 370, L)).toEqual({ index: 0, ahead: 60 });
    expect(nextPad(pads, 400 + 118, L)).toEqual({ index: 1, ahead: 2 });
    // Just past a pad (within passedBehind) it is still "next"; further on, the following one.
    expect(nextPad(pads, 123, L).index).toBe(1);
    expect(nextPad(pads, 125, L).index).toBe(2);
    expect(nextPad([], 0, L)).toEqual({ index: -1, ahead: Infinity });
  });

  it('the pad crossed is the nearest one along the lap', () => {
    expect(nearestPad(pads, 118, L)).toBe(1);
    expect(nearestPad(pads, 800 + 358, L)).toBe(4);
    expect(nearestPad(pads, 398, L)).toBe(0);
  });

  it('judges only the beat pad, once it was on show; hot = hit, cold = miss', () => {
    const hot = BOOST.perfectAt;
    const cold = BOOST.perfectAt - 0.5;
    expect(judge(1, 1, 1, hot, 1)).toBe('hit');
    expect(judge(1, 1, 1, cold, 1)).toBe('miss');
    expect(judge(2, 1, 1, hot, 1)).toBeNull(); // another pad than the one with the beat
    expect(judge(1, 1, BOOST.minSeen / 2, hot, 1)).toBeNull(); // beat not seen yet
    expect(judge(-1, -1, 1, hot, 1)).toBeNull();
  });
});

describe('tiers and rewards', () => {
  it('up after two hits in a row, down after a miss, clamped 1..3', () => {
    let s = { tier: 1 as GlassesTier, streak: 0 };
    s = stepTier(s.tier, s.streak, true);
    expect(s).toEqual({ tier: 1, streak: 1 });
    s = stepTier(s.tier, s.streak, true);
    expect(s).toEqual({ tier: 2, streak: 0 });
    s = stepTier(s.tier, s.streak, true);
    s = stepTier(s.tier, s.streak, false);
    expect(s).toEqual({ tier: 1, streak: 0 });
    expect(stepTier(1, 0, false)).toEqual({ tier: 1, streak: 0 });
    expect(stepTier(3, 1, true)).toEqual({ tier: 3, streak: 0 });
  });

  it('pays 1 / 2 / 3 gems by tier', () => {
    expect(TIERS.map((t) => BOOST.pay[t])).toEqual([1, 2, 3]);
  });
});

describe('a child who ignores the beat', () => {
  it('by-luck hit rate = window / period: ≤ 30 % at tier 1, lower above', () => {
    expect(luckRate(1)).toBeCloseTo(0.2833, 3);
    expect(luckRate(2)).toBeCloseTo(0.225, 3);
    expect(luckRate(3)).toBeCloseTo(0.1667, 3);
    expect(luckRate(1)).toBeLessThanOrEqual(0.3);
    expect(luckRate(2)).toBeLessThan(luckRate(1));
    expect(luckRate(3)).toBeLessThan(luckRate(2));
  });

  it('simulated: random arrival times land hot at the luck rate, per tier', () => {
    const rng = seededRng(11);
    for (const tier of TIERS) {
      let hot = 0;
      const n = 20000;
      for (let i = 0; i < n; i++) {
        // Random pad phase (as the part picks it) and a random arrival time.
        const offset = rng();
        const arrive = 0.6 + rng() * 4;
        if (isHot(cycleAt(offset, arrive), tier)) hot++;
      }
      expect(hot / n).toBeCloseTo(luckRate(tier), 1);
      expect(hot / n).toBeLessThanOrEqual(0.3);
    }
  });

  it('simulated over many races with the staircase: hits stay rare (≤ 30 %)', () => {
    const rng = seededRng(5);
    let s = { tier: 1 as GlassesTier, streak: 0 };
    let hits = 0;
    const n = 20000;
    for (let i = 0; i < n; i++) {
      const hit = judge(0, 0, 1, cycleAt(rng(), rng() * 10), s.tier) === 'hit';
      if (hit) hits++;
      s = stepTier(s.tier, s.streak, hit);
    }
    expect(hits / n).toBeLessThanOrEqual(0.3);
    expect(hits / n).toBeGreaterThan(0.2);
  });
});
