import { describe, expect, it } from 'vitest';
import { BOUNCE_RING, applyGrade, freshStreak, gradePress, perfectRange, planFall, windowHalf } from '../../src/activities/glasses/weave/bounce/logic';
import type { FallPlan } from '../../src/activities/glasses/weave/bounce/logic';
import { PLAYER } from '../../src/config';
import { mulberry32 } from '../../src/vision/toolkit/rng';
import type { GlassesTier } from '../../src/types';

/** Fall time from an apex (m) with the game's gravity. */
const fallOf = (apex: number): number => Math.sqrt((2 * apex) / PLAYER.gravity);
/** The falls a child meets on the trampoline: walk-on 12 m, then held growth ×1.5 up to 45 m, and decays. */
const APEXES = [12, 18, 27, 40.5, 45, 45, 27.9, 17.3, 10.7];

function gauss(rng: () => number): number {
  const u = Math.max(1e-9, rng());
  const v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

describe('perfect-bounce plan', () => {
  it('no ring for short falls (the 12 m walk-on bounce); a ring from the first held bounce', () => {
    expect(planFall(fallOf(12), 1, 0.5)).toBeNull();
    expect(planFall(fallOf(18), 1, 0.5)).not.toBeNull();
    expect(planFall(fallOf(45), 3, 0.5)).not.toBeNull();
  });

  it('the perfect moment is within 35–75 % of the fall and its window ends before the landing zone', () => {
    const rng = mulberry32(5);
    for (let i = 0; i < 4000; i++) {
      const fall = BOUNCE_RING.minFall + rng() * 1.2;
      const tier = (1 + Math.floor(rng() * 3)) as GlassesTier;
      const p = planFall(fall, tier, rng())!;
      expect(p).not.toBeNull();
      expect(p.perfect).toBeGreaterThanOrEqual(0.35 * fall - 1e-9);
      expect(p.perfect).toBeLessThanOrEqual(0.75 * fall + 1e-9);
      expect(p.perfect + p.half).toBeLessThan(fall - BOUNCE_RING.landingIgnore);
      expect(p.half).toBeLessThanOrEqual(BOUNCE_RING.maxShare * (fall - BOUNCE_RING.landingIgnore) + 1e-9);
    }
  });

  it('the window narrows by tier', () => {
    const f = fallOf(45);
    expect(windowHalf(f, 1)).toBeGreaterThan(windowHalf(f, 2));
    expect(windowHalf(f, 2)).toBeGreaterThan(windowHalf(f, 3));
    const r = perfectRange(f, 1)!;
    expect(r.hi - r.lo).toBeGreaterThan(0.4);
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
    expect(gradePress(plan, 0.95)).toMatchObject({ kind: 'miss' });
    expect(gradePress(plan, 0.05)).toMatchObject({ kind: 'miss' });
    expect(gradePress(plan, 1.6 - 0.34)).toEqual({ kind: 'ignore' });
    expect(gradePress(plan, 1.6)).toEqual({ kind: 'ignore' });
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
    expect(applyGrade(s, hitP)).toBe(2 + BOUNCE_RING.streakBonus); // 3rd perfect in a row (tier 3 from the next one)
    expect(s.tier).toBe(3);
    expect(applyGrade(s, { kind: 'miss', offset: 0.3 })).toBe(0);
    expect(s.tier).toBe(2);
    expect(s.perfectsInRow).toBe(0);
    expect(applyGrade(s, { kind: 'ignore' })).toBe(0);
    expect(s.tier).toBe(2);
  });
});

describe('perfect-bounce simulation', () => {
  /** Runs `n` falls through a child model; returns hits / counted presses and hits / ringed falls. */
  function simulate(tier: GlassesTier, pressAt: (plan: FallPlan, rng: () => number) => number, n = 20000, seed = 11): { perAttempt: number; perFall: number } {
    const rng = mulberry32(seed);
    let hits = 0;
    let attempts = 0;
    let falls = 0;
    for (let i = 0; i < n; i++) {
      const plan = planFall(fallOf(APEXES[i % APEXES.length]), tier, rng());
      if (!plan) continue;
      falls++;
      const g = gradePress(plan, pressAt(plan, rng));
      if (g.kind === 'ignore') continue;
      attempts++;
      if (g.kind === 'hit') hits++;
    }
    return { perAttempt: hits / Math.max(1, attempts), perFall: hits / Math.max(1, falls) };
  }

  it('a child who presses at a random moment of each fall hits ≤ 15 % at tier 1, less above', () => {
    const blind = (p: FallPlan, rng: () => number): number => rng() * p.fall;
    const t1 = simulate(1, blind);
    const t2 = simulate(2, blind);
    const t3 = simulate(3, blind);
    expect(t1.perAttempt).toBeLessThanOrEqual(0.15);
    expect(t2.perAttempt).toBeLessThan(t1.perAttempt);
    expect(t3.perAttempt).toBeLessThan(t2.perAttempt);
    // Reported in the stream notes: tier 1 per attempt / per fall.
    console.info(`bounce blind hit rate: t1 ${(t1.perAttempt * 100).toFixed(1)} % (${(t1.perFall * 100).toFixed(1)} % of falls), t2 ${(t2.perAttempt * 100).toFixed(1)} %, t3 ${(t3.perAttempt * 100).toFixed(1)} %`);
  });

  it('a child who presses when the ring closes (35 ms timing spread, 60 fps) hits ≥ 90 %', () => {
    const aimed = (p: FallPlan, rng: () => number): number => Math.round((p.perfect + 0.035 * gauss(rng)) * 60) / 60;
    const t1 = simulate(1, aimed);
    expect(t1.perAttempt).toBeGreaterThanOrEqual(0.9);
    console.info(`bounce aimed hit rate: t1 ${(t1.perAttempt * 100).toFixed(1)} %`);
  });
});
