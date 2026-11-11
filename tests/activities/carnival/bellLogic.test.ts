import { describe, expect, it } from 'vitest';
import {
  BAND_H,
  BELL_HIT_Y,
  BELL_POINTS,
  GOOD,
  MIN_POWER,
  PERFECT,
  POUND_BONUS,
  PUCK_REST,
  STOMPS,
  SWEET_MIN_MOVE,
  SWEET_RANGE,
  bandBottom,
  fallY,
  needleAt,
  peakFor,
  pickSweet,
  pointsFor,
  riseY,
  rings,
  rivalPower,
  scoreOf,
  stompPower,
  tierOf,
} from '../../../src/activities/carnival/games/bellLogic';
import { RIVAL_SKILLS } from '../../../src/activities/carnival/rivals';
import { makeRng } from '../../../src/activities/carnival/rng';

describe('strength bell needle', () => {
  it('starts in the middle and sweeps end to end', () => {
    expect(needleAt(0)).toBeCloseTo(0);
    expect(needleAt(0.6)).toBeCloseTo(1);
    expect(needleAt(1.2)).toBeCloseTo(0);
    expect(needleAt(1.8)).toBeCloseTo(-1);
    expect(needleAt(2.4)).toBeCloseTo(0);
    for (let t = 0; t < 10; t += 0.07) {
      expect(Math.abs(needleAt(t))).toBeLessThanOrEqual(1 + 1e-9);
    }
  });
});

describe('strength bell power and tiers', () => {
  it('rings the bell only inside the perfect zone (or with a ground pound near it)', () => {
    expect(rings(stompPower(0.3, 0.3))).toBe(true);
    expect(rings(stompPower(0.3 + PERFECT * 0.9, 0.3))).toBe(true);
    expect(rings(stompPower(0.3 + PERFECT + 0.05, 0.3))).toBe(false);
    expect(rings(stompPower(0.3 + PERFECT + 0.05, 0.3, POUND_BONUS))).toBe(true);
  });

  it('is forgiving: the whole good zone reaches tier 5', () => {
    expect(tierOf(stompPower(GOOD - 0.01, 0))).toBe(5);
    expect(tierOf(stompPower(-GOOD + 0.01, 0))).toBe(5);
  });

  it('falls off with distance from the sweet spot, never below the minimum', () => {
    let prev = 2;
    for (let d = 0; d <= 1.7; d += 0.05) {
      const p = stompPower(d, 0);
      expect(p).toBeLessThanOrEqual(prev + 1e-9);
      expect(p).toBeGreaterThanOrEqual(MIN_POWER);
      prev = p;
    }
    expect(tierOf(stompPower(1.7, 0))).toBe(1);
  });

  it('scores the tier, or tier 5 + 1 for the bell', () => {
    expect(pointsFor(0)).toBe(1);
    expect(pointsFor(0.5)).toBe(3);
    expect(pointsFor(0.9)).toBe(5);
    expect(pointsFor(1)).toBe(BELL_POINTS);
    expect(scoreOf([1, 1, 1])).toBe(3 * BELL_POINTS);
  });
});

describe('strength bell puck', () => {
  it('peaks inside the band of its tier, or at the bell', () => {
    for (let p = 0; p < 0.97; p += 0.01) {
      const tier = tierOf(p);
      const y = peakFor(p);
      expect(y).toBeGreaterThan(bandBottom(tier));
      expect(y).toBeLessThan(bandBottom(tier) + BAND_H);
    }
    expect(peakFor(1)).toBe(BELL_HIT_Y);
  });

  it('rises from rest to the peak and falls back', () => {
    expect(riseY(4, 0)).toBeCloseTo(PUCK_REST);
    expect(riseY(4, 1)).toBeCloseTo(4);
    expect(fallY(4, 0)).toBeCloseTo(4);
    expect(fallY(4, 1)).toBeCloseTo(PUCK_REST);
  });
});

describe('strength bell sweet spot', () => {
  it('moves to a new place on the dial before every stomp', () => {
    const rng = makeRng(3);
    let prev: number | null = null;
    for (let i = 0; i < 200; i++) {
      const s = pickSweet(rng, prev);
      expect(Math.abs(s)).toBeLessThanOrEqual(SWEET_RANGE);
      if (prev !== null) expect(Math.abs(s - prev)).toBeGreaterThanOrEqual(SWEET_MIN_MOVE - 1e-9);
      prev = s;
    }
  });
});

describe('strength bell rivals', () => {
  it('lose on average to a child who stomps near the sweet spot', () => {
    const rng = makeRng(42);
    const games = 400;
    for (const skill of RIVAL_SKILLS) {
      let total = 0;
      for (let g = 0; g < games; g++) {
        const powers: number[] = [];
        for (let s = 0; s < STOMPS; s++) powers.push(rivalPower(rng, rng() < skill.accuracy));
        total += scoreOf(powers);
      }
      const avg = total / games;
      // A child who lands in the good zone scores at least 5 per stomp.
      expect(avg).toBeLessThan(STOMPS * 5 - 3);
      expect(avg).toBeGreaterThan(STOMPS * 1.5);
    }
  });
});
