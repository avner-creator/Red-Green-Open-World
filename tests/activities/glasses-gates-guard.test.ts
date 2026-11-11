/**
 * The Phase 1 anti-guess guard (`gates/guard.ts`, still used by the Gear Shack weave part): after a
 * miss a hit pays 1 gem until two in a row are right, and naps grow with the miss streak. The
 * pick-one-of-three games moved to the booth kit's rounds (prize by hits): their bot numbers are in
 * tests/activities/glasses-booth-round.test.ts, glasses-oddone.test.ts and glasses-dotsigns.test.ts.
 */
import { describe, expect, it } from 'vitest';
import { freshGuard, hitPay, settle } from '../../src/activities/glasses/gates/guard';

const NAPS = [5, 8, 12] as const;

describe('anti-guess guard', () => {
  it('the first two hits after a miss pay 1 gem, then the full tier pay; naps grow with the streak', () => {
    const g = freshGuard();
    expect(hitPay(g, 8)).toBe(8);
    let s = settle(g, false, 8, NAPS);
    expect(s.nap).toBe(NAPS[0]);
    s = settle(s.guard, false, 8, NAPS);
    expect(s.nap).toBe(NAPS[1]);
    s = settle(s.guard, true, 8, NAPS);
    expect([s.gems, s.nap]).toEqual([1, 0]);
    s = settle(s.guard, true, 8, NAPS);
    expect(s.gems).toBe(1);
    s = settle(s.guard, true, 8, NAPS);
    expect(s.gems).toBe(8);
  });
});
