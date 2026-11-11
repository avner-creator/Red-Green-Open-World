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
  planeAxes,
  UP,
  ringOutcome,
  ringT,
  stepTier,
  thetaFor,
  windowT,
} from '../../src/activities/glasses/weave/chute/logic';
import type { GlassesTier } from '../../src/types';

describe('chute ring (timeIt)', () => {
  it('targets are 55–150 m, continuous, and spread', () => {
    const rng = seededRng(7);
    const ts = Array.from({ length: 2000 }, () => pickTarget(rng));
    expect(Math.min(...ts)).toBeGreaterThanOrEqual(CHUTE.targetMin);
    expect(Math.max(...ts)).toBeLessThanOrEqual(CHUTE.targetMax);
    expect(ts.filter((t) => Number.isInteger(t)).length).toBe(0);
    // Every hit window ends above the auto-open (an open there is always manual) and below the jump.
    expect(CHUTE.targetMin - CHUTE.window[1]).toBeGreaterThan(BALLOON.autoChuteHeight + 5);
    expect(CHUTE.targetMax + CHUTE.window[1]).toBeLessThan(BALLOON.topHeight - 15);
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

  it('blind guess: the best FIXED opening height hits ≤ 18 / 12 / 8 % by tier; a random one far less', () => {
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
    console.log(`chute ring random-height hit rate: tier1 ${(rate[1] * 100).toFixed(1)} %, tier2 ${(rate[2] * 100).toFixed(1)} %, tier3 ${(rate[3] * 100).toFixed(1)} %`);
    expect(rate[1]).toBeLessThanOrEqual(0.15);
    expect(rate[2]).toBeLessThan(rate[1]);
    expect(rate[3]).toBeLessThan(rate[2]);

    // Best fixed strategy: scan every opening height (0.5 m steps over the whole manual fall) and
    // take the highest hit rate over the same sampled targets.
    const targets = Array.from({ length: 8000 }, () => pickTarget(rng));
    const best: Record<number, { rate: number; at: number }> = {};
    for (const tier of [1, 2, 3] as GlassesTier[]) {
      best[tier] = { rate: 0, at: 0 };
      for (let open = BALLOON.autoChuteHeight + 0.5; open <= 175; open += 0.5) {
        let h = 0;
        for (const t of targets) if (ringOutcome(open, t, tier, false) === 'hit') h++;
        if (h / targets.length > best[tier].rate) best[tier] = { rate: h / targets.length, at: open };
      }
    }
    console.log(
      `chute ring best fixed height: tier1 ${(best[1].rate * 100).toFixed(1)} % (at ${best[1].at} m), tier2 ${(best[2].rate * 100).toFixed(1)} %, tier3 ${(best[3].rate * 100).toFixed(1)} %`,
    );
    expect(best[1].rate).toBeLessThanOrEqual(0.18);
    expect(best[2].rate).toBeLessThanOrEqual(0.12);
    expect(best[3].rate).toBeLessThanOrEqual(0.08);
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
    // A hoop tilted 45° about z: a straight fall through its centre counts, one 5 m aside does not.
    const n = { x: Math.SQRT1_2, y: Math.SQRT1_2, z: 0 };
    expect(crossDisc({ x: 0, y: 130, z: 0 }, { x: 0, y: 70, z: 0 }, c, 4, n)).toBeCloseTo(0);
    expect(crossDisc({ x: 0, y: 130, z: 5 }, { x: 0, y: 70, z: 5 }, c, 4, n)).toBeNull();
    // 2 m aside along x: the crossing point is 2·√2 ≈ 2.83 m from the centre in the tilted plane.
    expect(crossDisc({ x: 2, y: 130, z: 0 }, { x: 2, y: 70, z: 0 }, c, 4, n)).toBeCloseTo(2 * Math.SQRT2);
  });

  it('plane axes are orthonormal and lie in the hoop plane', () => {
    for (const n of [UP, { x: 0.5, y: Math.sqrt(0.75), z: 0 }, { x: -0.3, y: 0.8, z: 0.52 }]) {
      const l = Math.hypot(n.x, n.y, n.z);
      const m = { x: n.x / l, y: n.y / l, z: n.z / l };
      const { u, w } = planeAxes(m);
      const dot = (a: typeof u, b: typeof u): number => a.x * b.x + a.y * b.y + a.z * b.z;
      expect(dot(u, u)).toBeCloseTo(1);
      expect(dot(w, w)).toBeCloseTo(1);
      expect(dot(u, w)).toBeCloseTo(0);
      expect(dot(u, m)).toBeCloseTo(0);
      expect(dot(w, m)).toBeCloseTo(0);
    }
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

  it('hoop placement: on the trail height, 5 m beside the trail, clear of every trail gem, leaning back to the hero', () => {
    const ground = (): number => 0;
    const trail = [0, 1, 2, 3, 4, 5, 6].map((i) => ({ x: i * 6, y: 170 - i * 22, z: i * 3 }));
    for (const side of [1, -1] as const) {
      for (const h of [100, 115, 130]) {
        const placed = placeHoop(trail, ground, h, side);
        expect(placed).not.toBeNull();
        const p = placed!.center;
        const n = placed!.normal;
        expect(Math.hypot(n.x, n.y, n.z)).toBeCloseTo(1);
        expect(Math.acos(n.y)).toBeCloseTo(HOOP.tilt);
        // Leans back up the trail (towards where the hero comes from).
        expect(n.x * 6 + n.z * 3).toBeLessThan(0);
        expect(HOOP.offset + HOOP.radius).toBeLessThan(10);
        expect(p.y).toBeLessThanOrEqual(130.01);
        expect(p.y).toBeGreaterThanOrEqual(99.99);
        for (const s of trail) expect(Math.hypot(s.x - p.x, s.y - p.y, s.z - p.z)).toBeGreaterThanOrEqual(HOOP.minSpotDistance);
        // Distance to the straight trail line, horizontally, is at least the offset (minus slack).
        const a = trail.find((s, i) => s.y >= p.y && trail[i + 1] && trail[i + 1].y <= p.y)!;
        const b = trail[trail.indexOf(a) + 1];
        const dx = b.x - a.x;
        const dz = b.z - a.z;
        const cross = Math.abs((p.x - a.x) * dz - (p.z - a.z) * dx) / Math.hypot(dx, dz);
        expect(cross).toBeGreaterThanOrEqual(HOOP.offset - 1e-6);
        expect(cross).toBeLessThan(HOOP.offset + 3);
      }
    }
    expect(placeHoop(trail.slice(0, 1), ground, 110, 1)).toBeNull();
  });
});
