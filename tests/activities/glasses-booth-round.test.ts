/**
 * The booth kit's round machine (pure): every transition, cancel, session reset, the prize table
 * and the anti-guess numbers (a random-guess bot vs a player who sees the answer).
 */
import { describe, expect, it } from 'vitest';
import { PICK3_PRIZE, prizeFor, ROUND_DEFAULTS, RoundMachine, stepTier } from '../../src/activities/glasses/booth/round';
import type { RoundEvent } from '../../src/activities/glasses/booth/round';
import { simulate } from '../../src/activities/glasses/booth/sim';
import type { RoundRules } from '../../src/activities/glasses/booth/types';
import { GATE_PRIZE, GATE_RULES } from '../../src/activities/glasses/gates/constants';

const NEXT: RoundRules = { tries: 5, minHits: 3, prize: PICK3_PRIZE, between: 'next' };

/** Step `seconds` in 1/60 s frames; collect the events. */
function run(m: RoundMachine, seconds: number, ready = true): RoundEvent[] {
  const out: RoundEvent[] = [];
  for (let t = 0; t < seconds - 1e-9; t += 1 / 60) out.push(...m.step(1 / 60, ready));
  return out;
}
const types = (ev: RoundEvent[]): string[] => ev.map((e) => (e.type === 'count' ? `count${e.n}` : e.type));

describe('round machine', () => {
  it('idle → countdown 3, 2, 1, GO → try 0', () => {
    const m = new RoundMachine(NEXT);
    expect(m.phase).toBe('idle');
    expect(run(m, 5)).toEqual([]);
    expect(types(m.start())).toEqual(['start', 'count3']);
    expect(m.phase).toBe('countdown');
    expect(m.start()).toEqual([]); // a second start is ignored
    const ev = run(m, ROUND_DEFAULTS.countStep * 3 + ROUND_DEFAULTS.goTime + 0.05);
    expect(types(ev)).toEqual(['count2', 'count1', 'count0', 'try']);
    expect(m.phase).toBe('play');
    expect(m.index).toBe(0);
  });

  it('play → report → beat → next try; the last try → end → celebrate → prize → pay → cooldown → idle', () => {
    const m = new RoundMachine(NEXT);
    m.start();
    run(m, 3);
    const seen: string[] = [];
    for (let i = 0; i < 5; i++) {
      expect(m.phase).toBe('play');
      expect(m.report(i !== 1)).toMatchObject([{ type: 'result', index: i, hit: i !== 1, tier: 1 }]);
      expect(m.report(true)).toEqual([]); // one answer per try
      expect(m.phase).toBe('beat');
      seen.push(...types(run(m, ROUND_DEFAULTS.beat + 0.02)));
    }
    expect(seen).toEqual(['try', 'try', 'try', 'try', 'end']);
    expect(m.phase).toBe('celebrate');
    expect(m.gems).toBe(PICK3_PRIZE[1][4]);
    const rest = run(m, ROUND_DEFAULTS.celebrate + ROUND_DEFAULTS.prizeTime + ROUND_DEFAULTS.cooldown + 0.1);
    expect(rest).toEqual([{ type: 'prizeFly', gems: 6 }, { type: 'pay', gems: 6 }, { type: 'idle' }]);
    expect(m.phase).toBe('idle');
    expect(m.totalGems).toBe(6);
  });

  it("'pad' rules wait for the child to be back on the pad between tries", () => {
    const m = new RoundMachine(GATE_RULES);
    m.start();
    run(m, 3);
    m.report(true);
    expect(types(run(m, 2, false))).toEqual(['wait']);
    expect(m.phase).toBe('wait');
    // Still waiting: the child is called back once (QA6 m3), nothing is lost.
    expect(types(run(m, 5, false))).toEqual(['nudge']);
    expect(types(run(m, 0.05, true))).toEqual(['try']);
    // Already on the pad when the beat ends: straight on.
    m.report(false);
    expect(types(run(m, 1.5, true))).toEqual(['try']);
  });

  it('no prize below minHits: no prize flight, no pay', () => {
    const m = new RoundMachine(GATE_RULES);
    m.start();
    run(m, 3);
    const ev: RoundEvent[] = [];
    for (const hit of [true, false, false]) {
      m.report(hit);
      ev.push(...run(m, 1.5, true));
    }
    expect(ev.at(-1)).toEqual({ type: 'end', hits: 1, gems: 0 });
    const rest = run(m, 6);
    expect(types(rest)).toEqual(['idle']);
  });

  it('cancel during the tries reports nothing more and pays nothing; during the celebration it pays at once', () => {
    const m = new RoundMachine(GATE_RULES);
    m.start();
    expect(types(m.cancel('left'))).toEqual(['cancel', 'idle']);
    expect(m.phase).toBe('idle');
    m.start();
    run(m, 3);
    m.report(true);
    expect(types(m.cancel('respawn'))).toEqual(['cancel', 'idle']);
    expect(m.results).toEqual([true]); // nothing added for runs 2 and 3
    m.start();
    run(m, 3);
    for (let i = 0; i < 3; i++) {
      m.report(true);
      run(m, 1.5, true);
    }
    expect(m.phase).toBe('celebrate');
    expect(m.cancel('left')).toEqual([{ type: 'pay', gems: GATE_PRIZE[1][3] }, { type: 'cancel', reason: 'left' }, { type: 'idle' }]);
    expect(m.cancel('again')).toEqual([]);
    expect(m.totalGems).toBe(GATE_PRIZE[1][3]);
  });

  it('a round with no answer for a long time is cancelled quietly', () => {
    const m = new RoundMachine({ ...GATE_RULES, stall: 10 });
    m.start();
    const ev = run(m, 14);
    expect(types(ev).slice(-2)).toEqual(['cancel', 'idle']);
  });

  it('the tier steps per round: up after all hits, down below minHits; results carry the round tier', () => {
    const m = new RoundMachine(GATE_RULES);
    const round = (hits: boolean[]): RoundEvent[] => {
      m.start();
      run(m, 3);
      const out: RoundEvent[] = [];
      for (const h of hits) {
        out.push(...m.report(h));
        run(m, 1.5, true);
      }
      run(m, 6);
      return out;
    };
    expect(round([true, true, true]).map((e) => (e.type === 'result' ? e.tier : 0))).toEqual([1, 1, 1]);
    expect(m.tier).toBe(2);
    round([true, false, true]);
    expect(m.tier).toBe(2);
    expect(round([true, false, false]).map((e) => (e.type === 'result' ? e.tier : 0))).toEqual([2, 2, 2]);
    expect(m.tier).toBe(1);
    expect(stepTier(3, 3, 3, 2)).toBe(3);
    expect(stepTier(1, 0, 3, 2)).toBe(1);
  });

  it('the streak counts hits in a row (for the rising pitch)', () => {
    const m = new RoundMachine(NEXT);
    m.start();
    run(m, 3);
    const streaks: number[] = [];
    for (const h of [true, true, false, true, true]) {
      const r = m.report(h)[0];
      if (r?.type === 'result') streaks.push(r.streak);
      run(m, 1.1);
    }
    expect(streaks).toEqual([1, 2, 0, 1, 2]);
  });

  it('session reset: idle, tier 1, nothing owed', () => {
    const m = new RoundMachine(GATE_RULES);
    m.tier = 3;
    m.start();
    run(m, 3);
    m.report(true);
    m.reset();
    expect([m.phase, m.tier, m.results.length, m.totalGems]).toEqual(['idle', 1, 0, 0]);
    expect(m.cancel('x')).toEqual([]);
    expect(m.forcePlay(2)).toEqual([{ type: 'try', index: 0, tier: 2 }]);
    expect(m.phase).toBe('play');
  });
});

describe('prize tables', () => {
  it('nothing below minHits; more hits and finer tiers pay more', () => {
    for (const [rules, tries] of [[GATE_RULES, 3], [NEXT, 5]] as const) {
      for (const tier of [1, 2, 3] as const) {
        for (let h = 0; h < rules.minHits; h++) expect(prizeFor(rules, h, tier)).toBe(0);
        for (let h = rules.minHits + 1; h <= tries; h++) expect(prizeFor(rules, h, tier)).toBeGreaterThan(prizeFor(rules, h - 1, tier));
        if (tier > 1) expect(prizeFor(rules, tries, tier)).toBeGreaterThan(prizeFor(rules, tries, (tier - 1) as 1 | 2));
      }
    }
  });
});

describe('guessing does not pay (simulated against the real machine)', () => {
  // Gates: sprinting pad → arch is under a second; back to the pad another second; a child who
  // looks at the sign first takes ~2.5 s per run.
  const gatesBot = { hitP: 1 / 3, tryTime: 0.8, backTime: 0.9, restart: 0.9 };
  const gatesKid = { hitP: 1, tryTime: 2.5, backTime: 1.2, restart: 1.5 };
  // Press games (template): a bot mashes in 0.4 s; a child takes 2 s.
  const pressBot = { hitP: 1 / 3, tryTime: 0.4, restart: 0.5 };
  const pressKid = { hitP: 1, tryTime: 2, restart: 1.5 };

  for (const [name, rules, bot, kid] of [['gates', GATE_RULES, gatesBot, gatesKid], ['pick-3 template', NEXT, pressBot, pressKid]] as const) {
    it(`${name}: a random-guess bot earns ≤ 6 gems per minute at any tier`, () => {
      for (const fixedTier of [undefined, 1, 2, 3] as const) {
        const r = simulate(rules, { ...bot, minutes: 600, fixedTier, seed: 7 });
        console.info(`${name} bot, tier ${fixedTier ?? 'staircase'}: ${r.gemsPerMinute.toFixed(2)} gems/min`);
        expect(r.gemsPerMinute, `${name} tier ${fixedTier ?? 'staircase'}`).toBeLessThanOrEqual(6);
      }
    });
    it(`${name}: a player who sees the answer earns ≥ 25 gems per minute even at tier 1`, () => {
      const r1 = simulate(rules, { ...kid, minutes: 20, fixedTier: 1 });
      const rs = simulate(rules, { ...kid, minutes: 20 });
      console.info(`${name} perfect: tier 1 ${r1.gemsPerMinute.toFixed(1)}, staircase ${rs.gemsPerMinute.toFixed(1)} gems/min`);
      expect(r1.gemsPerMinute).toBeGreaterThanOrEqual(25);
      expect(rs.gemsPerMinute).toBeGreaterThanOrEqual(r1.gemsPerMinute);
      expect(rs.tierEnd).toBe(3);
    });
  }
});
