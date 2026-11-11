/**
 * Skydive glasses part `chute`: pure logic (ring outcome rules, tiers, hoop disc crossing, gem
 * orbit, hoop placement) and blind-guess simulations: a child who cannot see the weak-eye ring
 * and opens at a random height rarely hits; a child who sees only the hoop and flies through it
 * at a random moment hits about as often as the gem is inside (≈ 40 %), which is why a pass with
 * the gem outside is reported as a miss.
 */
import { describe, expect, it } from 'vitest';
import { BALLOON } from '../../src/config';
import { seededRng } from '../../src/activities/glasses/idle';
import {
  CHUTE,
  HOOP,
  crossDisc,
  gemIsInside,
  gemOffset,
  hoopOutcome,
  orbitRadius,
  pickTarget,
  placeHoop,
  ringOutcome,
  ringT,
  stepTier,
  thetaFor,
  windowT,
} from '../../src/activities/glasses/weave/chute/logic';
import type { GlassesTier } from '../../src/types';

describe('chute ring (timeIt)', () => {
  it('targets are 70–120 m, continuous, and spread', () => {
    const rng = seededRng(7);
    const ts = Array.from({ length: 2000 }, () => pickTarget(rng));
    expect(Math.min(...ts)).toBeGreaterThanOrEqual(CHUTE.targetMin);
    expect(Math.max(...ts)).toBeLessThanOrEqual(CHUTE.targetMax);
    expect(ts.filter((t) => Number.isInteger(t)).length).toBe(0);
    // Well above the auto-open, never tied to it.
    expect(CHUTE.targetMin - CHUTE.nearMiss).toBeGreaterThan(BALLOON.autoChuteHeight);
  });

  it('hit inside the tier window, miss when close, nothing when far or automatic', () => {
    expect(ringOutcome(90, 90, 1, false)).toBe('hit');
    expect(ringOutcome(97.9, 90, 1, false)).toBe('hit');
    expect(ringOutcome(98.5, 90, 1, false)).toBe('miss');
    expect(ringOutcome(94, 90, 2, false)).toBe('hit');
    expect(ringOutcome(95.5, 90, 2, false)).toBe('miss');
    expect(ringOutcome(92.9, 90, 3, false)).toBe('hit');
    expect(ringOutcome(93.5, 90, 3, false)).toBe('miss');
    expect(ringOutcome(70.5, 90, 1, false)).toBe('miss');
    expect(ringOutcome(69, 90, 1, false)).toBeNull();
    expect(ringOutcome(150, 90, 1, false)).toBeNull();
    expect(ringOutcome(90, 90, 1, true)).toBeNull();
  });

  it('the closing ring meets its target exactly at the target height', () => {
    expect(ringT(90 + CHUTE.span, 90)).toBe(0);
    expect(ringT(200, 90)).toBe(0);
    expect(ringT(90, 90)).toBeCloseTo(CHUTE.perfectAt);
    expect(ringT(0, 90)).toBe(1);
    // The highlight window in t covers exactly ± window metres.
    for (const tier of [1, 2, 3] as GlassesTier[]) {
      expect(ringT(90 - CHUTE.window[tier], 90) - CHUTE.perfectAt).toBeCloseTo(windowT(tier));
    }
  });

  it('tiers go up after a hit and down after a miss, within 1..3', () => {
    expect(stepTier(1, true)).toBe(2);
    expect(stepTier(3, true)).toBe(3);
    expect(stepTier(2, false)).toBe(1);
    expect(stepTier(1, false)).toBe(1);
  });

  it('blind guess: opening at a random legal height hits ≤ 20 % at tier 1 (less above)', () => {
    const rng = seededRng(42);
    const N = 20000;
    const rate: Record<number, number> = {};
    for (const tier of [1, 2, 3] as GlassesTier[]) {
      let hit = 0;
      for (let i = 0; i < N; i++) {
        const target = pickTarget(rng);
        // Any manual open from the top of the fall (~175 m) down to the auto-open.
        const open = BALLOON.autoChuteHeight + (175 - BALLOON.autoChuteHeight) * rng();
        if (ringOutcome(open, target, tier, false) === 'hit') hit++;
      }
      rate[tier] = hit / N;
    }
    console.log(`chute ring blind hit rate: tier1 ${(rate[1] * 100).toFixed(1)} %, tier2 ${(rate[2] * 100).toFixed(1)} %, tier3 ${(rate[3] * 100).toFixed(1)} %`);
    expect(rate[1]).toBeLessThanOrEqual(0.2);
    expect(rate[2]).toBeLessThan(rate[1]);
    expect(rate[3]).toBeLessThan(rate[2]);
    // Even guessing the middle of the target range is not a reliable trick.
    let mid = 0;
    for (let i = 0; i < N; i++) if (ringOutcome(95, pickTarget(rng), 1, false) === 'hit') mid++;
    expect(mid / N).toBeLessThanOrEqual(0.35);
  });
});

describe('chute hoop gem (lineUp)', () => {
  it('a segment through the disc counts (even a very fast one); beside it does not', () => {
    const c = { x: 0, y: 100, z: 0 };
    expect(crossDisc({ x: 0, y: 130, z: 0 }, { x: 0.5, y: 70, z: 0 }, c, 3)).not.toBeNull();
    expect(crossDisc({ x: 2, y: 100.4, z: 0 }, { x: 2, y: 99.8, z: 0 }, c, 3)).toBeCloseTo(2);
    expect(crossDisc({ x: 3.5, y: 101, z: 0 }, { x: 3.5, y: 99, z: 0 }, c, 3)).toBeNull();
    expect(crossDisc({ x: 0, y: 105, z: 0 }, { x: 0, y: 101, z: 0 }, c, 3)).toBeNull();
    // Slanted: enters beside, crosses the plane inside.
    expect(crossDisc({ x: 6, y: 102, z: 0 }, { x: -2, y: 98, z: 0 }, c, 3)).toBeCloseTo(2);
  });

  it('the gem orbit passes through the hoop centre and swings out past the rim', () => {
    const r = orbitRadius();
    const inside = gemOffset(thetaFor(true), r, 0.7);
    expect(Math.hypot(inside.x, inside.z)).toBeCloseTo(0);
    const out = gemOffset(thetaFor(false), r, 0.7);
    expect(Math.hypot(out.x, out.z)).toBeGreaterThan(HOOP.radius + 1);
    expect(gemIsInside(thetaFor(true))).toBe(true);
    expect(gemIsInside(thetaFor(false))).toBe(false);
  });

  it('the gem is inside the hoop about 40 % of the time', () => {
    const N = 3600;
    let n = 0;
    for (let i = 0; i < N; i++) if (gemIsInside((i / N) * Math.PI * 2)) n++;
    expect(n / N).toBeCloseTo(HOOP.insideFraction, 2);
  });

  it('blind pass: flying through the hoop without seeing the gem hits about as often as it is inside', () => {
    const rng = seededRng(3);
    const N = 20000;
    let hit = 0;
    let miss = 0;
    for (let i = 0; i < N; i++) {
      const o = hoopOutcome(true, gemIsInside(rng() * Math.PI * 2));
      if (o === 'hit') hit++;
      else if (o === 'miss') miss++;
    }
    const rate = hit / N;
    console.log(`chute hoop blind hit rate: ${(rate * 100).toFixed(1)} % (misses ${((miss / N) * 100).toFixed(1)} %)`);
    expect(rate).toBeGreaterThan(0.37);
    expect(rate).toBeLessThan(0.43);
    expect(hit + miss).toBe(N);
    expect(hoopOutcome(false, true)).toBeNull();
  });

  it('hoop placement: on the trail height, beside the hands-off line, clear of every trail gem', () => {
    const ground = (): number => 0;
    const trail = [0, 1, 2, 3, 4, 5, 6].map((i) => ({ x: i * 6, y: 170 - i * 22, z: i * 3 }));
    for (const side of [1, -1] as const) {
      for (const h of [100, 115, 130]) {
        const p = placeHoop(trail, ground, h, side);
        expect(p).not.toBeNull();
        expect(p!.y).toBeLessThanOrEqual(130.01);
        expect(p!.y).toBeGreaterThanOrEqual(99.99);
        for (const s of trail) expect(Math.hypot(s.x - p!.x, s.y - p!.y, s.z - p!.z)).toBeGreaterThanOrEqual(HOOP.minSpotDistance);
        // Distance to the straight trail line, horizontally, is at least the offset (minus slack).
        const a = trail.find((s, i) => s.y >= p!.y && trail[i + 1] && trail[i + 1].y <= p!.y)!;
        const b = trail[trail.indexOf(a) + 1];
        const dx = b.x - a.x;
        const dz = b.z - a.z;
        const cross = Math.abs((p!.x - a.x) * dz - (p!.z - a.z) * dx) / Math.hypot(dx, dz);
        expect(cross).toBeGreaterThanOrEqual(HOOP.offset - 1e-6);
      }
    }
    expect(placeHoop(trail.slice(0, 1), ground, 110, 1)).toBeNull();
  });
});
