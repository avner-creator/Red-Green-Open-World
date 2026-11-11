import { describe, expect, it } from 'vitest';
import { makeDotRound } from '../../src/activities/glasses/dotsigns/round';
import { freshGuard } from '../../src/activities/glasses/gates/guard';
import { nextTier } from '../../src/activities/glasses/gates/kit';
import { payout, pickPrize, PRIZE_FALLBACK_GEMS, SHACK_GEMS, SHACK_WEAVE } from '../../src/activities/glasses/weave/shack/logic';
import type { ShackState } from '../../src/activities/glasses/weave/shack/logic';
import type { GlassesTier, ShopItem } from '../../src/types';
import { mulberry32 } from '../../src/vision/toolkit';

const item = (id: string, price: number, extra: Partial<ShopItem> = {}): ShopItem => ({ id, category: 'outfit', slot: 'hat', name: id, icon: 'gem', price, ...extra }) as ShopItem;

describe('shack: the session prize', () => {
  const catalog = [
    item('starter', 0),
    item('hero', 5, { category: 'character', slot: 'character' }),
    item('chesty', 6, { chestOnly: true }),
    item('capeA', 20),
    item('hatA', 12),
    item('hatB', 12),
    item('paint', 30, { category: 'paint', slot: 'paint' as ShopItem['slot'] }),
  ];

  it('is the cheapest unowned item for sale (not chest-only, not a character, not free); ties keep catalog order', () => {
    expect(pickPrize(catalog, () => false)?.id).toBe('hatA');
    expect(pickPrize(catalog, (id) => id === 'hatA')?.id).toBe('hatB');
    expect(pickPrize(catalog, (id) => id.startsWith('hat'))?.id).toBe('capeA');
  });

  it('falls back to 10 gems when everything for sale is owned', () => {
    expect(pickPrize(catalog, (id) => ['capeA', 'hatA', 'hatB', 'paint'].includes(id))).toBeNull();
    const p = payout({ guard: freshGuard(), prizeGiven: false }, true, 1, false);
    expect(p).toMatchObject({ prize: true, gems: PRIZE_FALLBACK_GEMS });
  });

  it('goes to the first full-pay win only, once per session', () => {
    let s: ShackState = { guard: freshGuard(), prizeGiven: false };
    // A miss first: the next hits warm up (1 gem each), the third right in a row wins the prize.
    let p = payout(s, false, 1, true);
    expect(p).toMatchObject({ gems: 0, prize: false, wait: SHACK_WEAVE.nap[0] });
    s = p.state;
    p = payout(s, true, 1, true);
    expect(p).toMatchObject({ gems: 1, prize: false });
    s = p.state;
    p = payout(s, true, 2, true);
    expect(p).toMatchObject({ gems: 1, prize: false });
    s = p.state;
    p = payout(s, true, 3, true);
    expect(p).toMatchObject({ gems: 0, prize: true });
    s = p.state;
    p = payout(s, true, 3, true);
    expect(p).toMatchObject({ gems: SHACK_GEMS[3], prize: false });
  });
});

describe('shack: rounds', () => {
  it('button order says nothing about the answer', () => {
    const rng = mulberry32(5);
    // For each left-hand shape, the answer is still uniform over the three boxes.
    const byFirst = new Map<string, number[]>();
    for (let i = 0; i < 24000; i++) {
      const r = makeDotRound(rng);
      const c = byFirst.get(r.shapes[0]) ?? [0, 0, 0];
      c[r.answer]++;
      byFirst.set(r.shapes[0], c);
      expect(new Set(r.shapes).size).toBe(3);
    }
    for (const c of byFirst.values()) {
      const n = c[0] + c[1] + c[2];
      for (const k of c) expect(Math.abs(k / n - 1 / 3)).toBeLessThan(0.04);
    }
  });
});

describe('shack: guessing does not pay', () => {
  /** A bot that presses a random box the instant a picture is up (worst case: no walking). */
  function bot(seed: number, minutes: number): { gemsPerMinute: number; prizeTries: number[] } {
    const rng = mulberry32(seed);
    let s: ShackState = { guard: freshGuard(), prizeGiven: false };
    let tier: GlassesTier = 1;
    let t = 0;
    let gems = 0;
    let tries = 0;
    const prizeTries: number[] = [];
    while (t < minutes * 60) {
      const answer = Math.floor(rng() * 3);
      const hit = Math.floor(rng() * 3) === answer;
      tries++;
      const p = payout(s, hit, tier, true);
      gems += p.gems;
      if (p.prize) {
        prizeTries.push(tries);
        // A new session: the prize can be won again.
        s = { guard: p.state.guard, prizeGiven: false };
        tries = 0;
      } else s = p.state;
      tier = nextTier(tier, hit);
      t += p.wait;
    }
    return { gemsPerMinute: gems / minutes, prizeTries };
  }

  it('earns at most 6 gems per minute', () => {
    for (const seed of [1, 2, 3]) expect(bot(seed, 600).gemsPerMinute).toBeLessThanOrEqual(6);
  });

  it('wins the prize only by luck: 1/3 on the very first try, then 1/27 per three-press streak', () => {
    let first = 0;
    const N = 6000;
    const rng = mulberry32(9);
    for (let i = 0; i < N; i++) if (Math.floor(rng() * 3) === Math.floor(rng() * 3)) first++;
    expect(first / N).toBeGreaterThan(0.31);
    expect(first / N).toBeLessThan(0.36);
    const { prizeTries } = bot(4, 3000);
    const mean = prizeTries.reduce((a, b) => a + b, 0) / prizeTries.length;
    // After a miss the prize needs three right in a row: many tries (and minutes of naps) on average.
    expect(mean).toBeGreaterThan(10);
  });
});
