import { describe, expect, it } from 'vitest';
import {
  AIM,
  aimForReticle,
  angleBetween,
  holdStep,
  nextTier,
  normalize,
  onTarget,
  orbitAt,
  orbitSpeed,
  reticleDirection,
  tolerance,
} from '../../src/activities/glasses/lineup/aim';
import type { V3 } from '../../src/activities/glasses/lineup/aim';
import type { GlassesTier } from '../../src/types';

const TIERS: GlassesTier[] = [1, 2, 3];
const DT = 1 / 60;
const TARGETS: V3[] = [
  normalize({ x: 0, y: 0.25, z: -1 }),
  normalize({ x: 0.4, y: 0.1, z: -1 }),
  normalize({ x: -0.6, y: 0.35, z: -0.7 }),
  normalize({ x: 1, y: 0.05, z: 0.2 }),
];

/** Simulate `seconds` with an aimer; returns the time of the pop or null. */
function run(tier: GlassesTier, target: V3, aimer: 'centre' | 'reticle', seconds: number, start = 0): number | null {
  let clock = start;
  let hold = 0;
  for (let t = 0; t < seconds; t += DT) {
    clock += DT * orbitSpeed(tier);
    const off = orbitAt(clock);
    const forward = aimer === 'centre' ? target : aimForReticle(target, off);
    const r = reticleDirection(forward, off);
    hold = holdStep(hold, onTarget(r, target, tier), DT);
    if (hold >= AIM.holdSeconds) return t + DT;
  }
  return null;
}

describe('line-up aiming', () => {
  it('the offset stays 4°–7° from the centre, on the upper arc, never near zero', () => {
    for (let c = 0; c < 400; c += 0.13) {
      const o = orbitAt(c);
      expect(o.theta).toBeGreaterThanOrEqual(AIM.thetaMin - 1e-9);
      expect(o.theta).toBeLessThanOrEqual(AIM.thetaMax + 1e-9);
      expect(o.phi).toBeGreaterThanOrEqual(AIM.phiMin - 1e-9);
      expect(o.phi).toBeLessThanOrEqual(AIM.phiMax + 1e-9);
      for (const f of TARGETS) {
        const a = angleBetween(f, reticleDirection(f, o));
        expect(a).toBeCloseTo(o.theta, 6);
      }
    }
  });

  it('an aimer that keeps a bubble exactly at the screen centre never pops it, at any tier', () => {
    for (const tier of TIERS) for (const t of TARGETS) for (const start of [0, 7.3, 21]) expect(run(tier, t, 'centre', 60, start)).toBeNull();
  });

  it('an aimer that puts the reticle on a bubble pops it in 1 s, at every tier', () => {
    for (const tier of TIERS)
      for (const t of TARGETS) {
        const at = run(tier, t, 'reticle', 5);
        expect(at).not.toBeNull();
        expect(at!).toBeGreaterThanOrEqual(AIM.holdSeconds - 1e-9);
        expect(at!).toBeLessThanOrEqual(AIM.holdSeconds + 2 * DT);
      }
  });

  it('tolerance tightens and the orbit speeds up with the tier; tolerance < the smallest offset', () => {
    expect(tolerance(1)).toBeGreaterThan(tolerance(2));
    expect(tolerance(2)).toBeGreaterThan(tolerance(3));
    expect(orbitSpeed(1)).toBeLessThan(orbitSpeed(2));
    expect(orbitSpeed(2)).toBeLessThan(orbitSpeed(3));
    expect(tolerance(1)).toBeLessThan(AIM.thetaMin - 0.5 * (Math.PI / 180));
  });

  it('a reticle just outside the tolerance does not count, just inside does', () => {
    const f = TARGETS[0];
    for (const tier of TIERS) {
      const inside = reticleDirection(f, { theta: tolerance(tier) * 0.95, phi: 1 });
      const outside = reticleDirection(f, { theta: tolerance(tier) * 1.05, phi: 1 });
      expect(onTarget(inside, f, tier)).toBe(true);
      expect(onTarget(outside, f, tier)).toBe(false);
    }
  });

  it('hold fills on target, drains off target, never below zero', () => {
    let h = 0;
    for (let i = 0; i < 30; i++) h = holdStep(h, true, DT);
    expect(h).toBeCloseTo(0.5, 6);
    h = holdStep(h, false, 0.1);
    expect(h).toBeCloseTo(0.5 - AIM.holdDecay * 0.1, 6);
    expect(holdStep(0.05, false, 1)).toBe(0);
  });

  it('tier ladder: two pops climb, a miss drops, within 1..3', () => {
    let s = { tier: 1 as GlassesTier, streak: 0 };
    s = nextTier(s, true);
    expect(s).toEqual({ tier: 1, streak: 1 });
    s = nextTier(s, true);
    expect(s.tier).toBe(2);
    s = nextTier(nextTier(s, true), true);
    expect(s.tier).toBe(3);
    s = nextTier(nextTier(s, true), true);
    expect(s.tier).toBe(3);
    s = nextTier(s, false);
    expect(s).toEqual({ tier: 2, streak: 0 });
    expect(nextTier({ tier: 1, streak: 1 }, false)).toEqual({ tier: 1, streak: 0 });
  });
});
