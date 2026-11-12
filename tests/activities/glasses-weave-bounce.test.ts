import { describe, expect, it } from 'vitest';
import { BOUNCE_RING, FallPresses, applyGrade, freshStreak, gradePress, perfectRange, planFall, windowHalf } from '../../src/activities/glasses/weave/bounce/logic';
import type { FallPlan } from '../../src/activities/glasses/weave/bounce/logic';
import { PLAYER } from '../../src/config';
import { mulberry32 } from '../../src/vision/toolkit/rng';
import type { GlassesTier } from '../../src/types';

/** Fall time from an apex (m) with the game's gravity. */
const fallOf = (apex: number): number => Math.sqrt((2 * apex) / PLAYER.gravity);
/** The falls a child meets on the trampoline: walk-on 12 m, then held growth ×1.5 up to 45 m, and decays. */
const APEXES = [12, 18, 27, 40.5, 45, 45, 27.9, 17.3, 10.7];
const TIERS: GlassesTier[] = [1, 2, 3];

function gauss(rng: () => number): number {
  const u = Math.max(1e-9, rng());
  const v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

describe('perfect-bounce plan', () => {
  it('a ring on medium bounces too (walk-on 12 m, decaying 10.7 m), none on small hops (QA8 m9)', () => {
    expect(planFall(fallOf(9), 1, 0.5)).toBeNull();
    for (const t of TIERS) expect(planFall(fallOf(10.7), t, 0.5)).not.toBeNull();
    for (const t of TIERS) expect(planFall(fallOf(12), t, 0.5)).not.toBeNull();
    expect(planFall(fallOf(18), 1, 0.5)).not.toBeNull();
    expect(planFall(fallOf(27), 1, 0.5)).not.toBeNull();
    expect(planFall(fallOf(45), 3, 0.5)).not.toBeNull();
  });

  it('the perfect moment is within 20–80 % of the fall and its window ends before the landing zone', () => {
    const rng = mulberry32(5);
    for (let i = 0; i < 4000; i++) {
      const fall = BOUNCE_RING.minFall + rng() * 1.6;
      const tier = (1 + Math.floor(rng() * 3)) as GlassesTier;
      const p = planFall(fall, tier, rng())!;
      expect(p).not.toBeNull();
      expect(p.perfect).toBeGreaterThanOrEqual(0.2 * fall - 1e-9);
      expect(p.perfect).toBeLessThanOrEqual(0.8 * fall + 1e-9);
      expect(p.perfect + p.half).toBeLessThan(fall - BOUNCE_RING.landingIgnore);
    }
  });

  it('the window narrows by tier and stays easy for an 8-year-old (±180 ms at tier 1, QA8 m9)', () => {
    const f = fallOf(45);
    expect(windowHalf(f, 1)).toBeGreaterThanOrEqual(0.18);
    expect(windowHalf(f, 3)).toBeGreaterThanOrEqual(0.11);
    expect(windowHalf(f, 1)).toBeGreaterThan(windowHalf(f, 2));
    expect(windowHalf(f, 2)).toBeGreaterThan(windowHalf(f, 3));
  });

  it('a forced share picks the moment deterministically', () => {
    const f = fallOf(27);
    const a = planFall(f, 1, 0.9, 0)!;
    const b = planFall(f, 1, 0.1, 1)!;
    const r = perfectRange(f, 1)!;
    expect(a.perfect).toBeCloseTo(r.lo, 9);
    expect(b.perfect).toBeCloseTo(r.hi, 9);
  });
});

describe('perfect-bounce grading', () => {
  const plan: FallPlan = { fall: 1.6, perfect: 0.8, half: 0.08, perfectHalf: 0.036, tier: 1 };

  it('in the window = hit (perfect near the centre), outside = miss, the landing zone = ignore', () => {
    expect(gradePress(plan, 0.8)).toMatchObject({ kind: 'hit', perfect: true });
    expect(gradePress(plan, 0.86)).toMatchObject({ kind: 'hit', perfect: false });
    expect(gradePress(plan, 0.7)).toMatchObject({ kind: 'miss' });
    expect(gradePress(plan, 0.05)).toMatchObject({ kind: 'miss' });
    expect(gradePress(plan, 1.6 - 0.34)).toEqual({ kind: 'ignore' });
  });

  it('a fall counts only with exactly one press before the landing zone', () => {
    const one = new FallPresses();
    one.press(plan, 0.81);
    one.press(plan, 1.5); // the landing press: ignored entirely
    expect(one.settle(plan)).toMatchObject({ kind: 'hit' });
    const two = new FallPresses();
    two.press(plan, 0.3);
    two.press(plan, 0.8);
    expect(two.settle(plan)).toEqual({ kind: 'mash' });
    const none = new FallPresses();
    none.press(plan, 1.4);
    expect(none.settle(plan)).toEqual({ kind: 'none' });
    const early = new FallPresses();
    early.press(plan, 0.2);
    expect(early.settle(plan)).toMatchObject({ kind: 'miss' });
  });

  it('tier rises after two hits in a row, falls after a miss; three perfects in a row pay +3', () => {
    const s = freshStreak();
    const hitP = { kind: 'hit', perfect: true, offset: 0 } as const;
    const hitG = { kind: 'hit', perfect: false, offset: 0.05 } as const;
    expect(applyGrade(s, hitG)).toBe(1);
    expect(s.tier).toBe(1);
    expect(applyGrade(s, hitP)).toBe(1);
    expect(s.tier).toBe(2);
    expect(applyGrade(s, hitP)).toBe(2);
    expect(applyGrade(s, hitP)).toBe(2 + BOUNCE_RING.streakBonus);
    expect(s.tier).toBe(3);
    expect(applyGrade(s, { kind: 'miss', offset: 0.3 })).toBe(0);
    expect(s.tier).toBe(2);
    expect(s.perfectsInRow).toBe(0);
  });
});

describe('perfect-bounce simulation', () => {
  /**
   * A bouncing session: arcs rise then fall (apexes cycle through the trampoline's real chain).
   * `presses(t0, t1)` gives the child's press times in [t0, t1) (absolute seconds). Returns the
   * results the part would report.
   */
  function session(seconds: number, presses: (t0: number, t1: number) => number[], tier: GlassesTier, seed = 3): { hits: number; misses: number; rings: number } {
    const rng = mulberry32(seed);
    let t = 0;
    let hits = 0;
    let misses = 0;
    let rings = 0;
    for (let i = 0; t < seconds; i++) {
      const F = fallOf(APEXES[i % APEXES.length]);
      const rise = presses(t, t + F);
      t += F;
      const plan = planFall(F, tier, rng());
      const inFall = presses(t, t + F);
      if (plan && rise.length === 0) {
        rings++;
        const fp = new FallPresses();
        for (const p of inFall) fp.press(plan, p - t);
        const g = fp.settle(plan);
        if (g.kind === 'hit') hits++;
        if (g.kind === 'miss') misses++;
      }
      t += F;
    }
    return { hits, misses, rings };
  }

  it('a child mashing Jump (a tap every 0.3–0.7 s) for 60 s of bouncing gets no result at all', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const rng = mulberry32(100 + seed);
      const taps: number[] = [];
      for (let t = rng() * 0.5; t < 200; t += 0.3 + 0.4 * rng()) taps.push(t);
      const at = (a: number, b: number): number[] => taps.filter((x) => x >= a && x < b);
      const r = session(60, at, 1, seed);
      expect(r.hits + r.misses, `seed ${seed}`).toBe(0);
    }
  });

  /** Exact chance that a press `t` s after the fall start hits, over the random perfect moment. */
  function hitChance(F: number, tier: GlassesTier, t: number): number {
    const N = 1000;
    let n = 0;
    for (let k = 0; k < N; k++) {
      const p = planFall(F, tier, (k + 0.5) / N);
      if (p && gradePress(p, t).kind === 'hit') n++;
    }
    return n / N;
  }

  /** Best FIXED strategy for a fall: every fixed fraction of the fall and every fixed time before landing. */
  function bestFixed(F: number, tier: GlassesTier): number {
    let best = 0;
    for (let q = 0; q <= 1.0001; q += 0.0025) best = Math.max(best, hitChance(F, tier, q * F));
    for (let T = 0.35; T <= F; T += 0.005) best = Math.max(best, hitChance(F, tier, F - T));
    return best;
  }

  it('the best fixed guessing strategy (table in the notes)', () => {
    const rows: string[] = [];
    const table: Record<string, number[]> = {};
    for (const F of [1.3, 1.57, 2.02, 3]) {
      const v = TIERS.map((tier) => (planFall(F, tier, 0.5) ? bestFixed(F, tier) : 0));
      table[F] = v;
      rows.push(`${F.toFixed(2)} s: ${v.map((x, i) => `t${i + 1} ${(x * 100).toFixed(1)} %`).join(', ')}${planFall(F, 1, 0.5) ? '' : ' (no ring)'}`);
    }
    console.info(`bounce best fixed strategy:\n${rows.join('\n')}`);
    // The asserted maxima (true values + < 1 point margin). Since QA8 m9 the window is ±180 ms at
    // tier 1 (easy for 8-year-olds), so short falls are guessable more often; the ring still pays
    // off over guessing on every fall and tier 3 halves the odds of a guess.
    expect(table[1.3][0]).toBeLessThanOrEqual(0.745);
    expect(table[1.57][0]).toBeLessThanOrEqual(0.52);
    expect(table[2.02][0]).toBeLessThanOrEqual(0.345);
    expect(table[3][0]).toBeLessThanOrEqual(0.205);
    for (const F of [1.3, 1.57, 2.02, 3]) {
      expect(table[F][1]).toBeLessThan(table[F][0]);
      expect(table[F][2]).toBeLessThan(table[F][1]);
    }
  });

  it('random presses hit a third at most; a child who presses when the ring closes hits ≥ 90 %', () => {
    const rng = mulberry32(11);
    let blindHits = 0;
    let blindN = 0;
    let aimedHits = 0;
    let aimedN = 0;
    for (let i = 0; i < 20000; i++) {
      const plan = planFall(fallOf(APEXES[i % APEXES.length]), 1, rng());
      if (!plan) continue;
      const blind = gradePress(plan, rng() * plan.fall);
      if (blind.kind !== 'ignore') {
        blindN++;
        if (blind.kind === 'hit') blindHits++;
      }
      // 35 ms timing spread, 60 fps.
      const aimed = gradePress(plan, Math.round((plan.perfect + 0.035 * gauss(rng)) * 60) / 60);
      aimedN++;
      if (aimed.kind === 'hit') aimedHits++;
    }
    console.info(`bounce random press t1: ${((100 * blindHits) / blindN).toFixed(1)} %, aimed ${((100 * aimedHits) / aimedN).toFixed(1)} %`);
    expect(blindHits / blindN).toBeLessThan(0.35);
    expect(aimedHits / aimedN).toBeGreaterThanOrEqual(0.9);
  });
});
