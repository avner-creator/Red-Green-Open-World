import { describe, expect, it } from 'vitest';
import { PLAYER, TRAMPOLINE } from '../../src/config';
import {
  PadChain,
  ThresholdAwards,
  apexFromSpeed,
  flightTime,
  nextBounceApex,
  padLocalPositions,
  pushSpeed,
  speedFromApex,
} from '../../src/activities/bounceLogic';
import { PADS } from '../../src/activities/constants';

describe('bounce maths', () => {
  it('apex and speed are inverse with PLAYER.gravity', () => {
    for (const h of [3, 6, 10, 40]) {
      expect(apexFromSpeed(speedFromApex(h))).toBeCloseTo(h, 6);
    }
    expect(speedFromApex(40)).toBeCloseTo(Math.sqrt(2 * PLAYER.gravity * 40), 6);
  });

  it('flight time matches 2v/g', () => {
    expect(flightTime(10)).toBeCloseTo((2 * speedFromApex(10)) / PLAYER.gravity, 6);
  });
});

describe('trampoline progression', () => {
  it('holding jump grows each bounce by growth and caps at maxHeight', () => {
    let apex = nextBounceApex(0, true);
    expect(apex).toBeCloseTo(TRAMPOLINE.firstBounce);
    const seen = [apex];
    for (let i = 0; i < 12; i++) {
      const next = nextBounceApex(apex, true);
      expect(next).toBeGreaterThanOrEqual(apex);
      apex = next;
      seen.push(apex);
    }
    expect(seen[1]).toBeCloseTo(TRAMPOLINE.firstBounce * TRAMPOLINE.growth);
    expect(apex).toBe(TRAMPOLINE.maxHeight);
    expect(Math.max(...seen)).toBe(TRAMPOLINE.maxHeight);
  });

  it('the 40 m cap is reached in a handful of bounces', () => {
    let apex = 0;
    let n = 0;
    while (apex < TRAMPOLINE.maxHeight && n < 30) {
      apex = nextBounceApex(apex, true);
      n++;
    }
    expect(apex).toBe(TRAMPOLINE.maxHeight);
    expect(n).toBeLessThan(12);
  });

  it('not holding decays and eventually stops', () => {
    let apex = 20;
    let steps = 0;
    while (apex > 0 && steps < 20) {
      const next = nextBounceApex(apex, false);
      if (next > 0) expect(next).toBeLessThan(apex);
      apex = next;
      steps++;
    }
    expect(apex).toBe(0);
    expect(steps).toBeLessThan(10);
  });

  it('a gentle first bounce is smaller than a held one', () => {
    expect(nextBounceApex(0, false)).toBeLessThan(nextBounceApex(0, true));
  });

  it('a big fall starts the chain higher, but never above the cap', () => {
    expect(nextBounceApex(0, true, 100)).toBeGreaterThan(TRAMPOLINE.firstBounce);
    expect(nextBounceApex(0, true, 10_000)).toBeLessThanOrEqual(TRAMPOLINE.maxHeight);
  });
});

describe('stunt thresholds', () => {
  it('awards 10/20/30/40 m once each with 1/1/2/3 stars', () => {
    const a = new ThresholdAwards();
    expect(a.reached(5)).toEqual([]);
    expect(a.reached(12).map((t) => t.stars)).toEqual([1]);
    expect(a.reached(12)).toEqual([]);
    expect(a.reached(31).map((t) => [t.height, t.stars])).toEqual([
      [20, 1],
      [30, 2],
    ]);
    expect(a.reached(TRAMPOLINE.maxHeight).map((t) => [t.height, t.stars])).toEqual([[40, 3]]);
    expect(a.reached(TRAMPOLINE.maxHeight)).toEqual([]);
  });

  it('reset allows awards again in a new session', () => {
    const a = new ThresholdAwards();
    a.reached(40);
    a.reset();
    expect(a.reached(10)).toHaveLength(1);
  });
});

describe('bounce pads', () => {
  it('push speed lands the player one pad spacing away', () => {
    const v = pushSpeed(PADS.spacing, 6);
    expect(v * flightTime(6)).toBeCloseTo(PADS.spacing, 6);
  });

  it('pads are laid out PADS.spacing apart', () => {
    const p = padLocalPositions(3, PADS.spacing);
    expect(Math.hypot(p[1].x - p[0].x, p[1].z - p[0].z)).toBeCloseTo(PADS.spacing, 5);
    expect(Math.hypot(p[2].x - p[1].x, p[2].z - p[1].z)).toBeCloseTo(PADS.spacing, 5);
  });

  it('chaining 3 pads awards bigAir once; a long pause restarts the chain', () => {
    const c = new PadChain();
    expect(c.hit(0)).toBe(false);
    expect(c.hit(1.5)).toBe(false);
    expect(c.hit(3)).toBe(true);
    expect(c.hit(4.5)).toBe(false); // already awarded for this chain
    expect(c.hit(60)).toBe(false); // new chain
    expect(c.count).toBe(1);
    expect(c.hit(61)).toBe(false);
    expect(c.hit(62)).toBe(true);
  });

  it('reset clears the chain', () => {
    const c = new PadChain();
    c.hit(0);
    c.hit(1);
    c.reset();
    expect(c.hit(2)).toBe(false);
  });
});
