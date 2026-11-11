import { describe, expect, it } from 'vitest';
import { angleDelta, clampAbs, springStep, toBodyFrame } from '../../src/core/characters/wobble-math';

describe('wobble springs', () => {
  it('lags against a steady push, overshoots once released, then settles to rest', () => {
    const s = { x: 0, v: 0 };
    for (let i = 0; i < 60; i++) springStep(s, 20, 10, 0.25, 1 / 60, 0.5);
    expect(s.x).toBeGreaterThan(0.1);
    let min = Infinity;
    for (let i = 0; i < 30; i++) min = Math.min(min, springStep(s, 0, 10, 0.25, 1 / 60, 0.5));
    expect(min).toBeLessThan(0); // the wobble swings past centre
    for (let i = 0; i < 300; i++) springStep(s, 0, 10, 0.25, 1 / 60, 0.5);
    expect(Math.abs(s.x)).toBeLessThan(1e-3);
  });

  it('stays bounded and finite for huge forces, long frames and bad input', () => {
    const s = { x: 0, v: 0 };
    for (const [f, dt] of [[1e6, 1 / 60], [-1e6, 0.5], [NaN, 1 / 60], [5, 0], [5, -1], [Infinity, 1 / 30]] as const) {
      springStep(s, f, 11, 0.24, dt, 0.45);
      expect(Number.isFinite(s.x)).toBe(true);
      expect(Math.abs(s.x)).toBeLessThanOrEqual(0.45);
    }
  });

  it('body frame: forward is forward whatever the yaw', () => {
    for (const yaw of [0, 1, -2.5, 3]) {
      const f = toBodyFrame(Math.sin(yaw) * 3, Math.cos(yaw) * 3, yaw);
      expect(f.fwd).toBeCloseTo(3, 6);
      expect(f.side).toBeCloseTo(0, 6);
    }
  });

  it('helpers', () => {
    expect(clampAbs(100, 45)).toBe(45);
    expect(clampAbs(-100, 45)).toBe(-45);
    expect(clampAbs(NaN, 45)).toBe(0);
    expect(angleDelta(0.1, Math.PI * 2 - 0.1)).toBeCloseTo(0.2, 6);
  });
});
