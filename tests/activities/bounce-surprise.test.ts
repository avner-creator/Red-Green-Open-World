import { describe, expect, it } from 'vitest';
import { SURPRISE, autoTrickPose, keepOnBed, makeRng, rollSurprise, superApex } from '../../src/activities/bounceLogic';

describe('surprise bounces', () => {
  it('the seeded RNG repeats exactly and stays in [0, 1)', () => {
    const a = makeRng(42);
    const b = makeRng(42);
    for (let i = 0; i < 1000; i++) {
      const x = a();
      expect(x).toBe(b());
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
    }
  });

  it('about 1 in 6 chained bounces is a SUPER BOING; tricks and stars show up too', () => {
    const rng = makeRng(7);
    let sup = 0;
    let tricks = 0;
    let stars = 0;
    const n = 6000;
    for (let i = 0; i < n; i++) {
      const s = rollSurprise(rng, 18, 45);
      if (s.superBoing) sup++;
      if (s.trick !== 'none') tricks++;
      if (s.starAt >= 0) {
        stars++;
        expect(s.starAt).toBeGreaterThanOrEqual(0.35);
        expect(s.starAt).toBeLessThanOrEqual(0.95);
      }
      expect(Math.hypot(s.kickX, s.kickZ)).toBeLessThanOrEqual(SURPRISE.kickMax + SURPRISE.kickPerMetre * 18 + 1e-9);
    }
    expect(sup / n).toBeGreaterThan(0.13);
    expect(sup / n).toBeLessThan(0.2);
    expect(tricks / n).toBeGreaterThan(0.2);
    expect(stars / n).toBeGreaterThan(0.3);
  });

  it('no SUPER BOING at the top or on tiny bounces; a super is a real jump up', () => {
    const rng = makeRng(1);
    for (let i = 0; i < 500; i++) {
      expect(rollSurprise(rng, 45, 45).superBoing).toBe(false);
      expect(rollSurprise(rng, 2, 45).superBoing).toBe(false);
    }
    expect(superApex(10, 45)).toBe(16);
    expect(superApex(20, 45)).toBe(32);
    expect(superApex(40, 45)).toBe(45);
  });

  it('the random kick never takes a centred landing off the bed', () => {
    const rng = makeRng(99);
    const safeR = 9 * SURPRISE.safeShare;
    for (let i = 0; i < 2000; i++) {
      const lx = (rng() - 0.5) * 2 * safeR * 0.7;
      const lz = (rng() - 0.5) * 2 * safeR * 0.7;
      const T = 0.5 + rng() * 4;
      const kx = (rng() - 0.5) * 6;
      const kz = (rng() - 0.5) * 6;
      const k = keepOnBed(lx, lz, kx, kz, T, safeR);
      expect(Math.hypot(lx + k.kx * T, lz + k.kz * T)).toBeLessThanOrEqual(safeR + 1e-9);
    }
    // Already heading off (steered): the kick is dropped, the child's steering is left alone.
    expect(keepOnBed(8, 0, 1, 0, 2, safeR)).toEqual({ kx: 0, kz: 0 });
  });

  it('auto tricks make full turns and end upright', () => {
    for (const t of ['frontFlip', 'backFlip', 'cartwheel', 'twirl'] as const) {
      const end = autoTrickPose(t, 1);
      const turn = Math.abs(end.pitch) + Math.abs(end.roll) + Math.abs(end.yaw);
      expect(turn % (Math.PI * 2)).toBeCloseTo(0, 6);
      expect(turn).toBeGreaterThan(6);
      const start = autoTrickPose(t, 0);
      expect(Math.abs(start.pitch) + Math.abs(start.roll) + Math.abs(start.yaw)).toBe(0);
    }
  });
});
