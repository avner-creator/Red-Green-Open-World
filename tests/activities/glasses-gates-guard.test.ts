/**
 * Guessing must not pay: a random-guess bot vs a perfect player, for both three-choice mechanics,
 * driven by the same pure rules the mechanics use (guard + tier staircase + their timings).
 */
import { describe, expect, it } from 'vitest';
import type { GlassesTier } from '../../src/types';
import { DOT_GEMS, DOTSIGNS } from '../../src/activities/glasses/dotsigns/constants';
import { GATE_GEMS, GATES } from '../../src/activities/glasses/gates/constants';
import { freshGuard, hitPay, settle } from '../../src/activities/glasses/gates/guard';
import { nextTier } from '../../src/activities/glasses/gates/kit';
import { mulberry32 } from '../../src/vision/toolkit/rng';

interface Rules {
  gems: Readonly<Record<GlassesTier, number>>;
  naps: readonly number[];
  /** Seconds from a hit to the next round (beyond the action itself). */
  afterHit: number;
}

/** Gems per minute over `minutes` of play. `fixedTier` pins the tier (worst case for the bot). */
function play(rules: Rules, opts: { hitP: number; action: number; minutes: number; fixedTier?: GlassesTier; seed?: number }): number {
  const rng = mulberry32(opts.seed ?? 1);
  let g = freshGuard();
  let tier: GlassesTier = opts.fixedTier ?? 1;
  let t = 0;
  let gems = 0;
  const end = opts.minutes * 60;
  while (t < end) {
    const hit = rng() < opts.hitP;
    const s = settle(g, hit, rules.gems[tier], rules.naps);
    g = s.guard;
    gems += s.gems;
    t += opts.action + (hit ? rules.afterHit : s.nap);
    if (!opts.fixedTier) tier = nextTier(tier, hit);
  }
  return gems / opts.minutes;
}

// Dot signs: a bot can mash the button it stands at (0.3 s); a child who reads the picture takes ~2 s.
const DOTS: Rules = { gems: DOT_GEMS, naps: DOTSIGNS.nap, afterHit: DOTSIGNS.next };
// Gates: even a flat-out sprint plate → arch → plate takes ~2 s (the 0.8 s re-arm overlaps the
// walk back); a child who looks first takes ~6 s.
const GATE: Rules = { gems: GATE_GEMS, naps: GATES.missPause, afterHit: 0 };

const CASES = [
  { name: 'dot signs', rules: DOTS, bot: 0.3, kid: 2, perfectMin: 25 },
  { name: 'gates', rules: GATE, bot: 2, kid: 6, perfectMin: 15 },
] as const;

describe('random guessing does not pay', () => {
  for (const c of CASES) {
    it(`${c.name}: a random-guess bot earns ≤ 6 gems per minute at any tier`, () => {
      for (const fixedTier of [undefined, 1, 2, 3] as const) {
        const rate = play(c.rules, { hitP: 1 / 3, action: c.bot, minutes: 600, fixedTier, seed: 11 });
        console.info(`${c.name} bot, tier ${fixedTier ?? 'staircase'}: ${rate.toFixed(2)} gems/min`);
        expect(rate, `${c.name} tier ${fixedTier ?? 'staircase'}`).toBeLessThanOrEqual(6);
      }
    });

    it(`${c.name}: a player who sees the answer earns ≥ ${c.perfectMin} gems per minute even at tier 1`, () => {
      const rate = play(c.rules, { hitP: 1, action: c.kid, minutes: 10, fixedTier: 1 });
      console.info(`${c.name} perfect, tier 1: ${rate.toFixed(1)} gems/min`);
      expect(rate).toBeGreaterThanOrEqual(c.perfectMin);
    });
  }

  it('the first two hits after a miss pay 1 gem, then the full tier pay; naps grow with the streak', () => {
    const g = freshGuard();
    expect(hitPay(g, 8)).toBe(8);
    let s = settle(g, false, 8, DOTSIGNS.nap);
    expect(s.nap).toBe(DOTSIGNS.nap[0]);
    s = settle(s.guard, false, 8, DOTSIGNS.nap);
    expect(s.nap).toBe(DOTSIGNS.nap[1]);
    s = settle(s.guard, true, 8, DOTSIGNS.nap);
    expect([s.gems, s.nap]).toEqual([1, 0]);
    s = settle(s.guard, true, 8, DOTSIGNS.nap);
    expect(s.gems).toBe(1);
    s = settle(s.guard, true, 8, DOTSIGNS.nap);
    expect(s.gems).toBe(8);
    expect(settle(s.guard, false, 8, GATES.missPause).nap).toBe(GATES.missPause[0]);
  });
});
