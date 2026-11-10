import { describe, expect, it } from 'vitest';
import { PLAYER } from '../../src/config';
import {
  PadChain,
  ThresholdAwards,
  apexFromSpeed,
  boostedApex,
  boostedPadApex,
  flightTime,
  launchStars,
  nextBounceApex,
  padLocalPositions,
  pushSpeed,
  speedFromApex,
  trickStars,
} from '../../src/activities/bounceLogic';
import { BOUNCE, BOUNCE_STARS, PADS } from '../../src/activities/constants';

describe('bounce maths', () => {
  it('apex and speed are inverse with PLAYER.gravity', () => {
    for (const h of [3, 8, 25, 45]) {
      expect(apexFromSpeed(speedFromApex(h))).toBeCloseTo(h, 6);
    }
    expect(speedFromApex(45)).toBeCloseTo(Math.sqrt(2 * PLAYER.gravity * 45), 6);
  });

  it('flight time matches 2v/g', () => {
    expect(flightTime(10)).toBeCloseTo((2 * speedFromApex(10)) / PLAYER.gravity, 6);
  });
});

describe('giant trampoline progression', () => {
  it('walking on is already a ~12 m bounce, jump held or not', () => {
    expect(nextBounceApex(0, false)).toBeCloseTo(12);
    expect(nextBounceApex(0, true)).toBeCloseTo(12);
  });

  it('holding jump grows each bounce x1.5 and reaches the 45 m cap within five bounces', () => {
    let apex = nextBounceApex(0, true);
    const seen = [apex];
    for (let i = 0; i < 10; i++) {
      const next = nextBounceApex(apex, true);
      expect(next).toBeGreaterThanOrEqual(apex);
      apex = next;
      seen.push(apex);
    }
    expect(seen[1]).toBeCloseTo(18);
    expect(seen[2]).toBeCloseTo(27);
    expect(seen[3]).toBeCloseTo(40.5);
    expect(seen[4]).toBe(45);
    expect(Math.max(...seen)).toBe(BOUNCE.maxHeight);
  });

  it('the 45 m cap is about 150 ft', () => {
    expect(BOUNCE.maxHeight / 0.3048).toBeGreaterThan(145);
  });

  it('not holding decays gently and stops, so kids can get off', () => {
    let apex = 12;
    let steps = 0;
    while (apex > 0 && steps < 20) {
      const next = nextBounceApex(apex, false);
      if (next > 0) expect(next).toBeLessThan(apex);
      expect(next === 0 || next >= BOUNCE.stopBelow).toBe(true);
      apex = next;
      steps++;
    }
    expect(apex).toBe(0);
    expect(steps).toBeGreaterThanOrEqual(4); // gentle: several bounces before it stops
    expect(steps).toBeLessThan(10);
  });

  it('a long fall onto the mat starts higher, within the cap', () => {
    expect(nextBounceApex(0, true, 60)).toBeGreaterThan(BOUNCE.firstBounce);
    expect(nextBounceApex(0, true, 10_000)).toBeLessThanOrEqual(BOUNCE.maxFromFall);
    expect(nextBounceApex(0, false, 2)).toBe(BOUNCE.firstBounce);
  });

  it('a bounce never exceeds the cap, even from a huge previous apex', () => {
    expect(nextBounceApex(1000, true)).toBe(BOUNCE.maxHeight);
  });
});

describe('stunt thresholds', () => {
  it('awards 15 / 30 / 45 m as 1 / 2 / 3 stars, each once', () => {
    expect([...BOUNCE_STARS]).toEqual([15, 30, 45]);
    const a = new ThresholdAwards();
    expect(a.reached(12)).toEqual([]);
    expect(a.reached(18).map((t) => [t.height, t.stars])).toEqual([[15, 1]]);
    expect(a.reached(18)).toEqual([]);
    expect(a.reached(45).map((t) => [t.height, t.stars])).toEqual([
      [30, 2],
      [45, 3],
    ]);
    expect(a.reached(45)).toEqual([]);
  });

  it('reset allows awarding again', () => {
    const a = new ThresholdAwards();
    a.reached(45);
    a.reset();
    expect(a.reached(16)).toHaveLength(1);
  });

  it('trick and launch stars', () => {
    expect([1, 2, 3, 4].map(trickStars)).toEqual([1, 1, 2, 2]);
    expect(launchStars(0, true)).toBe(1);
    expect(launchStars(2, true)).toBe(3);
    expect(launchStars(5, true)).toBe(3);
    expect(launchStars(2, false)).toBe(1);
  });
});

describe('bounce pads', () => {
  it('pads are 8 / 15 / 25 m', () => {
    expect([...PADS.heights]).toEqual([8, 15, 25]);
  });

  it('forward push covers the pad spacing over the flight time', () => {
    const v = pushSpeed(PADS.spacing, 8);
    expect(v * flightTime(8)).toBeCloseTo(PADS.spacing, 6);
  });

  it('pad positions keep their spacing', () => {
    const p = padLocalPositions(3, PADS.spacing);
    expect(p).toHaveLength(3);
    expect(Math.hypot(p[1].x - p[0].x, p[1].z - p[0].z)).toBeCloseTo(PADS.spacing, 5);
    expect(Math.hypot(p[2].x - p[1].x, p[2].z - p[1].z)).toBeCloseTo(PADS.spacing, 5);
  });

  it('three pads in time count as a chain, once', () => {
    const c = new PadChain();
    expect(c.hit(0)).toBe(false);
    expect(c.hit(2)).toBe(false);
    expect(c.hit(4)).toBe(true);
    expect(c.hit(6)).toBe(false);
    expect(c.count).toBe(4);
  });

  it('a long pause restarts the chain', () => {
    const c = new PadChain();
    c.hit(0);
    c.hit(2);
    expect(c.hit(60)).toBe(false);
    expect(c.count).toBe(1);
  });
});

describe('skill bounce boosts', () => {
  it('no boost leaves the apex alone', () => {
    expect(boostedApex(12, 1)).toBe(12);
    expect(boostedApex(0, Infinity)).toBe(0);
  });
  it('a super-bounce adds 25% to the first trampoline bounce, capped at the maximum', () => {
    const first = nextBounceApex(0, true);
    expect(boostedApex(first, 1.25)).toBeCloseTo(first * 1.25, 6);
    expect(boostedApex(40, 1.25)).toBe(BOUNCE.maxHeight);
  });
  it('a ground-pound (Infinity) goes straight to the maximum 45 m', () => {
    expect(boostedApex(nextBounceApex(0, true), Infinity)).toBe(BOUNCE.maxHeight);
  });
  it('pads get at most +25% (a pound counts as a super-bounce there)', () => {
    for (const h of PADS.heights) {
      expect(boostedPadApex(h, 1)).toBe(h);
      expect(boostedPadApex(h, 1.25)).toBeCloseTo(h * PADS.maxBoost, 6);
      expect(boostedPadApex(h, Infinity)).toBeCloseTo(h * PADS.maxBoost, 6);
    }
  });
});
